import { create } from "zustand";
import { api, asKError, events, secretKey, secrets, store, type ConnSecrets, type LegacyConnection } from "./lib/rpc";
import { decorate, newestFirst, uid } from "./lib/format";
import type {
  ClusterInfo, Connection, KError, KMessage, LiveBatch, LiveFailure, ProduceHeader, SaslMechanism, SecurityProtocol, Settings,
  Template, TopicInfo,
} from "./lib/types";

export type ConnState = "disconnected" | "connecting" | "connected" | "error";

export interface ConnStatus {
  state: ConnState;
  info?: ClusterInfo;
  error?: KError;
  attempt: number;
  lastAttempt?: Date;
  topics?: TopicInfo[];
  topicsError?: KError;
  topicsLoading?: boolean;
  topicsAt?: Date;
}

export interface Tab {
  id: string;
  kind: "topics" | "messages";
  connId: string;
  topic?: string;
}

export type DetailTab = "value" | "key" | "headers";
export type PayloadView = "text" | "json" | "xml" | "hex";
export type SortOrder = "newest" | "oldest";

/** State of one topic's message tab. Messages are kept newest first. */
export interface TopicView {
  loading: boolean;
  error?: KError;
  messages: KMessage[];
  partitions: number;
  /** False when reading stopped at the deadline before every partition was read. */
  complete: boolean;
  loadedAt?: Date;
  selected: string | null;
  checked: Record<string, true>;
  fresh: Record<string, true>;
  query: string;
  sort: SortOrder;
  live: boolean;
  liveStarting: boolean;
  /** Messages received since the live tail started. */
  liveCount: number;
  tailId: number | null;
  detailTab: DetailTab;
  pview: PayloadView | null;
  detailClosed: boolean;
}

export interface ProduceDraft {
  value: string;
  valueBase64?: string;
  fileName?: string;
  key: string;
  headers: ProduceHeader[];
  partition: number | null;
  count: number;
}

export type Overlay =
  | { kind: "connection"; connId?: string }
  | { kind: "produce"; connId: string; topic: string; draft?: Partial<ProduceDraft>; draftName?: string }
  | { kind: "createTopic"; connId: string }
  | { kind: "settings" }
  | { kind: "palette" };

export interface Toast {
  id: number;
  tone: "ok" | "err";
  title: string;
  sub?: string;
  actions?: { label: string; run: () => void }[];
}

export const DEFAULT_SETTINGS: Settings = { theme: "dark", messageLimit: 50, liveBuffer: 100, showControlChars: false };

export function newConnection(): Connection {
  return {
    id: uid(), name: "", folder: "DEV", env: "DEV", color: 3, bootstrap: "localhost:9092", securityProtocol: "PLAINTEXT",
    saslMechanism: "PLAIN", username: "", savePassword: true, ssl: { truststore: "", keystore: "", verifyHostname: true },
  };
}

function newView(): TopicView {
  return {
    loading: true, messages: [], partitions: 0, complete: true, selected: null, checked: {}, fresh: {}, query: "", sort: "newest",
    live: false, liveStarting: false, liveCount: 0, tailId: null, detailTab: "value", pview: null, detailClosed: false,
  };
}

interface AppState {
  ready: boolean;
  connections: Connection[];
  settings: Settings;
  templates: Template[];
  status: Record<string, ConnStatus>;
  tabs: Tab[];
  activeTab: string | null;
  views: Record<string, TopicView>;
  overlay: Overlay | null;
  toast: Toast | null;
  /** Connection highlighted when no tab is open (sidebar selection). */
  focusConn: string | null;

  init: () => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
  saveTemplates: (t: Template[]) => Promise<void>;
  saveConnection: (c: Connection, s: ConnSecrets) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  importConnections: (list: Connection[]) => Promise<number>;

  connect: (id: string) => Promise<boolean>;
  disconnect: (id: string) => Promise<void>;
  loadTopics: (id: string) => Promise<void>;

  openTopics: (connId: string) => void;
  openMessages: (connId: string, topic: string) => void;
  activate: (tabId: string) => void;
  closeTab: (tabId: string) => void;

  refreshMessages: (tabId: string) => Promise<void>;
  startLive: (tabId: string) => Promise<void>;
  stopLive: (tabId: string) => Promise<void>;
  patchView: (tabId: string, patch: Partial<TopicView> | ((v: TopicView) => Partial<TopicView>)) => void;

