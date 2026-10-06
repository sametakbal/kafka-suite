import { useMemo, useState } from "react";
import { useApp } from "../../state";
import { n } from "../../lib/format";
import { Icon, StatusDot } from "../ui";
import { draftConnId, sendDraft } from "../../lib/drafts";

interface Item {
  key: string;
  icon: string;
  label: string;
  meta: string;
  run: () => void;
}

/** Ctrl+K: jump to topics of connected clusters, clusters, drafts, or loaded messages by key. */
export default function CommandPalette() {
  const connections = useApp((s) => s.connections);
  const status = useApp((s) => s.status);
  const tabs = useApp((s) => s.tabs);
  const views = useApp((s) => s.views);
  const drafts = useApp((s) => s.templates);
  const { openMessages, openTopics, setOverlay, patchView, activate } = useApp.getState();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: Item[] = [];
    const close = (fn: () => void) => () => {
      setOverlay(null);
      fn();
    };
    for (const t of drafts) {
      if (!t.topic || (query && !t.name.toLowerCase().includes(query) && !t.topic.toLowerCase().includes(query))) continue;
      // PROD targets open in Produce message instead of sending straight away.
      const cid = draftConnId(t);
      const prod = connections.find((c) => c.id === cid)?.env === "PROD";
      out.push({
        key: `draft/${t.name}`, icon: prod ? "ph-note-pencil" : "ph-paper-plane-tilt", label: prod ? `Open draft ${t.name}` : `Send draft ${t.name}`, meta: `→ ${t.topic}${prod ? " · PROD" : ""}`,
        run: close(() => (prod && cid ? setOverlay({ kind: "produce", connId: cid, topic: t.topic!, draftName: t.name }) : void sendDraft(t))),
      });
    }
    for (const c of connections) {
      const st = status[c.id];
      for (const t of st?.topics ?? []) {
        if (t.internal && !query.startsWith("__")) continue;
        if (query && !t.name.toLowerCase().includes(query)) continue;
        out.push({ key: `${c.id}/${t.name}`, icon: "ph-rows", label: t.name, meta: `${c.name}${t.messages != null ? ` · ${n(t.messages)}` : ""}`, run: close(() => openMessages(c.id, t.name)) });
      }
      if (!query || c.name.toLowerCase().includes(query) || c.bootstrap.toLowerCase().includes(query)) {
        out.push({ key: c.id, icon: "ph-hard-drives", label: c.name, meta: c.bootstrap, run: close(() => openTopics(c.id)) });
      }
      // A topic typed by hand, e.g. one this user may read but not list.
      if (query.length > 1 && st?.state === "connected" && !(st.topics ?? []).some((x) => x.name.toLowerCase() === query) && /^[a-zA-Z0-9._-]+$/.test(q.trim())) {
        out.push({ key: `${c.id}/open/${query}`, icon: "ph-eye", label: `Open ${q.trim()}`, meta: c.name, run: close(() => openMessages(c.id, q.trim())) });
      }
    }
    if (query.length >= 3) {
      for (const t of tabs) {
        for (const m of views[t.id]?.messages ?? []) {
          if (m.key?.toLowerCase().includes(query)) {
            out.push({
              key: `${t.id}/${m.id}`, icon: "ph-envelope-simple", label: m.key, meta: `p${m.partition} #${m.offset} in ${t.topic}`,
              run: close(() => { activate(t.id); patchView(t.id, { selected: m.id, detailClosed: false, query: "" }); }),
            });
          }
        }
      }
    }
    return out.slice(0, 60);
  }, [q, drafts, connections, status, tabs, views, openMessages, openTopics, setOverlay, patchView, activate]);

  const sel = Math.min(idx, items.length - 1);

  return (
    <div className="modal" style={{ top: 90, width: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 50, borderBottom: "1px solid var(--line)" }}>
        <Icon name="ph-magnifying-glass" size={18} color="var(--muted)" />
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter" && items[sel]) items[sel].run();
          }}
          placeholder="Topic, cluster, draft or message key…"
          spellCheck={false}
          style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14 }}
        />
        <span className="kbd" style={{ color: "var(--faint)" }}>Esc</span>
      </div>
      <div style={{ maxHeight: 420, overflow: "auto", padding: 6 }}>
        {items.length === 0 && (
          <div style={{ padding: 16, fontSize: 12.5, color: "var(--muted)" }}>
            {connections.some((c) => status[c.id]?.state === "connected") ? "No matches." : "Connect to a cluster to search its topics."}
          </div>
        )}
        {items.map((it, i) => (
          <div key={it.key} className={`menu-item${i === sel ? " active" : ""}`} onMouseEnter={() => setIdx(i)} onClick={it.run} style={{ height: 32 }}>
            <Icon name={it.icon} size={15} color="var(--muted)" />
            <span className="mono ellipsis" style={{ fontSize: 12.5 }}>{it.label}</span>
            <span className="ellipsis" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--faint)" }}>{it.meta}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, padding: "8px 16px", borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--faint)" }}>
        {connections.map((c) => status[c.id]?.state === "connected" && (
          <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 5 }}><StatusDot state="connected" size={6} />{c.name}</span>
        ))}
        <span style={{ marginLeft: "auto" }}>↑↓ to move · Enter to open</span>
      </div>
    </div>
  );
}
