import { useState } from "react";
import { connOf, useApp } from "../../state";
import { api, asKError } from "../../lib/rpc";
import { explain } from "../../lib/errors";
import type { KError } from "../../lib/types";
import { EnvBadge, Field, Icon, Spinner } from "../ui";

const COMMON_CONFIGS = [
  { key: "cleanup.policy", description: "delete, compact, or delete,compact" },
  { key: "retention.ms", description: "Message retention time in ms" },
  { key: "retention.bytes", description: "Max bytes retained per partition" },
  { key: "max.message.bytes", description: "Max message size in bytes" },
  { key: "min.insync.replicas", description: "Min in-sync replicas for acks" },
  { key: "compression.type", description: "producer, gzip, snappy, lz4, zstd" },
  { key: "segment.bytes", description: "Log segment file size" },
];

interface ConfigRow {
  key: string;
  value: string;
}

export default function CreateTopicDialog({ connId }: { connId: string }) {
  const conn = useApp((s) => connOf(s, connId));
  const brokers = useApp((s) => s.status[connId]?.info?.brokers.length ?? 0);
  const { setOverlay, showToast, loadTopics, openMessages } = useApp.getState();
  const [name, setName] = useState("");
  const [partitions, setPartitions] = useState(3);
  const [rf, setRf] = useState(Math.min(3, Math.max(1, brokers)));
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KError | null>(null);
  const [done, setDone] = useState(false);

  if (!conn) return null;
  const nameOk = /^[a-zA-Z0-9._-]{1,249}$/.test(name.trim()) && name.trim() !== "." && name.trim() !== "..";
  const valid = nameOk && partitions >= 1 && partitions <= 1000 && rf >= 1 && rf <= 10;
  const used = new Set(configs.map((c) => c.key.trim()));

  const setRow = (i: number, p: Partial<ConfigRow>) => setConfigs((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const create = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const map: Record<string, string> = {};
    for (const c of configs) if (c.key.trim() && c.value.trim()) map[c.key.trim()] = c.value.trim();
    try {
      await api.createTopic(connId, name.trim(), partitions, rf, map);
      setDone(true);
      void loadTopics(connId);
      showToast({
        tone: "ok", title: `Topic ${name.trim()} created`, sub: `${partitions} partition${partitions === 1 ? "" : "s"} · replication ${rf}`,
        actions: [{ label: "Open topic", run: () => openMessages(connId, name.trim()) }],
      });
      // Close shortly after the success state shows, as in 1.x.
      setTimeout(() => useApp.getState().overlay?.kind === "createTopic" && setOverlay(null), 1000);
    } catch (e) {
      setError(asKError(e));
    } finally {
      setBusy(false);
    }
  };

  const stepper = (value: number, set: (v: number) => void, min: number, max: number) => (
    <div style={{ display: "flex", alignItems: "center", height: 30, border: "1px solid var(--line2)", borderRadius: 5, background: "var(--bg)", width: "max-content" }}>
      <span onClick={() => set(Math.max(min, value - 1))} style={{ width: 30, height: "100%", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--muted)" }}><Icon name="ph-minus" /></span>
      <input className="mono" value={value} onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value.replace(/\D/g, "")) || min)))} style={{ width: 60, textAlign: "center", fontSize: 12.5, border: "none", borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)", height: "100%", background: "transparent", outline: "none" }} />
      <span onClick={() => set(Math.min(max, value + 1))} style={{ width: 30, height: "100%", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--muted)" }}><Icon name="ph-plus" /></span>
    </div>
  );

  return (
    <div className="modal" style={{ top: 80, width: 640 }}>
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 12px 0 22px", borderBottom: "1px solid var(--line)" }}>
        <Icon name="ph-rows" size={19} color="var(--accent)" />
        <span style={{ fontSize: 15, fontWeight: 600 }}>Create topic</span>
        <span style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>on {conn.name}<EnvBadge env={conn.env} /></span>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => setOverlay(null)}><Icon name="ph-x" /></button>
      </div>

      <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
        <Field label="Topic name">
          <input
            className={`input mono${name && !nameOk ? " invalid" : ""}`}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder="orders.created"
            spellCheck={false}
          />
        </Field>
        {name && !nameOk && <div style={{ fontSize: 11.5, color: "var(--err)", marginTop: -10 }}>Letters, digits, '.', '_' and '-' only, up to 249 characters.</div>}
        <div style={{ display: "flex", gap: 28 }}>
          <Field label="Partitions (1 – 1000)">{stepper(partitions, setPartitions, 1, 1000)}</Field>
          <Field label={`Replication factor (1 – 10)${brokers ? ` · ${brokers} broker${brokers === 1 ? "" : "s"}` : ""}`}>{stepper(rf, setRf, 1, 10)}</Field>
        </div>
        {brokers > 0 && rf > brokers && (
          <div style={{ fontSize: 11.5, color: "var(--warn)", marginTop: -8 }}>The cluster has {brokers} broker{brokers === 1 ? "" : "s"}; a higher replication factor will be rejected.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="caps" style={{ flex: 1 }}>CONFIGURATION · OPTIONAL</span>
            <button className="btn link xs" onClick={() => setConfigs((cs) => [...cs, { key: "", value: "" }])}><Icon name="ph-plus" />Add config</button>
          </div>
          {configs.length > 0 && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
              {configs.map((c, i) => (
                <div key={i} className="mono" style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 30px", alignItems: "center", borderBottom: "1px solid var(--line-soft)", fontSize: 12, height: 32 }}>
                  <input list="ks-topic-configs" value={c.key} onChange={(e) => setRow(i, { key: e.target.value })} placeholder="config name" spellCheck={false} style={{ height: "100%", padding: "0 10px", border: "none", background: "transparent", outline: "none", color: "var(--syn-key)", font: "inherit" }} />
                  <input value={c.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder={COMMON_CONFIGS.find((x) => x.key === c.key)?.description ?? "value"} spellCheck={false} style={{ height: "100%", padding: "0 10px", border: "none", borderLeft: "1px solid var(--line-soft)", background: "transparent", outline: "none", font: "inherit" }} />
                  <i className="ph-light ph-x" style={{ color: "var(--faint)", fontSize: 12, cursor: "pointer", justifySelf: "center" }} onClick={() => setConfigs((cs) => cs.filter((_, j) => j !== i))} />
                </div>
              ))}
              <datalist id="ks-topic-configs">{COMMON_CONFIGS.map((c) => <option key={c.key} value={c.key}>{c.description}</option>)}</datalist>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COMMON_CONFIGS.filter((c) => !used.has(c.key)).map((c) => (
              <span key={c.key} className="chip" title={c.description} style={{ cursor: "pointer" }} onClick={() => setConfigs((cs) => [...cs, { key: c.key, value: "" }])}>
                + {c.key}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="banner err">
            <Icon name="ph-warning-octagon" size={18} color="var(--err)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--err)" }}>{explain(error).title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{error.message}</div>
            </div>
          </div>
        )}
        {done && (
          <div className="banner ok">
            <Icon name="ph-check-circle" size={18} color="var(--ok)" />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ok)" }}>Topic {name.trim()} created</div>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div className="spacer" />
        <button className="btn outline lg" onClick={() => setOverlay(null)}>Cancel</button>
        <button className="btn primary lg" style={{ padding: "0 16px" }} onClick={() => void create()} disabled={!valid || busy || done}>
          {busy ? <Spinner /> : <Icon name="ph-plus" />}Create topic
        </button>
      </div>
    </div>
  );
}
