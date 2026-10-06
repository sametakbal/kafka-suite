import { activeTabOf, connOf, useApp } from "../state";
import { EnvBadge, Icon, StatusDot } from "./ui";

export default function TopBar() {
  const tab = useApp(activeTabOf);
  const conn = useApp((s) => connOf(s, tab?.connId ?? s.focusConn));
  const status = useApp((s) => (conn ? s.status[conn.id] : undefined));
  const live = useApp((s) => (tab ? s.views[tab.id]?.live : false));
  const setOverlay = useApp((s) => s.setOverlay);
  const refreshMessages = useApp((s) => s.refreshMessages);
  const loadTopics = useApp((s) => s.loadTopics);
  const connect = useApp((s) => s.connect);

  const refresh = () => {
    if (!tab) return;
    if (useApp.getState().status[tab.connId]?.state !== "connected") void connect(tab.connId);
    else if (tab.kind === "messages") void refreshMessages(tab.id);
    else void loadTopics(tab.connId);
  };

  const canProduce = !!conn && status?.state === "connected";
  const topic = tab?.topic ?? "";
  const secured = conn && conn.securityProtocol !== "PLAINTEXT";

  return (
    <div style={{ height: 48, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ width: 238, display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--accent)", color: "var(--accent-ink)", display: "grid", placeItems: "center", font: "600 11px 'JetBrains Mono',monospace" }}>ks</div>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>kafka-suite</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{__APP_VERSION__}</span>
      </div>
      {conn && (
        <button
          onClick={() => setOverlay({ kind: "connection", connId: conn.id })}
          title="Edit connection"
          style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 10px", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer", maxWidth: 560 }}
        >
          <StatusDot state={status?.state} />
          <span className="ellipsis" style={{ fontWeight: 600 }}>{conn.name}</span>
          <EnvBadge env={conn.env} />
          <span style={{ color: "var(--faint)" }}>/</span>
          <span className="mono ellipsis" style={{ fontSize: 12, color: "var(--muted)" }}>
            {status?.info ? `${status.info.brokers.length} broker${status.info.brokers.length === 1 ? "" : "s"}` : conn.bootstrap.split(",")[0]}
          </span>
          {secured && <Icon name="ph-lock-simple" size={14} color="var(--muted)" />}
          <Icon name="ph-caret-down" size={12} color="var(--faint)" />
        </button>
      )}
      <div className="spacer" />
      <div
        onClick={() => setOverlay({ kind: "palette" })}
        style={{ width: 320, height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--faint)", fontSize: 12.5, cursor: "text" }}
      >
        <Icon name="ph-magnifying-glass" size={15} />
        <span style={{ flex: 1 }}>Search topics, connections, keys…</span>
        <span className="kbd">Ctrl K</span>
      </div>
      <button className="icon-btn bordered" title={live ? "Stop the live tail to refresh" : "Refresh"} onClick={refresh} disabled={!tab || live}><Icon name="ph-arrows-clockwise" /></button>
      <button className="icon-btn bordered" title="Settings (Ctrl ,)" onClick={() => setOverlay({ kind: "settings" })}><Icon name="ph-gear-six" /></button>
      <button
        className="btn primary lg"
        disabled={!canProduce}
        title={canProduce ? undefined : "Connect to a cluster first"}
        onClick={() => conn && setOverlay({ kind: "produce", connId: conn.id, topic })}
      >
        <Icon name="ph-paper-plane-tilt" />Produce message
      </button>
    </div>
  );
}