  setOverlay: (o: Overlay | null) => void;
  showToast: (t: Omit<Toast, "id">) => void;
  closeToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Secrets typed for connections that must not be saved; kept in memory for this session only. */
const sessionSecrets = new Map<string, ConnSecrets>();

export const useApp = create<AppState>((set, get) => {
  const setStatus = (id: string, patch: Partial<ConnStatus>) =>
    set((s) => ({ status: { ...s.status, [id]: { ...(s.status[id] ?? { state: "disconnected", attempt: 0 }), ...patch } } }));

  const persistConnections = (connections: Connection[]) => store.write("connections", { version: 1, connections });

  /** Tabs whose live tail belongs to the sidecar's current tail; at most one. */
  const liveTabs = () => Object.entries(get().views).filter(([, v]) => v.live || v.liveStarting).map(([id]) => id);

  const onLive = (b: LiveBatch) => {
    const tabId = Object.keys(get().views).find((id) => get().views[id].tailId === b.tailId);
    if (!tabId) return;
    const incoming = b.messages.map(decorate).sort(newestFirst);
    const max = get().settings.liveBuffer;
    get().patchView(tabId, (v) => {
      const messages = [...incoming, ...v.messages].slice(0, max);
      const ids = new Set(messages.map((m) => m.id));
      const fresh: Record<string, true> = {};
      for (const m of incoming) fresh[m.id] = true;
      const checked: Record<string, true> = {};
      for (const k of Object.keys(v.checked)) if (ids.has(k)) checked[k] = true;
      return {
        messages, fresh, checked, liveCount: v.liveCount + incoming.length, loadedAt: new Date(),
        selected: v.selected && ids.has(v.selected) ? v.selected : null,
      };
    });
  };

  const onLiveError = (f: LiveFailure) => {
    const tabId = Object.keys(get().views).find((id) => get().views[id].tailId === f.tailId);
    if (!tabId) return;
    get().patchView(tabId, { live: false, liveStarting: false, tailId: null });
    get().showToast({ tone: "err", title: `Live tail on ${f.topic} stopped`, sub: `${f.error.name}: ${f.error.message}` });
  };

  return {
    ready: false,
    connections: [],
    settings: DEFAULT_SETTINGS,
    templates: [],
    status: {},
    tabs: [],
    activeTab: null,
    views: {},
    overlay: null,
    toast: null,
    focusConn: null,

    async init() {
      void events.onLive(onLive);
      void events.onLiveError(onLiveError);
      const [conns, settings, templates] = await Promise.all([
        store.read<{ connections: Connection[] }>("connections"),
        store.read<Settings>("settings"),
        store.read<{ templates: Template[] }>("templates"),
      ]);
      let connections = conns?.connections ?? [];
      let imported = 0;
      if (!conns) {
        const legacy = await store.legacyConnections().catch(() => null);
        if (legacy?.connections?.length) {
          connections = await importLegacy(legacy.connections);
          imported = connections.length;
          if (imported) await persistConnections(connections);
        }
      }
      set({
        ready: true, connections, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) }, templates: templates?.templates ?? [],
        focusConn: connections[0]?.id ?? null,
      });
      if (imported) {
        get().showToast({ tone: "ok", title: `Imported ${imported} connection${imported === 1 ? "" : "s"} from Kafka Suite 1.x`, sub: "Passwords were moved to the OS keychain" });
      }
    },

    async saveSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      await store.write("settings", settings);
    },

    async saveTemplates(templates) {
      set({ templates });
      await store.write("templates", { templates });
    },

    async saveConnection(c, s) {
      const list = get().connections;
      const exists = list.some((x) => x.id === c.id);
      const connections = exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
      if (c.savePassword) {
        if (s.password) await secrets.set(secretKey.password(c.id), s.password);
        if (s.truststorePassword) await secrets.set(secretKey.truststore(c.id), s.truststorePassword);
        if (s.keystorePassword) await secrets.set(secretKey.keystore(c.id), s.keystorePassword);
        sessionSecrets.delete(c.id);
      } else {
        await forgetSecrets(c.id);
        if (s.password || s.truststorePassword || s.keystorePassword) sessionSecrets.set(c.id, s);
      }
      set({ connections, focusConn: c.id });
      await persistConnections(connections);
      // Settings changed under a live connection: reconnect so the next call uses them.
      if (exists && get().status[c.id]?.state === "connected") {
        await get().disconnect(c.id);
        void get().connect(c.id);
      }
    },

