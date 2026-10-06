import { useEffect, useMemo, useState } from "react";
import { newConnection, useApp } from "../../state";
import { api, asKError, secretKey, secrets, store } from "../../lib/rpc";
import { ENV_COLOR, SWATCHES } from "../../lib/format";
import { explain } from "../../lib/errors";
import { exportConnectionsToFile, importConnectionsFromFile, pickStore } from "../../lib/transfer";
import type { ClusterInfo, Connection, Env, KError, SaslMechanism, SecurityProtocol } from "../../lib/types";
import { Checkbox, Field, Icon, Segmented, Spinner, Switch } from "../ui";

export const KEYCHAIN = /Mac/i.test(navigator.userAgent) ? "macOS Keychain" : /Windows/i.test(navigator.userAgent) ? "Windows Credential Manager" : "the system keyring";

const PROTOCOLS: { value: SecurityProtocol; label: string }[] = [
  { value: "PLAINTEXT", label: "PLAINTEXT" }, { value: "SSL", label: "SSL" },
  { value: "SASL_PLAINTEXT", label: "SASL_PLAINTEXT" }, { value: "SASL_SSL", label: "SASL_SSL" },
];
const MECHANISMS: SaslMechanism[] = ["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"];

type TestState = { s: "idle" } | { s: "testing" } | { s: "ok"; info: ClusterInfo } | { s: "err"; error: KError };

