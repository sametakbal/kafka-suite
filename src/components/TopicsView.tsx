import { useMemo, useState } from "react";
import { connOf, useApp, type Tab } from "../state";
import { clock, n, wildcard } from "../lib/format";
import type { TopicInfo } from "../lib/types";
import ErrorView from "./ErrorView";
import { Empty, Icon, Spinner, Switch } from "./ui";

type SortKey = "name" | "messages" | "partitions";

/** The cluster's dashboard: stats and every topic, as Kafka Suite 1.x's cluster screen. */
export default function TopicsView({ tab }: { tab: Tab }) {
  const st = useApp((s) => s.status[tab.connId]);
  const conn = useApp((s) => connOf(s, tab.connId));
  const { loadTopics, openMessages, setOverlay } = useApp.getState();
  const [filter, setFilter] = useState("");
  const [hideInternal, setHideInternal] = useState(true);
  const [sort, setSort] = useState<SortKey>("name");

  const all = st?.topics ?? [];
  const internalCount = all.filter((t) => t.internal).length;
  const rows = useMemo(() => {
    const m = wildcard(filter);
    const cmp: Record<SortKey, (a: TopicInfo, b: TopicInfo) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      messages: (a, b) => (b.messages ?? -1) - (a.messages ?? -1) || a.name.localeCompare(b.name),
      partitions: (a, b) => b.partitions - a.partitions || a.name.localeCompare(b.name),
    };
    return all.filter((t) => (!hideInternal || !t.internal) && m(t.name)).sort(cmp[sort]);
  }, [all, filter, hideInternal, sort]);

  if (!conn) return null;
  if (st?.topicsError && !st.topics) {
    return <ErrorView connId={tab.connId} error={st.topicsError} onRetry={() => void loadTopics(tab.connId)} hint="You can still open a topic by name from the search (Ctrl K)." />;
  }
  const loading = st?.state === "connecting" || (st?.topicsLoading && !st.topics);
  const connected = st?.state === "connected";
  const userTopics = all.filter((t) => !t.internal);
  const partitions = userTopics.reduce((s, t) => s + t.partitions, 0);
  const known = userTopics.filter((t) => t.messages != null);
  const messages = known.reduce((s, t) => s + (t.messages ?? 0), 0);

  const head = (key: SortKey, label: string, right?: boolean) => (
    <span onClick={() => setSort(key)} style={{ cursor: "pointer", textAlign: right ? "right" : undefined, color: sort === key ? "var(--text)" : undefined }}>
      {label}{sort === key ? (key === "name" ? " ↑" : " ↓") : ""}
    </span>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Topics</div>
          <div className="ellipsis" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {conn.name} · {rows.length} shown{hideInternal && internalCount ? ` · ${internalCount} internal hidden` : ""}{st?.topicsAt ? ` · refreshed ${clock(st.topicsAt)}` : ""}
          </div>
        </div>
        <button className="btn" onClick={() => void loadTopics(tab.connId)} disabled={!connected}>
          {st?.topicsLoading ? <Spinner /> : <Icon name="ph-arrows-clockwise" />}Refresh
        </button>
        <button className="btn primary" onClick={() => setOverlay({ kind: "createTopic", connId: tab.connId })} disabled={!connected}>
          <Icon name="ph-plus" />Create topic
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, padding: "0 20px 16px" }}>
        <div className="stat">
          <span className="col-head">STATUS</span>
          <span className="v" style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8, color: connected ? "var(--ok)" : "var(--muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "var(--ok)" : "var(--faint)", boxShadow: connected ? "0 0 8px var(--ok)" : undefined }} />
            {connected ? "Connected" : st?.state === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
          <span className="mono ellipsis" style={{ fontSize: 11, color: "var(--faint)" }} title={st?.info?.clusterId}>{st?.info ? `cluster ${st.info.clusterId}` : conn.securityProtocol}</span>
        </div>
        <div className="stat">
          <span className="col-head">TOPICS</span>
          <span className="v">{st?.topics ? n(userTopics.length) : "—"}</span>
          <span style={{ fontSize: 11, color: "var(--faint)" }}>{internalCount ? `+ ${internalCount} internal` : "user topics"}</span>
        </div>
        <div className="stat">
          <span className="col-head">PARTITIONS</span>
          <span className="v">{st?.topics ? n(partitions) : "—"}</span>
          <span style={{ fontSize: 11, color: "var(--faint)" }}>{st?.topics && known.length ? `${n(messages)} messages retained` : "across user topics"}</span>
        </div>
        <div className="stat">
          <span className="col-head">BROKERS</span>
          <span className="v">{st?.info ? n(st.info.brokers.length) : "—"}</span>
          <span className="mono ellipsis" style={{ fontSize: 11, color: "var(--faint)" }} title={st?.info?.brokers.map((b) => `${b.id} ${b.host}:${b.port}`).join("\n")}>
            {st?.info ? `controller ${st.info.controller ?? "—"} · ${st.info.brokers.map((b) => b.host).slice(0, 2).join(", ")}${st.info.brokers.length > 2 ? "…" : ""}` : ""}
          </span>
        </div>
      </div>

      <div style={{ height: 44, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: "1px solid var(--line)", borderTop: "1px solid var(--line)" }}>
        <div className="input on-panel" style={{ width: 300, gap: 7, padding: "0 9px", fontSize: 12 }}>
          <Icon name="ph-magnifying-glass" size={14} color="var(--faint)" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search topics, e.g. orders.*" spellCheck={false} />
        </div>
        <div onClick={() => setHideInternal(!hideInternal)} style={{ height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", border: "1px solid var(--line2)", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
          <Switch on={hideInternal} onChange={setHideInternal} />Hide internal
        </div>
      </div>
      <div className="q-grid col-head" style={{ height: 30, flex: "none", borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
        {head("name", "TOPIC")}
        {head("partitions", "PARTITIONS", true)}
        <span style={{ textAlign: "right" }}>REPLICATION</span>
        {head("messages", "MESSAGES", true)}
        <span />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && <div style={{ padding: 20, display: "flex", gap: 8, alignItems: "center", color: "var(--muted)" }}><Spinner />Loading topics…</div>}
        {!loading && st?.state !== "connected" && !st?.topics && (
          <Empty icon="ph-plugs" title="Not connected" actions={<button className="btn primary" onClick={() => void useApp.getState().connect(tab.connId)}><Icon name="ph-plugs-connected" />Connect</button>}>
            Connect to {conn.name} to list its topics.
          </Empty>
        )}
        {!loading && st?.topics && rows.length === 0 && (all.length === 0
          ? <Empty icon="ph-rows" title="No topics yet" actions={<button className="btn primary" onClick={() => setOverlay({ kind: "createTopic", connId: tab.connId })}><Icon name="ph-plus" />Create topic</button>}>This cluster has no topics you can see.</Empty>
          : <Empty icon="ph-funnel-simple" title="No topics match">Change the search or show internal topics.</Empty>)}
        {rows.map((t) => (
          <div key={t.name} className="q-grid hoverable" style={{ height: 36, borderBottom: "1px solid var(--line-soft)", fontSize: 12.5 }} onDoubleClick={() => openMessages(tab.connId, t.name)}>
            <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Icon name={t.internal ? "ph-gear-six" : "ph-rows"} size={15} color="var(--faint)" />
              <span className="mono ellipsis" style={{ fontSize: 12, color: t.internal ? "var(--muted)" : "var(--text)" }} title={t.name}>{t.name}</span>
              {t.internal && <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 3, border: "1px solid var(--line)", color: "var(--faint)" }}>internal</span>}
            </span>
            <span className="mono" style={{ textAlign: "right", fontSize: 12 }}>{t.partitions}</span>
            <span className="mono" style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{t.replicationFactor}</span>
            <span className="mono" style={{ textAlign: "right", fontSize: 12, color: t.messages ? "var(--text)" : "var(--faint)" }}>{t.messages == null ? "—" : n(t.messages)}</span>
            <span style={{ justifySelf: "end", display: "flex", gap: 4 }}>
              <button className="btn outline xs" onClick={() => openMessages(tab.connId, t.name)}><Icon name="ph-eye" size={13} />Messages</button>
              <button className="btn outline xs" onClick={() => setOverlay({ kind: "produce", connId: tab.connId, topic: t.name })}><Icon name="ph-paper-plane-tilt" size={13} />Produce</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