    async deleteConnection(id) {
      await get().disconnect(id).catch(() => undefined);
      await forgetSecrets(id);
      sessionSecrets.delete(id);
      const connections = get().connections.filter((c) => c.id !== id);
      set((s) => {
        const tabs = s.tabs.filter((t) => t.connId !== id);
        const { [id]: _gone, ...status } = s.status;
        void _gone;
        return {
          connections, tabs, status, activeTab: tabs.some((t) => t.id === s.activeTab) ? s.activeTab : tabs[0]?.id ?? null,
          focusConn: connections[0]?.id ?? null,
        };
      });
      await persistConnections(connections);
    },

    async importConnections(incoming) {
      const list = [...get().connections];
      let added = 0;
      for (const raw of incoming) {
        const base = newConnection();
        const c: Connection = { ...base, ...raw, ssl: { ...base.ssl, ...(raw.ssl ?? {}) } };
        const i = list.findIndex((x) => x.id === c.id || x.name === c.name);
        if (i >= 0) list[i] = { ...c, id: list[i].id };
        else {
          list.push(c);
          added++;
        }
      }
      set({ connections: list });
      await persistConnections(list);
      return added;
    },

    async connect(id) {
      const c = get().connections.find((x) => x.id === id);
      if (!c) return false;
      const prev = get().status[id];
      setStatus(id, { state: "connecting", error: undefined, attempt: (prev?.attempt ?? 0) + 1, lastAttempt: new Date() });
      try {
        const info = await api.connect(c, sessionSecrets.get(id));
        setStatus(id, { state: "connected", info, error: undefined, attempt: 0 });
        void get().loadTopics(id);
        return true;
      } catch (e) {
        setStatus(id, { state: "error", error: asKError(e) });
        return false;
      }
    },

    async disconnect(id) {
      for (const t of get().tabs) {
        if (t.connId === id) get().patchView(t.id, { live: false, liveStarting: false, tailId: null });
      }
      setStatus(id, { state: "disconnected", info: undefined, error: undefined, topics: undefined, topicsError: undefined, attempt: 0 });
      await api.disconnect(id).catch(() => undefined);
    },

    async loadTopics(id) {
      setStatus(id, { topicsLoading: true });
      try {
        const [topics, info] = await Promise.all([api.listTopics(id), api.clusterInfo(id).catch(() => undefined)]);
        setStatus(id, { topics, topicsError: undefined, topicsLoading: false, topicsAt: new Date(), ...(info ? { info } : {}) });
      } catch (e) {
        setStatus(id, { topicsError: asKError(e), topicsLoading: false, topicsAt: new Date() });
      }
    },

    openTopics(connId) {
      const existing = get().tabs.find((t) => t.kind === "topics" && t.connId === connId);
      if (existing) {
        set({ activeTab: existing.id, focusConn: connId });
      } else {
        const tab: Tab = { id: uid(), kind: "topics", connId };
        set((s) => ({ tabs: [...s.tabs, tab], activeTab: tab.id, focusConn: connId }));
      }
      if (get().status[connId]?.state !== "connected") void get().connect(connId);
    },

    openMessages(connId, topic) {
      const existing = get().tabs.find((t) => t.kind === "messages" && t.connId === connId && t.topic === topic);
      if (existing) {
        set({ activeTab: existing.id, focusConn: connId });
        return;
      }
      const tab: Tab = { id: uid(), kind: "messages", connId, topic };
      set((s) => ({ tabs: [...s.tabs, tab], activeTab: tab.id, focusConn: connId, views: { ...s.views, [tab.id]: newView() } }));
      void get().refreshMessages(tab.id);
    },

    activate(tabId) {
      const t = get().tabs.find((x) => x.id === tabId);
      set({ activeTab: tabId, focusConn: t?.connId ?? get().focusConn });
    },

