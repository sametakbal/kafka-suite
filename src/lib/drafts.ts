// Producing messages and reporting the outcome, shared by the Produce dialog and one-click draft sends.
import { useApp } from "../state";
import { api, asKError, type ProduceInput } from "./rpc";
import type { Template } from "./types";

export async function produceAndReport(connId: string, input: ProduceInput, label?: string): Promise<boolean> {
  const { showToast, openMessages, loadTopics } = useApp.getState();
  try {
    const r = await api.produce(connId, { ...input, headers: input.headers.filter((h) => h.key.trim()) });
    const what = r.count > 1 ? `${r.count} messages` : "Message";
    showToast({
      tone: "ok",
      title: label ? `${label} → ${input.topic}` : `${what} sent to ${input.topic}`,
      sub: `${label ? `${what} · ` : ""}partition ${r.partition} · offset ${r.offset} · ${r.elapsedMs} ms`,
      actions: [{ label: "Open topic", run: () => openMessages(connId, input.topic) }],
    });
    void loadTopics(connId);
    return true;
  } catch (e) {
    const err = asKError(e);
    showToast({ tone: "err", title: `Produce to ${input.topic} failed`, sub: `${err.name}: ${err.message}` });
    return false;
  }
}

/** The connection a draft goes to: its own if it still exists, else the one in focus. */
export function draftConnId(t: Template): string | null {
  const s = useApp.getState();
  if (t.connId && s.connections.some((c) => c.id === t.connId)) return t.connId;
  const active = s.tabs.find((x) => x.id === s.activeTab);
  return active?.connId ?? s.focusConn;
}

/** Sends a saved draft to its topic as-is, connecting first when needed. */
export async function sendDraft(t: Template): Promise<boolean> {
  const s = useApp.getState();
  const connId = draftConnId(t);
  if (!connId || !t.topic) {
    s.setOverlay(connId ? { kind: "produce", connId, topic: t.topic ?? "", draftName: t.name } : { kind: "connection" });
    return false;
  }
  if (s.status[connId]?.state !== "connected" && !(await s.connect(connId))) {
    const err = useApp.getState().status[connId]?.error;
    s.showToast({ tone: "err", title: `Could not connect for "${t.name}"`, sub: err ? `${err.name}: ${err.message}` : undefined });
    return false;
  }
  return produceAndReport(connId, {
    topic: t.topic, key: t.key || null, value: t.value, headers: t.headers, partition: t.partition, count: t.count ?? 1,
  }, t.name);
}
