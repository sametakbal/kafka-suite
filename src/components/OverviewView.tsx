import { useApp } from "../state";
import { ENV_COLOR, SWATCHES, n } from "../lib/format";
import { short } from "../lib/errors";
import type { Connection } from "../lib/types";
import { EnvBadge, Icon, StatusDot } from "./ui";

/** Shown when no tab is open: every saved cluster at a glance (the "Overview" of Kafka Suite 1.x). */
export default function OverviewView() {
  const connections = useApp((s) => s.connections);
  const status = useApp((s) => s.status);
  const setOverlay = useApp((s) => s.setOverlay);
  const connected = connections.filter((c) => status[c.id]?.state === "connected");
  const brokers = connected.reduce((sum, c) => sum + (status[c.id]?.info?.brokers.length ?? 0), 0);
  const topics = connected.reduce((sum, c) => sum + (status[c.id]?.topics?.filter((t) => !t.internal).length ?? 0), 0);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Overview</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Pick a cluster to open its topics. Selecting a cluster connects it.</div>
        </div>
        <button className="btn" onClick={() => setOverlay({ kind: "palette" })}><Icon name="ph-magnifying-glass" />Search<span className="kbd" style={{ color: "var(--faint)" }}>Ctrl K</span></button>
        <button className="btn primary" onClick={() => setOverlay({ kind: "connection" })}><Icon name="ph-plus" />New connection</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        <Stat icon="ph-hard-drives" label="CLUSTERS" value={n(connections.length)} />
        <Stat icon="ph-plugs-connected" label="CONNECTED" value={`${connected.length} / ${connections.length}`} tone={connected.length ? "var(--ok)" : undefined} />
        <Stat icon="ph-cpu" label="BROKERS" value={connected.length ? n(brokers) : "—"} sub="across connected clusters" />
        <Stat icon="ph-rows" label="TOPICS" value={connected.length ? n(topics) : "—"} sub="excluding internal" />
      </div>

      <div className="section-title" style={{ marginBottom: 12 }}>CLUSTERS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {connections.map((c) => <ClusterCard key={c.id} conn={c} />)}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="stat">
      <span className="col-head" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name={icon} size={13} />{label}</span>
      <span className="v" style={{ color: tone }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--faint)" }}>{sub}</span>}
    </div>
  );
}

function ClusterCard({ conn }: { conn: Connection }) {
  const st = useApp((s) => s.status[conn.id]);
  const { openTopics, setOverlay } = useApp.getState();
  const color = conn.env === "PROD" ? ENV_COLOR.PROD : SWATCHES[conn.color];
  const servers = conn.bootstrap.split(",").map((s) => s.trim()).filter(Boolean);
  const stateText = st?.state === "connected" ? "Connected" : st?.state === "connecting" ? "Connecting…" : st?.state === "error" ? short(st.error!) : "Disconnected";
  return (
    <div
      className="hoverable"
      onClick={() => openTopics(conn.id)}
      style={{ position: "relative", padding: "14px 16px 14px 18px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot state={st?.state} />
        <span className="ellipsis" style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{conn.name}</span>
        <EnvBadge env={conn.env} />
        <button className="icon-btn sm" title="Edit connection" onClick={(e) => { e.stopPropagation(); setOverlay({ kind: "connection", connId: conn.id }); }}><Icon name="ph-pencil-simple" /></button>
      </div>
      <div className="mono ellipsis" style={{ fontSize: 11.5, color: "var(--muted)" }} title={conn.bootstrap}>{servers.join(", ")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <span className="chip" style={{ color: st?.state === "error" ? "var(--err)" : st?.state === "connected" ? "var(--ok)" : undefined }}>{stateText}</span>
        <span className="chip">{conn.securityProtocol}</span>
        {st?.info && <span className="chip">{st.info.brokers.length} broker{st.info.brokers.length === 1 ? "" : "s"}</span>}
        {st?.topics && <span className="chip">{st.topics.filter((t) => !t.internal).length} topics</span>}
        {!st?.info && <span className="chip">{servers.length} bootstrap server{servers.length === 1 ? "" : "s"}</span>}
      </div>
    </div>
  );
}
