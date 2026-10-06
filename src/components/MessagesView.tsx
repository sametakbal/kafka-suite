import { useEffect, useMemo, useRef, useState } from "react";
import { connOf, useApp, type ProduceDraft, type SortOrder, type Tab, type TopicView } from "../state";
import { bytes, clock, copyText, n, partitionColor, stamp } from "../lib/format";
import { compileQuery, matchesQuery, type CompiledQuery } from "../lib/query";
import { exportMessages } from "../lib/transfer";
import { withControlPictures } from "../lib/control";
import type { KMessage } from "../lib/types";
import ErrorView from "./ErrorView";
import { Checkbox, Empty, Icon, Segmented, Spinner, Switch } from "./ui";

/** Messages passing the query, in the chosen order. */
export function visibleMessages(v: TopicView, q: CompiledQuery = compileQuery(v.query)): KMessage[] {
  const shown = v.messages.filter((m) => matchesQuery(q, m.value, m.key));
  return v.sort === "newest" ? shown : shown.reverse();
}

/** Draft for "Copy & resend": same key, value and headers; the partition is left to the partitioner. */
export function resendDraft(m: KMessage): Partial<ProduceDraft> {
  return {
    value: m.value ?? "",
    valueBase64: m.value == null && m.valueBase64 ? m.valueBase64 : undefined,
    fileName: m.value == null && m.valueBase64 ? `p${m.partition}-${m.offset}.bin` : undefined,
    key: m.key ?? "",
    headers: m.headers.map((h) => ({ key: h.key, value: h.value ?? "" })),
    partition: null,
    count: 1,
  };
}

const EXAMPLES = [
  ["profile.age > 25 and username = \"johndoe\"", "compare nested fields"],
  ["languages contains \"Python\"", "array or substring"],
  ["roles[0].roleName = Admin", "array index"],
  ["phoneNumber is not null", "null checks"],
  ["not (isActive = true)", "negate, group with ( )"],
  ["timeout", "no operator: free text in key and value"],
];

