import { activeTabOf, connOf, useApp } from "../state";
import { clock, n } from "../lib/format";
import { short } from "../lib/errors";
import { Icon } from "./ui";

export default function StatusBar() {
  const tab = useApp(activeTabOf);
  const conn = useApp((s) => connOf(s, tab?.connId ?? s.focusConn));
  const st = useApp((s) => (conn ? s.status[conn.id] : undefined));
  const v = useApp((s) => (tab ? s.views[tab.id] : undefined));
  const buffer = useApp((s) => s.settings.liveBuffer);

  let dot = "var(--faint)";
  let state = "No active connection";
  let right = `kafka-suite ${__APP_VERSION__}`;
  const items: { icon: string; t: string }[] = [];

  if (conn) {
    items.push({ icon: "ph-hard-drives", t: conn.bootstrap });
    items.push({ icon: conn.securityProtocol === "PLAINTEXT" ? "ph-lock-simple-open" : "ph-lock-simple", t: conn.securityProtocol.startsWith("SASL") ? `${conn.securityProtocol} · ${conn.saslMechanism}` : conn.securityProtocol });
    if (st?.info) items.push({ icon: "ph-fingerprint", t: st.info.clusterId });
    switch (st?.state) {
      case "connected":
        dot = "var(--ok)";
        state = "Connected";
        if (v?.live) right = `Live · ${n(v.liveCount)} received · buffer ${v.messages.length}/${buffer}`;
        else if (v?.loadedAt) right = `Read ${clock(v.loadedAt)} · ${n(v.messages.length)} message${v.messages.length === 1 ? "" : "s"}`;
        else if (st.topicsAt) right = `Topics refreshed ${clock(st.topicsAt)}`;
        else right = `Connected in ${st.info?.elapsedMs ?? "—"} ms`;
        break;
      case "connecting":
        dot = "var(--warn)";
        state = "Connecting…";
        right = tab?.topic ? `Opening ${tab.topic}` : `Opening ${conn.name}`;
        break;
      case "error":
        dot = "var(--err)";
        state = `Disconnected · ${st.error ? short(st.error) : "error"}`;
        right = st.lastAttempt ? `Last attempt ${clock(st.lastAttempt)}` : "";
        break;
      default:
        state = "Disconnected";
        right = "";
    }
  }

  return (
    <div className="mono" style={{ height: 26, flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "0 12px", background: "var(--chrome)", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />{state}
      </span>
      {items.map((it) => (
        <span key={it.icon} className="ellipsis" style={{ display: "flex", alignItems: "center", gap: 5, maxWidth: 380 }}><Icon name={it.icon} size={12} color="var(--faint)" />{it.t}</span>
      ))}
      <div className="spacer" />
      <span>{right}</span>
    </div>
  );
}