export default function ConnectionDrawer({ connId }: { connId?: string }) {
  const existing = useApp((s) => s.connections.find((c) => c.id === connId));
  const connections = useApp((s) => s.connections);
  const folders = useMemo(() => [...new Set(connections.map((c) => c.folder).filter(Boolean))], [connections]);
  const { saveConnection, deleteConnection, setOverlay, openTopics, showToast } = useApp.getState();
  const [c, setC] = useState<Connection>(() => (existing ? structuredClone(existing) : newConnection()));
  const [pw, setPw] = useState("");
  const [tsPw, setTsPw] = useState("");
  const [ksPw, setKsPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [test, setTest] = useState<TestState>({ s: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataDir, setDataDir] = useState("~/.kafka-suite");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    // Shown with the home folder abbreviated, as on macOS/Linux.
    void store.dataDir().then((d) => setDataDir(d.replace(/^.*[\\/](\.kafka-suite)$/, "~/$1"))).catch(() => undefined);
  }, []);

  const set = (patch: Partial<Connection>) => setC((x) => ({ ...x, ...patch }));
  const setSsl = (patch: Partial<Connection["ssl"]>) => setC((x) => ({ ...x, ssl: { ...x.ssl, ...patch } }));
  const hasSaved = !!existing?.savePassword;
  const sasl = c.securityProtocol.startsWith("SASL");
  const ssl = c.securityProtocol.endsWith("SSL");

  const servers = c.bootstrap.split(/[,\s]+/).filter(Boolean);
  const errors = {
    name: !c.name.trim(),
    bootstrap: servers.length === 0 || servers.some((s) => !/^[^:\s]+:\d{1,5}$/.test(s)),
    username: sasl && !c.username.trim(),
  };
  const valid = !Object.values(errors).some(Boolean);

  const revealPw = async () => {
    if (!showPw && !pw && hasSaved) {
      const saved = await secrets.get(secretKey.password(c.id)).catch(() => null);
      if (saved) setPw(saved);
    }
    setShowPw(!showPw);
  };

  const typed = () => ({ password: pw || null, truststorePassword: tsPw || null, keystorePassword: ksPw || null });

  const runTest = async () => {
    setTouched(true);
    if (!valid) return;
    setTest({ s: "testing" });
    try {
      // Empty fields mean "use what is saved" — the Tauri side fills them from the keyring.
      const info = await api.test(c, typed());
      setTest({ s: "ok", info });
    } catch (e) {
      setTest({ s: "err", error: asKError(e) });
    }
  };

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    try {
      const fresh = { ...c, name: c.name.trim(), bootstrap: servers.join(","), username: c.username.trim() };
      await saveConnection(fresh, typed());
      setOverlay(null);
      if (!existing) openTopics(fresh.id);
      showToast({ tone: "ok", title: existing ? "Connection saved" : `Added ${fresh.name}`, sub: c.savePassword && (pw || hasSaved) ? `Password stored in ${KEYCHAIN}` : undefined });
    } catch (e) {
      showToast({ tone: "err", title: "Could not save the connection", sub: e instanceof Error ? e.message : String(e) });
    }
  };

  const browseFile = async (field: "truststore" | "keystore") => {
    const p = await pickStore(field);
    if (p) setSsl({ [field]: p });
  };

  const inputCls = (bad: boolean) => `input mono${touched && bad ? " invalid" : ""}`;

  return (
    <div className="drawer">
      <div style={{ height: 58, flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 20px", borderBottom: "1px solid var(--line)" }}>
        <Icon name="ph-plug" size={20} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{existing ? "Edit connection" : "New connection"}</div>
          <div className="ellipsis" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>Stored in {dataDir}/connections.json · secrets in {KEYCHAIN}</div>
        </div>
        <button className="icon-btn" onClick={() => setOverlay(null)}><Icon name="ph-x" /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="section-title">GENERAL</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <Field label="Connection name">
              <input className={`input${touched && errors.name ? " invalid" : ""}`} autoFocus value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="orders-prod" spellCheck={false} />
            </Field>
            <Field label="Folder">
              <div className="input">
                <Icon name="ph-folder-simple" color="var(--muted)" />
                <input list="ks-folders" value={c.folder} onChange={(e) => set({ folder: e.target.value })} placeholder={c.env} spellCheck={false} />
                <datalist id="ks-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
            </Field>
            <Field label="Environment">
              <div style={{ display: "flex", gap: 6 }}>
                {(["DEV", "TEST", "PROD"] as Env[]).map((k) => (
                  <span
                    key={k}
                    onClick={() => set({ env: k, folder: c.folder === c.env || !c.folder ? k : c.folder })}
                    className="mono"
                    style={{ flex: 1, height: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 5, border: `1px solid ${c.env === k ? ENV_COLOR[k] : "var(--line2)"}`, background: c.env === k ? "var(--raised)" : "transparent", color: c.env === k ? "var(--text)" : "var(--muted)", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", cursor: "pointer" }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: ENV_COLOR[k] }} />{k}
                  </span>
                ))}
              </div>
            </Field>
            <Field label="Color">
              <div style={{ height: 30, display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 }}>
                {SWATCHES.map((sw, i) => (
                  <span key={sw} onClick={() => set({ color: i })} style={{ width: 18, height: 18, borderRadius: "50%", background: sw, boxShadow: i === c.color ? `0 0 0 2px var(--panel), 0 0 0 4px ${sw}` : "none", cursor: "pointer" }} />
                ))}
              </div>
            </Field>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="section-title">CLUSTER</div>
          <Field label="Bootstrap servers">
            <input className={inputCls(errors.bootstrap)} value={c.bootstrap} onChange={(e) => set({ bootstrap: e.target.value })} placeholder="broker1:9092,broker2:9092" spellCheck={false} />
          </Field>
          <div style={{ fontSize: 11.5, color: touched && errors.bootstrap ? "var(--err)" : "var(--faint)", marginTop: -6 }}>
            Comma-separated host:port list. One reachable broker is enough; the client discovers the rest.
          </div>
          <Field label="Security protocol">
            <Segmented<SecurityProtocol> mono fill value={c.securityProtocol} onChange={(v) => set({ securityProtocol: v })} options={PROTOCOLS} />
          </Field>
        </section>

        {sasl && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="section-title">SASL AUTHENTICATION</div>
            <Field label="Mechanism">
              <Segmented<SaslMechanism> mono fill value={c.saslMechanism} onChange={(v) => set({ saslMechanism: v })} options={MECHANISMS.map((m) => ({ value: m, label: m }))} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              <Field label="Username"><input className={inputCls(errors.username)} value={c.username} onChange={(e) => set({ username: e.target.value })} spellCheck={false} autoComplete="off" /></Field>
              <Field label="Password">
                <div className="input mono" style={{ paddingRight: 4 }}>
                  <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={hasSaved ? "•••••••• (saved)" : ""} autoComplete="new-password" />
                  <span onClick={() => void revealPw()} style={{ width: 24, height: 24, display: "grid", placeItems: "center", color: "var(--muted)", cursor: "pointer", fontSize: 15 }}>
                    <Icon name={showPw ? "ph-eye-slash" : "ph-eye"} />
                  </span>
                </div>
              </Field>
            </div>
          </section>
        )}

        {ssl && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, border: "1px solid var(--accent-line)", borderRadius: 8, background: "var(--accent-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="ph-lock-simple" size={17} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>TLS</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Leave the truststore empty to trust the Java default CAs (public certificates).</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 170px", gap: 12 }}>
              <Field label="Truststore (CA certificates)">
                <div className="input mono" style={{ paddingRight: 4 }}>
                  <Icon name="ph-certificate" color="var(--muted)" />
                  <input value={c.ssl.truststore} onChange={(e) => setSsl({ truststore: e.target.value })} placeholder=".jks / .p12 / .pem" spellCheck={false} />
                  <span className="input-btn" onClick={() => void browseFile("truststore")}>Browse…</span>
                </div>
              </Field>
              <Field label="Truststore password">
                <input className="input mono" type="password" value={tsPw} onChange={(e) => setTsPw(e.target.value)} disabled={/\.(pem|crt|cer)$/i.test(c.ssl.truststore)} placeholder={/\.(pem|crt|cer)$/i.test(c.ssl.truststore) ? "not used for PEM" : hasSaved && c.ssl.truststore ? "•••••••• (saved)" : "(none)"} autoComplete="new-password" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 170px", gap: 12 }}>
              <Field label="Keystore (client certificate, mutual TLS)">
                <div className="input mono" style={{ paddingRight: 4 }}>
                  <Icon name="ph-key" color="var(--muted)" />
                  <input value={c.ssl.keystore} onChange={(e) => setSsl({ keystore: e.target.value })} placeholder=".p12 / .jks / .pem (optional)" spellCheck={false} />
                  <span className="input-btn" onClick={() => void browseFile("keystore")}>Browse…</span>
                </div>
              </Field>
              <Field label="Keystore / key password">
                <input className="input mono" type="password" value={ksPw} onChange={(e) => setKsPw(e.target.value)} placeholder={hasSaved && c.ssl.keystore ? "•••••••• (saved)" : ""} autoComplete="new-password" />
              </Field>
            </div>
            <div onClick={() => setSsl({ verifyHostname: !c.ssl.verifyHostname })} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, cursor: "pointer" }}>
              <Switch on={c.ssl.verifyHostname} onChange={(v) => setSsl({ verifyHostname: v })} />
              Verify the broker's host name
              <span style={{ color: c.ssl.verifyHostname ? "var(--faint)" : "var(--warn)", fontSize: 11.5 }}>
                {c.ssl.verifyHostname ? "— recommended" : "— off: any certificate from a trusted CA is accepted"}
              </span>
            </div>
          </section>
        )}

        {(sasl || ssl) && (
          <div onClick={() => set({ savePassword: !c.savePassword })} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, cursor: "pointer" }}>
            <Checkbox on={c.savePassword} large />
            Save passwords in {KEYCHAIN}
            <span style={{ color: "var(--faint)", fontSize: 11.5 }}>— never written to config or exports</span>
          </div>
        )}
      </div>

      {test.s === "ok" && (
        <div className="banner ok" style={{ margin: "0 20px 12px" }}>
          <Icon name="ph-check-circle" size={18} color="var(--ok)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ok)" }}>Connected in {test.info.elapsedMs} ms</div>
            <div className="mono ellipsis" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
              {[`cluster ${test.info.clusterId}`, `${test.info.brokers.length} broker${test.info.brokers.length === 1 ? "" : "s"}`, `${test.info.topics} topics`, test.info.controller != null ? `controller ${test.info.controller}` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      )}
      {test.s === "err" && (
        <div className="banner err" style={{ margin: "0 20px 12px" }}>
          <Icon name="ph-warning-octagon" size={18} color="var(--err)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--err)" }}>{explain(test.error).title} · {test.error.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>
              {test.error.message}
              {explain(test.error).causes.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                  {explain(test.error).causes.slice(0, 3).map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
              {test.error.detail && <div className="mono" style={{ fontSize: 11, marginTop: 4, wordBreak: "break-word" }}>{test.error.detail}</div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 60, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 20px", borderTop: "1px solid var(--line)" }}>
        {existing && (confirmDelete ? (
          <>
            <span style={{ fontSize: 12, color: "var(--err)" }}>Delete {existing.name}?</span>
            <button className="btn danger sm" onClick={() => { void deleteConnection(existing.id); setOverlay(null); }}>Delete</button>
            <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button className="btn danger-ghost sm" onClick={() => setConfirmDelete(true)}><Icon name="ph-trash" />Delete</button>
        ))}
        {!confirmDelete && (
          <>
            <button className="icon-btn" title="Import connections (JSON)" onClick={() => void importConnectionsFromFile()}><Icon name="ph-download-simple" /></button>
            <button className="icon-btn" title="Export this connection (JSON, without secrets)" onClick={() => void exportConnectionsToFile([c])} disabled={!valid}><Icon name="ph-upload-simple" /></button>
          </>
        )}
        <div className="spacer" />
        <button className="btn lg" onClick={() => void runTest()} disabled={test.s === "testing"}>
          {test.s === "testing" ? <Spinner /> : <Icon name="ph-lightning" />}Test connection
        </button>
        <button className="btn outline lg" onClick={() => setOverlay(null)}>Cancel</button>
        <button className="btn primary lg" style={{ padding: "0 16px" }} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}
