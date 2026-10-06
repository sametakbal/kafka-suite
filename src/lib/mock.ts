// In-browser stand-in for the Tauri commands, used only when the UI runs under plain `vite`
// (no Tauri webview). It lets the screens be previewed and styled without a Kafka cluster.
import type { ClusterInfo, KError, LiveBatch, RawMessage, TopicInfo } from "./types";

const docs: Record<string, unknown> = {};
const keyring: Record<string, string> = {};
const connected = new Set<string>();
const listeners = new Map<string, Set<(d: unknown) => void>>();

interface MockTopic {
  info: TopicInfo;
  messages: RawMessage[];
}

const topics = new Map<string, MockTopic>();

const NAMES = ["johndoe", "ayse.k", "mehmet", "zeynep", "alice", "bob", "carol", "deniz"];
const LANGS = ["Python", "Go", "Java", "Rust", "TypeScript", "Kotlin"];

function userEvent(i: number) {
  const name = NAMES[i % NAMES.length];
  return {
    userId: 1000 + i, username: name, isActive: i % 3 !== 0,
    profile: { age: 21 + ((i * 7) % 30), city: ["Istanbul", "Ankara", "Izmir", "Berlin"][i % 4] },
    languages: LANGS.filter((_, k) => (i + k) % 3 === 0),
    roles: [{ roleName: i % 4 === 0 ? "Admin" : "User", since: 2019 + (i % 6) }],
    phoneNumber: i % 5 === 0 ? null : `+90 5${String(300000000 + i * 7919).slice(0, 9)}`,
  };
}

function seed(name: string, partitions: number, count: number, make: (i: number) => { key: string | null; value: string | null; headers?: { key: string; value: string }[] }, internal = false) {
  const base = Date.now() - count * 41_000;
  const messages: RawMessage[] = [];
  const next = new Array(partitions).fill(0);
  for (let i = 0; i < count; i++) {
    const p = (i * 7) % partitions;
    const { key, value, headers = [] } = make(i);
    messages.push({
      partition: p, offset: next[p]++, timestamp: base + i * 41_000 + ((i * 389) % 1000), timestampType: "CreateTime",
      key, keyBase64: null, value, valueBase64: null, size: value ? new TextEncoder().encode(value).length : 0,
      truncated: false, tombstone: value == null, headers,
    });
  }
  topics.set(name, { info: { name, partitions, replicationFactor: internal ? 1 : 3, internal, messages: count }, messages });
}

seed("user.events", 6, 240, (i) => ({
  key: `user-${1000 + (i % 40)}`, value: JSON.stringify(userEvent(i)),
  headers: [{ key: "source", value: i % 2 ? "mobile" : "web" }, { key: "trace-id", value: (i * 2654435761 >>> 0).toString(16) }],
}));
seed("orders.created", 12, 1800, (i) => ({
  key: `ord-${50000 + i}`,
  value: JSON.stringify({ orderId: 50000 + i, amount: Math.round(((i * 37) % 900) * 1.13 * 100) / 100, currency: "TRY", items: (i % 4) + 1, status: ["NEW", "PAID", "SHIPPED"][i % 3] }),
}));
seed("payments.xml", 3, 60, (i) => ({
  key: null,
  value: `<?xml version="1.0"?><Payment id="P${7000 + i}"><Amount currency="EUR">${(i * 13) % 500}.00</Amount><Status>${i % 2 ? "OK" : "PENDING"}</Status></Payment>`,
}));
seed("user.profiles.compacted", 3, 30, (i) => ({ key: `user-${1000 + i}`, value: i % 7 === 0 ? null : JSON.stringify(userEvent(i)) }));
seed("logs.text", 1, 80, (i) => ({ key: null, value: `2026-10-06 12:${String(i % 60).padStart(2, "0")}:00 INFO  [worker-${i % 4}] processed batch ${i}\r\n` }));
seed("__consumer_offsets", 50, 0, () => ({ key: null, value: null }), true);
topics.get("logs.text")!.messages.push({
  partition: 0, offset: 80, timestamp: Date.now(), timestampType: "CreateTime", key: "bin", keyBase64: null, value: null,
  valueBase64: btoa(String.fromCharCode(0, 1, 2, 0xff, 0xfe, 0x41, 0x42, 0x43, 0x10, 0x20)), size: 10, truncated: false, tombstone: false, headers: [],
});

function err(name: string, message: string, code = 0): KError {
  return { code, name, message, detail: null };
}

function cluster(connId: string): ClusterInfo {
  return {
    clusterId: `mK${connId.slice(0, 4)}Q3v9TzeZp2fWxA`, controller: 1, topics: topics.size, elapsedMs: 38 + (connId.length % 20),
    brokers: [1, 2, 3].map((id) => ({ id, host: `kafka-${id}.local`, port: 9092, rack: `rack-${(id % 2) + 1}` })),
  };
}

function need(connId: unknown) {
  if (!connected.has(String(connId))) throw err("NOT_CONNECTED", "This cluster is not connected");
}

function emit(event: string, data: unknown) {
  for (const fn of listeners.get(event) ?? []) fn(data);
}

