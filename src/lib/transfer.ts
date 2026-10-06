// Import/export through native file dialogs. Exports never contain secrets.
import { useApp } from "../state";
import { files, inTauri, pickOpen, pickSave } from "./rpc";
import type { Connection, KMessage } from "./types";
import { b64ToBytes, bytesToB64, valueBytes } from "./format";

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

function notifyBrowserOnly() {
  useApp.getState().showToast({ tone: "err", title: "Not available in the browser preview", sub: "Run the desktop app (npm run tauri dev)" });
}

export async function importConnectionsFromFile() {
  if (!inTauri) return notifyBrowserOnly();
  const path = await pickOpen(JSON_FILTER);
  if (!path) return;
  const { showToast, importConnections } = useApp.getState();
  try {
    const parsed = JSON.parse(await files.readText(path));
    const list: Connection[] = Array.isArray(parsed) ? parsed : parsed.connections;
    if (!Array.isArray(list)) throw new Error("expected { connections: [...] }");
    const added = await importConnections(list);
    showToast({ tone: "ok", title: `Imported ${list.length} connection${list.length === 1 ? "" : "s"}`, sub: `${added} new · passwords are not part of exports` });
  } catch (e) {
    showToast({ tone: "err", title: "Import failed", sub: e instanceof Error ? e.message : String(e) });
  }
}

export async function exportConnectionsToFile(only?: Connection[]) {
  if (!inTauri) return notifyBrowserOnly();
  const list = only ?? useApp.getState().connections;
  const path = await pickSave(only?.length === 1 ? `${only[0].name || "connection"}.json` : "kafka-suite-connections.json", JSON_FILTER);
  if (!path) return;
  await files.writeText(path, JSON.stringify({ version: 1, connections: list }, null, 2));
  useApp.getState().showToast({ tone: "ok", title: `Exported ${list.length} connection${list.length === 1 ? "" : "s"}`, sub: path });
}

/** Messages as JSON: metadata, key, headers and the value (text when decodable, base64 otherwise). */
export async function exportMessages(topic: string, messages: KMessage[]) {
  if (!inTauri) return notifyBrowserOnly();
  if (!messages.length) return;
  const path = await pickSave(`${topic}-${messages.length}-messages.json`, JSON_FILTER);
  if (!path) return;
  const out = messages.map((m) => ({
    partition: m.partition, offset: m.offset, timestamp: m.timestamp, timestampType: m.timestampType,
    key: m.key, keyBase64: m.keyBase64, headers: m.headers, size: m.size, truncated: m.truncated,
    value: m.kind === "json" ? JSON.parse(m.value!) : m.value, valueBase64: m.valueBase64,
  }));
  await files.writeText(path, JSON.stringify({ topic, exportedAt: new Date().toISOString(), messages: out }, null, 2));
  useApp.getState().showToast({ tone: "ok", title: `Exported ${messages.length} message${messages.length === 1 ? "" : "s"}`, sub: path });
}

export async function saveValue(m: KMessage) {
  if (!inTauri) return notifyBrowserOnly();
  const ext = m.kind === "json" ? "json" : m.kind === "xml" ? "xml" : m.kind === "text" ? "txt" : "bin";
  const path = await pickSave(`p${m.partition}-${m.offset}.${ext}`, [{ name: ext.toUpperCase(), extensions: [ext] }]);
  if (!path) return;
  const bytes = valueBytes(m);
  await files.writeBase64(path, bytesToB64(bytes));
  useApp.getState().showToast({ tone: "ok", title: "Value saved", sub: `${bytes.length} bytes · ${path}` });
}

export async function pickValueFile(): Promise<{ name: string; base64: string; text: string | null } | null> {
  if (!inTauri) {
    notifyBrowserOnly();
    return null;
  }
  const path = await pickOpen([{ name: "Value", extensions: ["json", "xml", "txt", "bin", "dat", "avro", "*"] }]);
  if (!path) return null;
  const base64 = await files.readBase64(path);
  let text: string | null = null;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(b64ToBytes(base64));
  } catch {
    text = null;
  }
  return { name: path.split(/[\\/]/).pop() ?? path, base64, text };
}

export async function pickStore(kind: "truststore" | "keystore"): Promise<string | null> {
  if (!inTauri) {
    notifyBrowserOnly();
    return null;
  }
  const exts = kind === "truststore" ? ["jks", "p12", "pfx", "pem", "crt", "cer"] : ["p12", "pfx", "jks", "pem"];
  return pickOpen([{ name: kind === "truststore" ? "Truststore" : "Keystore", extensions: exts }, { name: "All files", extensions: ["*"] }]);
}
