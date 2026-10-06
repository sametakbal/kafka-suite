import type {
  ClusterInfo, Connection, KError, LiveBatch, LiveFailure, MessagesResult, ProduceHeader, ProduceResult, TopicInfo,
} from "./types";

/** True inside the Tauri webview; plain `vite` in a browser falls back to the mock backend. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) return (await import("./mock")).mockBackend(cmd, args ?? {}) as Promise<T>;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export class KafkaCallError extends Error {
  constructor(public readonly err: KError) {
    super(`${err.name}: ${err.message}`);
  }
}

async function kafka<T>(method: string, params: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>("kafka_call", { method, params });
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && "message" in e && "code" in e) throw new KafkaCallError(e as KError);
    throw new KafkaCallError({ code: 0, name: "UNEXPECTED", message: String(e) });
  }
}

export function asKError(e: unknown): KError {
  if (e instanceof KafkaCallError) return e.err;
  return { code: 0, name: "UNEXPECTED", message: e instanceof Error ? e.message : String(e) };
}

/** Secrets typed in the form; null means "use what is saved" (filled in from the keyring by Tauri). */
export interface ConnSecrets {
  password?: string | null;
  truststorePassword?: string | null;
  keystorePassword?: string | null;
}

function wireConn(c: Connection, s: ConnSecrets = {}) {
  return {
    id: c.id, bootstrap: c.bootstrap, securityProtocol: c.securityProtocol, saslMechanism: c.saslMechanism,
    username: c.username, password: s.password ?? null,
    ssl: {
      ...c.ssl,
      truststorePassword: s.truststorePassword ?? null,
      keystorePassword: s.keystorePassword ?? null,
    },
  };
}

export interface ProduceInput {
  topic: string;
  key: string | null;
  value?: string;
  valueBase64?: string;
  headers: ProduceHeader[];
  partition: number | null;
  count: number;
}

export const api = {
  test: (c: Connection, s?: ConnSecrets) => kafka<ClusterInfo>("test", { conn: wireConn(c, s) }),
  connect: (c: Connection, s?: ConnSecrets) => kafka<ClusterInfo>("connect", { conn: wireConn(c, s) }),
  disconnect: (connId: string) => kafka<{ ok: boolean }>("disconnect", { connId }),
  clusterInfo: (connId: string) => kafka<ClusterInfo>("clusterInfo", { connId }),
  listTopics: (connId: string) => kafka<TopicInfo[]>("listTopics", { connId }),
  createTopic: (connId: string, name: string, partitions: number, replicationFactor: number, configs: Record<string, string>) =>
    kafka<{ ok: boolean }>("createTopic", { connId, name, partitions, replicationFactor, configs }),
  getMessages: (connId: string, topic: string, limit: number) => kafka<MessagesResult>("getMessages", { connId, topic, limit }),
  startLiveTail: (connId: string, topic: string) => kafka<{ tailId: number }>("startLiveTail", { connId, topic }),
  stopLiveTail: () => kafka<{ stopped: boolean }>("stopLiveTail", {}),
  produce: (connId: string, p: ProduceInput) => kafka<ProduceResult>("produce", { connId, ...p }),
};

type Unlisten = () => void;

/** Live tail records and failures pushed by the sidecar. */
export const events = {
  async onLive(fn: (b: LiveBatch) => void): Promise<Unlisten> {
    if (!inTauri) return (await import("./mock")).mockListen("kafka:live", fn as (d: unknown) => void);
    const { listen } = await import("@tauri-apps/api/event");
    return listen<LiveBatch>("kafka:live", (e) => fn(e.payload));
  },
  async onLiveError(fn: (f: LiveFailure) => void): Promise<Unlisten> {
    if (!inTauri) return (await import("./mock")).mockListen("kafka:liveError", fn as (d: unknown) => void);
    const { listen } = await import("@tauri-apps/api/event");
    return listen<LiveFailure>("kafka:liveError", (e) => fn(e.payload));
  },
};

export type DocName = "connections" | "settings" | "templates";

/** Connection as the Electron app (v1) saved it. */
export interface LegacyConnection {
  id?: string;
  name?: string;
  brokers?: string;
  securityProtocol?: string;
  saslMechanism?: string;
  saslUsername?: string;
  saslPassword?: string;
}

export const store = {
  read: <T>(name: DocName) => invoke<T | null>("doc_read", { name }),
  write: (name: DocName, value: unknown) => invoke<void>("doc_write", { name, value }),
  legacyConnections: () => invoke<{ connections?: LegacyConnection[] } | null>("legacy_connections"),
  dataDir: () => invoke<string>("data_dir"),
};

export const secrets = {
  get: (key: string) => invoke<string | null>("secret_get", { key }),
  set: (key: string, value: string) => invoke<void>("secret_set", { key, value }),
  delete: (key: string) => invoke<void>("secret_delete", { key }),
};

export const files = {
  readText: (path: string) => invoke<string>("file_read_text", { path }),
  readBase64: (path: string) => invoke<string>("file_read_base64", { path }),
  writeText: (path: string, contents: string) => invoke<void>("file_write_text", { path, contents }),
  writeBase64: (path: string, data: string) => invoke<void>("file_write_base64", { path, data }),
};

type Filter = { name: string; extensions: string[] };

export async function pickOpen(filters: Filter[]): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, directory: false, filters });
  return typeof r === "string" ? r : null;
}

export async function pickSave(defaultPath: string, filters: Filter[]): Promise<string | null> {
  if (!inTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath, filters });
}

export async function setWindowTitle(title: string) {
  document.title = title;
  if (!inTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

/** Keyring keys for a connection's secrets. */
export const secretKey = {
  password: (id: string) => id,
  truststore: (id: string) => `${id}:truststore`,
  keystore: (id: string) => `${id}:keystore`,
};