export function mockListen(event: string, fn: (d: unknown) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

let tail: { id: number; timer: ReturnType<typeof setInterval> } | null = null;
let tailIds = 0;

function stopTail() {
  if (tail) clearInterval(tail.timer);
  const was = !!tail;
  tail = null;
  return was;
}

function append(name: string, key: string | null, value: string | null, headers: { key: string; value: string }[], partition: number | null) {
  const t = topics.get(name)!;
  const p = partition ?? Math.floor(Math.random() * t.info.partitions);
  const offset = t.messages.filter((m) => m.partition === p).length;
  const m: RawMessage = {
    partition: p, offset, timestamp: Date.now(), timestampType: "CreateTime", key, keyBase64: null, value, valueBase64: null,
    size: value ? new TextEncoder().encode(value).length : 0, truncated: false, tombstone: value == null, headers,
  };
  t.messages.push(m);
  t.info.messages = (t.info.messages ?? 0) + 1;
  return m;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockBackend(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  await delay(cmd === "kafka_call" ? 120 + Math.random() * 200 : 5);
  switch (cmd) {
    case "doc_read":
      return docs[String(args.name)] ?? null;
    case "doc_write":
      docs[String(args.name)] = args.value;
      return null;
    case "legacy_connections":
      return null;
    case "data_dir":
      return "~/.kafka-suite";
    case "secret_get":
      return keyring[String(args.key)] ?? null;
    case "secret_set":
      keyring[String(args.key)] = String(args.value);
      return null;
    case "secret_delete":
      delete keyring[String(args.key)];
      return null;
    case "kafka_call":
      return kafkaCall(String(args.method), (args.params ?? {}) as Record<string, unknown>);
    default:
      throw new Error(`mock: ${cmd} is only available in the desktop app`);
  }
}

async function kafkaCall(method: string, p: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "test":
    case "connect": {
      const conn = p.conn as { id: string; bootstrap: string };
      if (/bad|:1$/.test(conn.bootstrap)) {
        await delay(900);
        throw err("TimeoutException", "Timed out waiting for a node assignment. Call: listNodes", 7);
      }
      if (method === "connect") connected.add(conn.id);
      return cluster(conn.id);
    }
    case "disconnect":
      connected.delete(String(p.connId));
      stopTail();
      return { ok: true };
    case "clusterInfo":
      need(p.connId);
      return cluster(String(p.connId));
    case "listTopics":
      need(p.connId);
      return [...topics.values()].map((t) => ({ ...t.info })).sort((a, b) => a.name.localeCompare(b.name));
    case "createTopic": {
      need(p.connId);
      const name = String(p.name);
      if (topics.has(name)) throw err("TopicExistsException", `Topic '${name}' already exists.`, 36);
      if (Number(p.replicationFactor) > 3) {
        throw err("InvalidReplicationFactorException", `Unable to replicate the partition ${p.replicationFactor} time(s): only 3 broker(s) are registered.`, 38);
      }
      topics.set(name, { info: { name, partitions: Number(p.partitions), replicationFactor: Number(p.replicationFactor), internal: false, messages: 0 }, messages: [] });
      return { ok: true };
    }
    case "getMessages": {
      need(p.connId);
      const t = topics.get(String(p.topic));
      if (!t) throw err("UnknownTopicOrPartitionException", `Topic ${p.topic} does not exist on this cluster`);
      const limit = Number(p.limit);
      const latest = [...t.messages].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
      return { topic: t.info.name, partitions: t.info.partitions, messages: latest, complete: true, elapsedMs: 42 };
    }
    case "startLiveTail": {
      need(p.connId);
      const name = String(p.topic);
      if (!topics.has(name)) throw err("UnknownTopicOrPartitionException", `Topic ${name} does not exist on this cluster`);
      stopTail();
      const id = ++tailIds;
      let i = 0;
      tail = {
        id,
        timer: setInterval(() => {
          const n = 1 + (i % 3 === 0 ? 1 : 0);
          const messages: RawMessage[] = [];
          for (let k = 0; k < n; k++, i++) {
            messages.push(append(name, `user-${1000 + (i % 40)}`, JSON.stringify({ ...userEvent(i + 300), live: true }), [{ key: "source", value: "live" }], null));
          }
          const batch: LiveBatch = { tailId: id, connId: String(p.connId), topic: name, messages };
          emit("kafka:live", batch);
        }, 1400),
      };
      return { tailId: id };
    }
    case "stopLiveTail":
      return { stopped: stopTail() };
    case "produce": {
      need(p.connId);
      const name = String(p.topic);
      if (!topics.has(name)) throw err("UnknownTopicOrPartitionException", `Topic ${name} does not exist on this cluster`);
      const count = Number(p.count ?? 1);
      let last: RawMessage | null = null;
      const value = p.valueBase64 != null ? atob(String(p.valueBase64)) : p.value == null ? null : String(p.value);
      for (let i = 0; i < count; i++) {
        last = append(name, (p.key as string | null) ?? null, value, (p.headers as { key: string; value: string }[]) ?? [], (p.partition as number | null) ?? null);
      }
      return { count, partition: last!.partition, offset: last!.offset, timestamp: last!.timestamp, elapsedMs: 9 };
    }
    default:
      throw err("INVALID_REQUEST", `Unknown method ${method}`);
  }
}