    closeTab(tabId) {
      if (get().views[tabId]?.live) void get().stopLive(tabId);
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === tabId);
        const tabs = s.tabs.filter((t) => t.id !== tabId);
        const { [tabId]: _gone, ...views } = s.views;
        void _gone;
        const activeTab = s.activeTab === tabId ? tabs[Math.min(idx, tabs.length - 1)]?.id ?? null : s.activeTab;
        return { tabs, views, activeTab };
      });
    },

    async refreshMessages(tabId) {
      const tab = get().tabs.find((t) => t.id === tabId);
      const v = get().views[tabId];
      if (!tab?.topic || !v || v.live) return;
      get().patchView(tabId, { loading: true, error: undefined });
      try {
        if (get().status[tab.connId]?.state !== "connected" && !(await get().connect(tab.connId))) {
          throw get().status[tab.connId]?.error ?? new Error("not connected");
        }
        const res = await api.getMessages(tab.connId, tab.topic, get().settings.messageLimit);
        const messages = res.messages.map(decorate).sort(newestFirst);
        get().patchView(tabId, (cur) => {
          const ids = new Set(messages.map((m) => m.id));
          const checked: Record<string, true> = {};
          for (const k of Object.keys(cur.checked)) if (ids.has(k)) checked[k] = true;
          const selected = cur.selected && ids.has(cur.selected) ? cur.selected : null;
          return {
            loading: false, error: undefined, messages, partitions: res.partitions, complete: res.complete, loadedAt: new Date(),
            checked, selected, fresh: {}, liveCount: 0,
          };
        });
      } catch (e) {
        const err = e && typeof e === "object" && "code" in e && "name" in e ? (e as KError) : asKError(e);
        get().patchView(tabId, { loading: false, error: err });
      }
    },

    async startLive(tabId) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab?.topic) return;
      // The sidecar runs one tail at a time: starting here stops it in any other tab.
      for (const other of liveTabs()) if (other !== tabId) get().patchView(other, { live: false, liveStarting: false, tailId: null });
      get().patchView(tabId, { liveStarting: true, error: undefined });
      try {
        const { tailId } = await api.startLiveTail(tab.connId, tab.topic);
        // Live view starts empty and shows only what arrives from now on.
        get().patchView(tabId, { live: true, liveStarting: false, tailId, messages: [], liveCount: 0, fresh: {}, checked: {}, selected: null });
      } catch (e) {
        get().patchView(tabId, { live: false, liveStarting: false, tailId: null });
        const err = asKError(e);
        get().showToast({ tone: "err", title: `Could not start live tail on ${tab.topic}`, sub: `${err.name}: ${err.message}` });
      }
    },

    async stopLive(tabId) {
      get().patchView(tabId, { live: false, liveStarting: false, tailId: null, fresh: {} });
      await api.stopLiveTail().catch(() => undefined);
    },

    patchView(tabId, patch) {
      set((s) => {
        const cur = s.views[tabId];
        if (!cur) return {};
        const p = typeof patch === "function" ? patch(cur) : patch;
        return { views: { ...s.views, [tabId]: { ...cur, ...p } } };
      });
    },

    setOverlay(overlay) {
      set({ overlay });
    },

    showToast(t) {
      clearTimeout(toastTimer);
      const toast = { ...t, id: Date.now() };
      set({ toast });
      toastTimer = setTimeout(() => {
        if (get().toast?.id === toast.id) set({ toast: null });
      }, 6000);
    },

    closeToast() {
      set({ toast: null });
    },
  };
});

async function forgetSecrets(id: string) {
  await Promise.all([
    secrets.delete(secretKey.password(id)), secrets.delete(secretKey.truststore(id)), secrets.delete(secretKey.keystore(id)),
  ]).catch(() => undefined);
}

const PROTOCOLS: SecurityProtocol[] = ["PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"];
const MECHANISMS: SaslMechanism[] = ["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"];

/** Kafka Suite 1.x (Electron) connections; passwords go to the keyring, never to connections.json. */
async function importLegacy(list: LegacyConnection[]): Promise<Connection[]> {
  const out: Connection[] = [];
  for (const r of list) {
    const c = newConnection();
    c.name = r.name || r.brokers || "Imported";
    c.bootstrap = r.brokers || c.bootstrap;
    const protocol = (r.securityProtocol ?? "").toUpperCase() as SecurityProtocol;
    c.securityProtocol = PROTOCOLS.includes(protocol) ? protocol : "PLAINTEXT";
    const mechanism = (r.saslMechanism ?? "").toUpperCase() as SaslMechanism;
    c.saslMechanism = MECHANISMS.includes(mechanism) ? mechanism : "PLAIN";
    c.username = r.saslUsername ?? "";
    c.folder = "Imported";
    if (r.saslPassword) await secrets.set(secretKey.password(c.id), r.saslPassword).catch(() => undefined);
    out.push(c);
  }
  return out;
}

/** Selectors used in several components. */
export const activeTabOf = (s: AppState) => s.tabs.find((t) => t.id === s.activeTab) ?? null;
export const connOf = (s: AppState, id: string | null | undefined) => s.connections.find((c) => c.id === id) ?? null;
