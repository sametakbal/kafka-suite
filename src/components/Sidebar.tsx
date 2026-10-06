import { useMemo, useState } from "react";
import { activeTabOf, useApp } from "../state";
import { n } from "../lib/format";
import { short } from "../lib/errors";
import { exportConnectionsToFile, importConnectionsFromFile } from "../lib/transfer";
import type { Connection, TopicInfo } from "../lib/types";
import { Icon, StatusDot } from "./ui";
import Drafts from "./Drafts";

const TREE_TOPICS = 6;

/** Busiest user topics first; internal (__*) topics left out. */
function topTopics(topics: TopicInfo[]) {
  return topics
    .filter((t) => !t.internal && !t.name.startsWith("__"))
    .sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0) || a.name.localeCompare(b.name));
}

export default function Sidebar() {
  const connections = useApp((s) => s.connections);
  const status = useApp((s) => s.status);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const setOverlay = useApp((s) => s.setOverlay);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const map = new Map<string, Connection[]>();
    for (const c of connections) {
      if (f && !`${c.name} ${c.bootstrap}`.toLowerCase().includes(f)) continue;
      const key = c.folder || c.env;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    const order = (k: string) => (k === "DEV" ? 0 : k === "TEST" ? 1 : k === "PROD" ? 3 : 2);
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
  }, [connections, filter]);

  const connected = Object.values(status).filter((s) => s.state === "connected").length;

  return (
    <aside style={{ width: 260, flex: "none", display: "flex", flexDirection: "column", background: "var(--panel)", borderRight: "1px solid var(--line)" }}>
      <div style={{ height: 38, flex: "none", display: "flex", alignItems: "center", gap: 2, padding: "0 8px 0 14px" }}>
        <span className="caps" style={{ flex: 1 }}>CLUSTERS</span>
        <button className="icon-btn sm" title="New connection (Ctrl N)" onClick={() => setOverlay({ kind: "connection" })}><Icon name="ph-plus" /></button>
        <button className="icon-btn sm" title="Import JSON (Ctrl O)" onClick={() => void importConnectionsFromFile()}><Icon name="ph-download-simple" /></button>
        <button className="icon-btn sm" title="Export JSON" disabled={!connections.length} onClick={() => void exportConnectionsToFile()}><Icon name="ph-upload-simple" /></button>
      </div>
      <div style={{ padding: "0 10px 8px" }}>
        <div className="input" style={{ height: 28, fontSize: 12, padding: "0 9px", gap: 7 }}>
          <Icon name="ph-funnel-simple" size={13} color="var(--faint)" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter clusters" spellCheck={false} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", paddingBottom: 8 }}>
        {groups.map(([name, conns]) => {
          const prod = conns.some((c) => c.env === "PROD");
          const open = !collapsed[name];
          return (
            <div key={name} style={{ position: "relative", padding: "2px 0 6px" }}>
              {prod && <div style={{ position: "absolute", left: 0, top: 2, bottom: 6, width: 3, background: "var(--prod)" }} />}
              <div
                onClick={() => setCollapsed((c) => ({ ...c, [name]: open }))}
                style={{ height: 26, display: "flex", alignItems: "center", gap: 6, padding: "0 14px 0 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".07em", color: prod ? "var(--err)" : "var(--muted)", cursor: "pointer", userSelect: "none" }}
              >
                <Icon name={open ? "ph-caret-down" : "ph-caret-right"} size={11} color="var(--faint)" />
                <Icon name="ph-folder-simple" size={14} />
                <span>{name.toUpperCase()}</span>
                <span style={{ marginLeft: "auto", fontWeight: 400, color: "var(--faint)", letterSpacing: 0 }}>{conns.length}</span>
              </div>
              {open && conns.map((c) => <ConnectionNode key={c.id} conn={c} />)}
            </div>
          );
        })}
        {connections.length === 0 && (
          <div style={{ margin: "24px 14px", padding: "20px 16px", border: "1px dashed var(--line2)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>No saved clusters</div>
            <div style={{ fontSize: 12, color: "var(--muted)", textWrap: "pretty" }}>Add a Kafka cluster or import a JSON config exported from another machine.</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button className="btn primary sm" onClick={() => setOverlay({ kind: "connection" })}><Icon name="ph-plus" />New</button>
              <button className="btn sm" onClick={() => void importConnectionsFromFile()}><Icon name="ph-download-simple" />Import</button>
            </div>
          </div>
        )}
      </div>
      <Drafts />
      <div style={{ height: 32, flex: "none", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 11.5, color: "var(--faint)" }}>
        {connections.length ? `${connections.length} cluster${connections.length === 1 ? "" : "s"} · ${connected} connected` : "No clusters"}
      </div>
    </aside>
  );
}

function ConnectionNode({ conn }: { conn: Connection }) {
  const st = useApp((s) => s.status[conn.id]);
  const tab = useApp(activeTabOf);
  const focus = useApp((s) => s.focusConn);
  const { connect, disconnect, openTopics, openMessages, setOverlay } = useApp.getState();
  const [hover, setHover] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);

  const connected = st?.state === "connected";
  const expanded = connected && !userCollapsed;
  const active = tab?.connId === conn.id || (!tab && focus === conn.id);
  const topics = st?.topics ? topTopics(st.topics) : [];

  // Selecting a cluster connects it, as in Kafka Suite 1.x.
  const onRow = () => {
    useApp.setState({ focusConn: conn.id });
    if (connected) setUserCollapsed((v) => !v);
    else if (st?.state !== "connecting") {
      setUserCollapsed(false);
      openTopics(conn.id);
    }
  };

  return (
    <div>
      <div
        onClick={onRow}
        onDoubleClick={() => setOverlay({ kind: "connection", connId: conn.id })}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="hoverable"
        style={{ height: 28, display: "flex", alignItems: "center", gap: 7, padding: "0 8px 0 24px", cursor: "pointer", background: active ? "var(--hover)" : "transparent" }}
      >
        <Icon name={expanded ? "ph-caret-down" : "ph-caret-right"} size={11} color="var(--faint)" style={{ width: 11 }} />
        <StatusDot state={st?.state} />
        <span className="ellipsis" style={{ flex: 1, fontSize: 12.5, color: st?.state && st.state !== "disconnected" ? "var(--text)" : "var(--muted)", fontWeight: active ? 600 : 400 }}>{conn.name}</span>
        {hover ? (
          <span style={{ display: "flex" }} onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sm" style={{ width: 22, height: 22, fontSize: 13 }} title="Edit" onClick={() => setOverlay({ kind: "connection", connId: conn.id })}><Icon name="ph-pencil-simple" /></button>
            {connected || st?.state === "error" ? (
              <button className="icon-btn sm" style={{ width: 22, height: 22, fontSize: 13 }} title="Disconnect" onClick={() => void disconnect(conn.id)}><Icon name="ph-plugs" /></button>
            ) : (
              <button className="icon-btn sm" style={{ width: 22, height: 22, fontSize: 13 }} title="Connect" onClick={() => void connect(conn.id)}><Icon name="ph-plugs-connected" /></button>
            )}
          </span>
        ) : (
          conn.securityProtocol !== "PLAINTEXT" && <Icon name="ph-lock-simple" size={13} color="var(--muted)" />
        )}
      </div>
      {st?.state === "error" && st.error && (
        <div className="mono ellipsis" style={{ padding: "0 12px 5px 57px", fontSize: 10.5, color: "var(--err)" }} title={st.error.message}>{short(st.error)}</div>
      )}
      {expanded && (
        <>
          <div
            onClick={() => openTopics(conn.id)}
            className="hoverable"
            style={{ height: 26, display: "flex", alignItems: "center", gap: 7, padding: "0 12px 0 42px", cursor: "pointer", background: tab?.kind === "topics" && tab.connId === conn.id ? "var(--sel)" : "transparent" }}
          >
            <Icon name="ph-caret-down" size={11} color="var(--faint)" />
            <Icon name="ph-hard-drives" size={14} color="var(--muted)" />
            <span style={{ fontSize: 12 }}>Topics</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--faint)" }}>
              {st?.topics ? topics.length : ""}{st?.info ? ` · ${st.info.brokers.length}b` : ""}
            </span>
          </div>
          {st?.topicsError && (
            <div style={{ padding: "2px 12px 4px 74px", fontSize: 11, color: "var(--faint)" }}>Topic list unavailable ({short(st.topicsError)})</div>
          )}
          {topics.slice(0, TREE_TOPICS).map((t) => {
            const sel = tab?.kind === "messages" && tab.connId === conn.id && tab.topic === t.name;
            return (
              <div
                key={t.name}
                onClick={() => openMessages(conn.id, t.name)}
                className="hoverable"
                title={t.name}
                style={{ height: 25, display: "flex", alignItems: "center", gap: 7, padding: "0 12px 0 74px", cursor: "pointer", background: sel ? "var(--sel)" : "transparent", color: sel ? "var(--accent)" : "var(--text)" }}
              >
                <Icon name="ph-rows" size={13} color="var(--faint)" />
                <span className="mono ellipsis" style={{ flex: 1, fontSize: 11.5 }}>{t.name}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{t.messages == null ? "—" : n(t.messages)}</span>
              </div>
            );
          })}
          {topics.length > TREE_TOPICS && (
            <div onClick={() => openTopics(conn.id)} style={{ height: 24, display: "flex", alignItems: "center", padding: "0 12px 0 94px", fontSize: 11.5, color: "var(--faint)", cursor: "pointer" }}>
              {topics.length - TREE_TOPICS} more topics…
            </div>
          )}
        </>
      )}
    </div>
  );
}