export default function MessagesView({ tab }: { tab: Tab }) {
  const v = useApp((s) => s.views[tab.id]);
  const conn = useApp((s) => connOf(s, tab.connId));
  const limit = useApp((s) => s.settings.messageLimit);
  const buffer = useApp((s) => s.settings.liveBuffer);
  const showCtl = useApp((s) => s.settings.showControlChars);
  const { patchView, refreshMessages, startLive, stopLive, setOverlay } = useApp.getState();
  const [helpOpen, setHelpOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const query = useMemo(() => compileQuery(v?.query ?? ""), [v?.query]);
  const visible = useMemo(() => (v ? visibleMessages(v, query) : []), [v, query]);

  // New live messages: keep the newest end in view, as the live stream did in 1.x.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !v?.live || !v.liveCount) return;
    if (v.sort === "newest") el.scrollTop = 0;
    else el.scrollTop = el.scrollHeight;
  }, [v?.liveCount, v?.live, v?.sort]);

  // ↑/↓ moves the selection, space toggles the checkbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!v || useApp.getState().overlay) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
      const i = visible.findIndex((m) => m.id === v.selected);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) {
          patchView(tab.id, { selected: next.id, detailClosed: false });
          listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === " " && v.selected) {
        e.preventDefault();
        toggleCheck(v.selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!v || !conn) return null;
  const topic = tab.topic!;

  const toggleCheck = (id: string) =>
    patchView(tab.id, (cur) => {
      const checked = { ...cur.checked };
      if (checked[id]) delete checked[id];
      else checked[id] = true;
      return { checked };
    });
  const checkedIds = Object.keys(v.checked);
  const nChecked = checkedIds.length;
  const allVisibleChecked = visible.length > 0 && visible.every((m) => v.checked[m.id]);
  const toggleAll = () =>
    patchView(tab.id, (cur) => {
      const checked = { ...cur.checked };
      for (const m of visible) {
        if (allVisibleChecked) delete checked[m.id];
        else checked[m.id] = true;
      }
      return { checked };
    });
  const checkedMsgs = v.messages.filter((m) => v.checked[m.id]);

  if (v.error && !v.messages.length && !v.live) {
    return <ErrorView connId={tab.connId} error={v.error} onRetry={() => void refreshMessages(tab.id)} topic={topic} />;
  }

  const isEmpty = !v.loading && v.messages.length === 0;
  const filtering = query.type !== "empty";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {v.live ? (
        <div style={{ height: 34, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "var(--ok-bg)", borderBottom: "1px solid var(--ok-line)" }}>
          <span className="mono" style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, height: 20, padding: "0 8px", borderRadius: 4, background: "var(--ok)", color: "var(--accent-ink)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-ink)", animation: "kspulse 1.2s infinite" }} />LIVE
          </span>
          <span className="ellipsis" style={{ flex: 1, fontSize: 12.5 }}>Streaming new messages as they arrive — no consumer group, nothing committed</span>
          <span className="mono" style={{ flex: "none", fontSize: 11.5, color: "var(--muted)" }}>
            {n(v.liveCount)} new · buffer {v.messages.length}/{buffer}
          </span>
          <div style={{ width: 1, height: 16, background: "var(--ok-line)" }} />
          <button className="btn xs" onClick={() => void stopLive(tab.id)}><Icon name="ph-stop" />Stop</button>
        </div>
      ) : (
        <div style={{ height: 34, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "var(--accent-bg)", borderBottom: "1px solid var(--accent-line)" }}>
          <span className="mono" style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, height: 20, padding: "0 8px", borderRadius: 4, background: "var(--accent)", color: "var(--accent-ink)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em" }}>
            <Icon name="ph-eye" size={13} />LATEST {limit}
          </span>
          <span className="ellipsis" style={{ flex: 1, fontSize: 12.5 }}>Read-only — the newest messages across all partitions, no consumer group</span>
          <span className="mono" style={{ flex: "none", fontSize: 11.5, color: "var(--muted)" }}>
            {topic}{v.partitions ? ` · ${v.partitions} partition${v.partitions === 1 ? "" : "s"}` : ""}
          </span>
          <div style={{ width: 1, height: 16, background: "var(--accent-line)" }} />
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }} onClick={() => !v.liveStarting && void startLive(tab.id)}>
            {v.liveStarting ? <Spinner size={13} /> : <Switch on={false} onChange={() => void startLive(tab.id)} />}
            <span>Live</span>
          </div>
        </div>
      )}

      <div style={{ position: "relative", minHeight: 44, flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: "1px solid var(--line)" }}>
        <div className={`input on-panel${query.type === "error" ? " invalid" : ""}`} style={{ flex: "1 1 280px", minWidth: 280, maxWidth: 560, padding: "0 6px 0 9px", gap: 7, fontSize: 12 }}>
          <Icon name="ph-funnel-simple" size={14} color={filtering ? "var(--accent)" : "var(--faint)"} />
          <input
            className="mono"
            style={{ fontSize: 12 }}
            value={v.query}
            onChange={(e) => patchView(tab.id, { query: e.target.value })}
            placeholder='Filter — text, or profile.age > 25 and username = "johndoe"'
            spellCheck={false}
          />
          {v.query && <span className="input-btn" style={{ border: "none", background: "transparent", color: "var(--faint)" }} onClick={() => patchView(tab.id, { query: "" })}><Icon name="ph-x" size={12} /></span>}
          <span className="input-btn" title="Query syntax" onClick={() => setHelpOpen((x) => !x)}>?</span>
        </div>
        {helpOpen && <QueryHelp onPick={(q) => { patchView(tab.id, { query: q }); setHelpOpen(false); }} onClose={() => setHelpOpen(false)} />}
        <span className="mono" style={{ fontSize: 11.5, color: query.type === "error" ? "var(--err)" : "var(--muted)", flex: "none", maxWidth: 260 }} title={query.type === "error" ? query.message : undefined}>
          {query.type === "error" ? <span className="ellipsis" style={{ display: "block" }}>{query.message}</span>
            : filtering ? `${n(visible.length)} of ${n(v.messages.length)} match` : ""}
        </span>
        <div className="spacer" />
        <div style={{ background: "var(--bg)", borderRadius: 6 }}>
          <Segmented<SortOrder> value={v.sort} onChange={(sort) => patchView(tab.id, { sort })} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
        </div>
        <div className="vsep" />
        {nChecked > 0 && <span style={{ fontSize: 12, flex: "none" }}>{nChecked} selected</span>}
        <div style={{ display: "flex", gap: 2, opacity: nChecked ? 1 : 0.4, pointerEvents: nChecked ? "auto" : "none" }}>
          <button className="icon-btn" title="Copy values" onClick={() => { void copyText(checkedMsgs.map((m) => m.value ?? "").join("\n")); useApp.getState().showToast({ tone: "ok", title: `Copied ${nChecked} value${nChecked === 1 ? "" : "s"}` }); }}><Icon name="ph-copy" /></button>
          <button className="icon-btn" title="Export selected (JSON)" onClick={() => void exportMessages(topic, checkedMsgs)}><Icon name="ph-export" /></button>
          <button className="btn ghost" style={{ color: "var(--text)", fontWeight: 400, fontSize: 12, padding: "0 9px" }} onClick={() => checkedMsgs[0] && setOverlay({ kind: "produce", connId: conn.id, topic, draft: resendDraft(checkedMsgs[0]) })}>
            <Icon name="ph-repeat" color="var(--muted)" />Copy &amp; resend
          </button>
        </div>
        <div className="vsep" />
        <button className="btn" style={{ fontSize: 12 }} onClick={() => void refreshMessages(tab.id)} disabled={v.live || v.loading} title={v.live ? "Stop the live tail to read the latest messages again" : undefined}>
          {v.loading ? <Spinner /> : <Icon name="ph-arrows-clockwise" />}Refresh
        </button>
        <button className="btn primary" style={{ fontSize: 12 }} onClick={() => setOverlay({ kind: "produce", connId: conn.id, topic })}>
          <Icon name="ph-paper-plane-tilt" />Produce
        </button>
      </div>

      <div className="msg-grid col-head" style={{ height: 30, flex: "none", borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
        <span />
        <span style={{ display: "grid", placeItems: "center", cursor: "pointer", height: "100%" }} onClick={toggleAll}>
          <Checkbox on={allVisibleChecked} mixed={!allVisibleChecked && visible.some((m) => v.checked[m.id])} />
        </span>
        <span style={{ textAlign: "right", paddingRight: 12 }}>OFFSET</span>
        <span>PART</span>
        <span>KEY</span>
        <span style={{ color: "var(--text)" }}>TIMESTAMP {v.sort === "newest" ? "↓" : "↑"}</span>
        <span style={{ textAlign: "right", paddingRight: 12 }}>SIZE</span>
        <span>VALUE</span>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {v.loading && !v.messages.length && <Skeleton />}
        {isEmpty && v.live && (
          <Empty icon="ph-broadcast" title="Waiting for new messages…">
            Messages produced to {topic} from now on appear here. The newest {buffer} are kept.
          </Empty>
        )}
        {isEmpty && !v.live && (
          <Empty
            icon="ph-tray"
            title={`${topic} is empty`}
            actions={
              <>
                <button className="btn primary" onClick={() => setOverlay({ kind: "produce", connId: conn.id, topic })}><Icon name="ph-paper-plane-tilt" />Produce message</button>
                <button className="btn" onClick={() => void startLive(tab.id)}><Icon name="ph-broadcast" />Go live</button>
              </>
            }
          >
            No messages are retained in any partition{v.loadedAt ? ` (read at ${clock(v.loadedAt)})` : ""}. Go live to watch for new ones.
          </Empty>
        )}
        {!isEmpty && visible.length === 0 && !v.loading && (
          <Empty icon="ph-funnel-simple" title="No messages match">
            {n(v.messages.length)} loaded message{v.messages.length === 1 ? "" : "s"} hidden by the filter.
          </Empty>
        )}
        {visible.map((m) => (
          <Row key={m.id} m={m} v={v} showCtl={showCtl} onSelect={() => patchView(tab.id, { selected: m.id, detailClosed: false })} onCheck={() => toggleCheck(m.id)} />
        ))}
      </div>

      <div style={{ height: 36, flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderTop: "1px solid var(--line)", background: "var(--panel)", fontSize: 12, color: "var(--muted)" }}>
        {v.loading && <Spinner />}
        <span>
          {v.loading ? `Reading the latest ${limit} messages of ${topic}…`
            : v.live ? `${n(v.messages.length)} in buffer · ${n(v.liveCount)} received since live started`
            : isEmpty ? "No messages"
            : `${n(v.messages.length)} message${v.messages.length === 1 ? "" : "s"}${filtering && query.type !== "error" ? ` · ${n(visible.length)} match` : ""}`}
        </span>
        {!v.complete && !v.live && <span style={{ color: "var(--warn)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="ph-hourglass" />Read stopped at the time limit — some partitions may be missing</span>}
        {v.error && v.messages.length > 0 && <span style={{ color: "var(--err)" }}>{v.error.name}</span>}
        <div className="spacer" />
        <span>{v.live ? `Live buffer ${buffer}` : `Latest ${limit}`} · {v.sort === "newest" ? "newest first" : "oldest first"}</span>
      </div>
    </div>
  );
}

function Row({ m, v, showCtl, onSelect, onCheck }: { m: KMessage; v: TopicView; showCtl: boolean; onSelect: () => void; onCheck: () => void }) {
  const sel = m.id === v.selected;
  const ck = !!v.checked[m.id];
  const value = m.tombstone ? "null (tombstone)" : m.preview == null ? `binary · ${bytes(m.size)}` : showCtl && m.value != null ? withControlPictures(m.value.slice(0, 300)) : m.preview;
  return (
    <div
      data-id={m.id}
      className={`msg-grid msg-row${v.fresh[m.id] ? " fresh" : ""}`}
      onClick={onSelect}
      style={{ background: sel ? "var(--sel)" : ck ? "var(--checked)" : undefined }}
    >
      <span style={{ height: "100%", background: partitionColor(m.partition) }} title={`Partition ${m.partition}`} />
      <div onClick={(e) => { e.stopPropagation(); onCheck(); }} style={{ display: "grid", placeItems: "center", height: "100%", cursor: "pointer" }}>
        <Checkbox on={ck} />
      </div>
      <span style={{ textAlign: "right", paddingRight: 12, color: sel ? "var(--accent)" : "var(--text)" }}>{m.offset}</span>
      <span style={{ color: partitionColor(m.partition) }}>{m.partition}</span>
      <span className="ellipsis" style={{ color: m.key == null ? "var(--faint)" : "var(--syn-key)" }} title={m.key ?? undefined}>{m.key ?? (m.keyBase64 ? "binary" : "null")}</span>
      <span style={{ color: "var(--muted)" }}>{stamp(m.timestamp)}</span>
      <span style={{ textAlign: "right", paddingRight: 12, color: "var(--muted)" }}>{bytes(m.size)}</span>
      <span className="ellipsis" style={{ color: m.preview == null ? "var(--faint)" : "var(--muted)", fontSize: 11 }}>
        {m.headers.length > 0 && <span style={{ color: "var(--faint)", marginRight: 8 }} title={m.headers.map((h) => `${h.key}: ${h.value ?? "null"}`).join("\n")}><Icon name="ph-tag" size={11} /> {m.headers.length}</span>}
        {value}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="msg-grid" style={{ height: 28, borderBottom: "1px solid var(--line-soft)", opacity: Math.max(0.15, 1 - i * 0.06) }}>
          <span />
          <span className="skel" style={{ justifySelf: "center", width: 13, height: 13, borderRadius: 3 }} />
          <span className="skel" style={{ justifySelf: "end", marginRight: 12, width: 34 }} />
          <span className="skel" style={{ width: 12 }} />
          <span className="skel" style={{ width: 70 + ((i * 37) % 60) }} />
          <span className="skel" style={{ width: 140 }} />
          <span className="skel" style={{ justifySelf: "end", marginRight: 12, width: 34 }} />
          <span className="skel" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
        </div>
      ))}
    </>
  );
}

function QueryHelp({ onPick, onClose }: { onPick: (q: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => window.addEventListener("mousedown", onDown));
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div ref={ref} className="popover" style={{ top: 44, left: 12, width: 520, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Queries run on JSON values. Operators: <span className="mono">= != &gt; &gt;= &lt; &lt;=</span>, <span className="mono">contains</span>, <span className="mono">exists</span>, <span className="mono">is [not] null</span>, <span className="mono">and</span> / <span className="mono">or</span> / <span className="mono">not</span>. Text compares ignore case.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {EXAMPLES.map(([q, note]) => (
          <div key={q} className="menu-item" onClick={() => onPick(q)}>
            <span className="mono ellipsis" style={{ fontSize: 12, color: "var(--syn-key)" }}>{q}</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--faint)", flex: "none" }}>{note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
