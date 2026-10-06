import { useMemo } from "react";
import { useApp, type PayloadView, type Tab } from "../state";
import { b64ToBytes, bytes, copyText, n, partitionColor, stamp, valueBytes } from "../lib/format";
import { hexRows, jsonLines, xmlLines, type Line } from "../lib/highlight";
import { exportMessages, saveValue } from "../lib/transfer";
import { controlSummary, segments } from "../lib/control";
import type { KMessage } from "../lib/types";
import { resendDraft, visibleMessages } from "./MessagesView";
import { Icon, Segmented } from "./ui";

export default function DetailPanel({ tab }: { tab: Tab }) {
  const v = useApp((s) => s.views[tab.id]);
  const showCtl = useApp((s) => s.settings.showControlChars);
  const saveSettings = useApp((s) => s.saveSettings);
  const { patchView, setOverlay, showToast } = useApp.getState();
  const m = v?.messages.find((x) => x.id === v.selected);

  const view: PayloadView = useMemo(() => {
    if (!m) return "text";
    const ok = (p: PayloadView) => p === "hex" || (p === "text" && m.value != null) || p === m.kind;
    if (v.pview && ok(v.pview)) return v.pview;
    return m.kind === "binary" ? "hex" : m.kind === "null" ? "text" : m.kind;
  }, [m, v?.pview]);

  const codeLines: Line[] | null = useMemo(() => {
    if (!m?.value) return null;
    if (view === "json") {
      try {
        return jsonLines(JSON.parse(m.value));
      } catch {
        return null;
      }
    }
    if (view === "xml") return xmlLines(m.value);
    return null;
  }, [m, view]);

  const hex = useMemo(() => (m && view === "hex" ? hexRows(valueBytes(m)) : []), [m, view]);

  if (!v || !m) return null;
  const topic = tab.topic!;
  const list = visibleMessages(v);
  const idx = list.findIndex((x) => x.id === m.id);
  const go = (d: number) => {
    const next = list[idx + d];
    if (next) patchView(tab.id, { selected: next.id });
  };
  const chips = [
    `Partition ${m.partition}`, `Offset ${m.offset}`, bytes(m.size), m.timestampType,
    m.tombstone ? "Tombstone" : null, m.truncated ? "Truncated" : null,
  ].filter(Boolean) as string[];

  const copy = (text: string, what: string) => {
    void copyText(text);
    showToast({ tone: "ok", title: `${what} copied` });
  };

  return (
    <aside style={{ width: 480, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--panel)", borderLeft: "1px solid var(--line)" }}>
      <div style={{ height: 40, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 16px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: partitionColor(m.partition) }} />
        <span style={{ fontWeight: 600 }}>Message</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>p{m.partition} · #{m.offset}</span>
        <span style={{ fontSize: 12, color: "var(--faint)" }}>{idx + 1} of {n(list.length)}</span>
        <div className="spacer" />
        <button className="icon-btn sm" title="Previous (↑)" disabled={idx <= 0} onClick={() => go(-1)}><Icon name="ph-caret-up" /></button>
        <button className="icon-btn sm" title="Next (↓)" disabled={idx >= list.length - 1} onClick={() => go(1)}><Icon name="ph-caret-down" /></button>
        <button className="icon-btn sm" title="Close" onClick={() => patchView(tab.id, { detailClosed: true })}><Icon name="ph-x" /></button>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)" }}>
        <IdLine label="KEY" value={m.key ?? (m.keyBase64 ? `base64 ${m.keyBase64}` : "null")} faint={m.key == null} onCopy={() => copy(m.key ?? m.keyBase64 ?? "", "Key")} />
        <IdLine label="TIME" value={`${stamp(m.timestamp)}  (${m.timestamp})`} onCopy={() => copy(String(m.timestamp), "Timestamp")} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
          {chips.map((c) => <span key={c} className="chip">{c}</span>)}
        </div>
      </div>

      <div style={{ height: 36, flex: "none", display: "flex", gap: 2, padding: "0 8px", borderBottom: "1px solid var(--line)" }}>
        {([["value", "Value", ""], ["key", "Key", ""], ["headers", "Headers", String(m.headers.length)]] as const).map(([k, label, count]) => (
          <div key={k} onClick={() => patchView(tab.id, { detailTab: k })} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "0 10px", cursor: "pointer", color: v.detailTab === k ? "var(--text)" : "var(--muted)", fontSize: 12.5, fontWeight: 500 }}>
            <span>{label}</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>{count}</span>
            <div style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, background: v.detailTab === k ? "var(--accent)" : "transparent" }} />
          </div>
        ))}
      </div>

      {v.detailTab === "value" && (
        <>
          <div style={{ height: 40, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
            <div style={{ background: "var(--bg)", borderRadius: 6 }}>
              <Segmented<PayloadView>
                mono
                value={view}
                onChange={(p) => patchView(tab.id, { pview: p })}
                options={[
                  { value: "text", label: "Text", disabled: m.value == null },
                  { value: "json", label: "JSON", disabled: m.kind !== "json" },
                  { value: "xml", label: "XML", disabled: m.kind !== "xml" },
                  { value: "hex", label: "Hex", disabled: m.tombstone },
                ]}
              />
            </div>
            <button
              className="icon-btn sm"
              title={showCtl ? "Hide control characters" : "Show control characters (CR, LF, SOH, STX, ETX…)"}
              onClick={() => void saveSettings({ showControlChars: !showCtl })}
              disabled={m.value == null}
              style={showCtl ? { color: "var(--accent)", background: "var(--accent-bg)" } : undefined}
            >
              <Icon name="ph-paragraph" />
            </button>
            <div className="spacer" />
            <span className="mono" style={{ fontSize: 11, color: "var(--faint)", flex: "none" }}>{m.kind === "binary" ? "binary" : m.kind === "null" ? "null" : "UTF-8"}</span>
            <button className="icon-btn sm" title={m.kind === "json" ? "Copy value (formatted)" : "Copy value"} disabled={m.tombstone} onClick={() => copy(m.kind === "json" ? JSON.stringify(JSON.parse(m.value!), null, 2) : m.value ?? m.valueBase64 ?? "", "Value")}><Icon name="ph-copy" /></button>
            <button className="icon-btn sm" title="Save to file" disabled={m.tombstone} onClick={() => void saveValue(m)}><Icon name="ph-floppy-disk" /></button>
          </div>
          {showCtl && m.value != null && view === "text" && (
            <div className="mono ellipsis" style={{ margin: "0 12px 8px", fontSize: 11, color: "var(--muted)" }} title={controlSummary(m.value)}>
              <span style={{ color: "var(--faint)" }}>Control characters: </span>{controlSummary(m.value)}
            </div>
          )}
          {m.truncated && (
            <div style={{ margin: "0 12px 8px", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="ph-scissors" color="var(--warn)" />Showing the first {bytes(valueBytes(m).length)} of {bytes(m.size)}.
            </div>
          )}
          <div className="mono" style={{ flex: 1, minHeight: 0, overflow: "auto", margin: "0 12px 12px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 0", fontSize: 12, lineHeight: 1.65 }}>
            {m.tombstone
              ? <div style={{ padding: "0 14px", color: "var(--faint)" }}>null — a tombstone (deletes the key on compacted topics)</div>
              : <ValueBody m={m} view={view} code={codeLines} hex={hex} showCtl={showCtl} />}
          </div>
        </>
      )}

      {v.detailTab === "key" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
          <div className="mono" style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {m.key != null ? m.key : m.keyBase64 ? hexRows(b64ToBytes(m.keyBase64)).map((r) => `${r.off}  ${r.hex}  ${r.asc}`).join("\n") : <span style={{ color: "var(--faint)" }}>null — no key (the producer's partitioner picked the partition)</span>}
          </div>
          {m.key != null && <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--faint)" }}>{new TextEncoder().encode(m.key).length} bytes · UTF-8</div>}
        </div>
      )}

      {v.detailTab === "headers" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <div className="col-head" style={{ display: "grid", gridTemplateColumns: "170px minmax(0,1fr) 22px", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
            <span>NAME</span><span>VALUE</span><span />
          </div>
          {m.headers.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: "var(--muted)" }}>This message has no headers.</div>}
          {m.headers.map((h, i) => (
            <div key={`${h.key}-${i}`} className="mono hoverable" style={{ display: "grid", gridTemplateColumns: "170px minmax(0,1fr) 22px", gap: 10, padding: "6px 16px", borderBottom: "1px solid var(--line-soft)", fontSize: 11.5, lineHeight: 1.5 }}>
              <span className="ellipsis" style={{ color: "var(--syn-key)" }} title={h.key}>{h.key}</span>
              <span style={{ wordBreak: "break-all", color: h.value == null ? "var(--faint)" : "var(--text)" }}>{h.value ?? "null"}</span>
              <i className="ph-light ph-copy" title="Copy value" onClick={() => copy(h.value ?? "", `Header ${h.key}`)} style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} />
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderTop: "1px solid var(--line)" }}>
        <button className="btn" onClick={() => setOverlay({ kind: "produce", connId: tab.connId, topic, draft: resendDraft(m) })}><Icon name="ph-repeat" />Copy &amp; resend</button>
        <button className="btn" onClick={() => void exportMessages(topic, [m])}><Icon name="ph-export" />Export</button>
      </div>
    </aside>
  );
}

function IdLine({ label, value, faint, onCopy }: { label: string; value: string; faint?: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr) 22px", gap: 8, alignItems: "start" }}>
      <span className="col-head" style={{ paddingTop: 2 }}>{label}</span>
      <span className="mono" style={{ fontSize: 11.5, lineHeight: 1.5, wordBreak: "break-all", color: faint ? "var(--faint)" : "var(--text)", maxHeight: 54, overflow: "hidden" }}>{value}</span>
      <i className="ph-light ph-copy" title="Copy" onClick={onCopy} style={{ fontSize: 14, color: "var(--muted)", cursor: "pointer", paddingTop: 2 }} />
    </div>
  );
}

function ValueBody({ m, view, code, hex, showCtl }: { m: KMessage; view: PayloadView; code: Line[] | null; hex: ReturnType<typeof hexRows>; showCtl: boolean }) {
  if (view === "hex") {
    const total = Math.ceil(valueBytes(m).length / 16);
    return (
      <>
        {hex.map((r) => (
          <div key={r.off} style={{ display: "flex", gap: 10, padding: "0 8px", fontSize: 10, whiteSpace: "pre" }}>
            <span style={{ color: "var(--faint)" }}>{r.off}</span><span>{r.hex}</span><span style={{ color: "var(--muted)" }}>{r.asc}</span>
          </div>
        ))}
        {total > hex.length && <div style={{ padding: "6px 12px", color: "var(--faint)", fontSize: 11.5 }}>… {n(total - hex.length)} more rows — save to file for the rest</div>}
      </>
    );
  }
  if ((view === "json" || view === "xml") && code) {
    return (
      <>
        {code.map((ln) => (
          <div key={ln.n} style={{ display: "flex" }}>
            <span style={{ width: 34, flex: "none", textAlign: "right", paddingRight: 14, color: "var(--faint)", userSelect: "none" }}>{ln.n}</span>
            <span style={{ whiteSpace: "pre" }}>{ln.toks.map((t, i) => <span key={i} style={{ color: t.c }}>{t.t}</span>)}</span>
          </div>
        ))}
      </>
    );
  }
  if (showCtl && m.value) return <ControlText text={m.value} />;
  return <div style={{ padding: "0 14px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{m.value ?? ""}</div>;
}

/** Text with every control character drawn as a small labelled marker; line breaks follow LF (or a lone CR). */
function ControlText({ text }: { text: string }) {
  const segs = useMemo(() => segments(text), [text]);
  return (
    <div style={{ padding: "0 14px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      {segs.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.text}</span>;
        // Line endings and tabs are common and quiet; framing characters (SOH, STX…) stand out.
        const quiet = s.lineEnd || s.code === 9;
        return (
          <span key={i}>
            <span
              title={`${s.name} (0x${s.code.toString(16).padStart(2, "0").toUpperCase()})`}
              style={{
                display: "inline-block", font: "600 9px/14px 'JetBrains Mono', monospace", padding: "0 3px", margin: "0 1px", borderRadius: 3,
                verticalAlign: 1, letterSpacing: ".02em",
                color: quiet ? "var(--faint)" : "var(--warn)",
                background: quiet ? "var(--raised)" : "var(--warn-bg)",
                border: `1px solid ${quiet ? "var(--line2)" : "var(--warn)"}`,
              }}
            >
              {s.name}
            </span>
            {s.breakAfter ? "\n" : ""}
          </span>
        );
      })}
    </div>
  );
}
