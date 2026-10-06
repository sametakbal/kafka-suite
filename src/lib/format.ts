import type { Env, KMessage, Kind, RawMessage } from "./types";

export const n = (x: number) => x.toLocaleString("en-US");

export function bytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const pad = (v: number, w = 2) => String(v).padStart(w, "0");

/** YYYY-MM-DD HH:MM:SS.mmm in local time. */
export function stamp(ms: number) {
  if (!(ms >= 0)) return "—";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function clock(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const ENV_COLOR: Record<Env, string> = { DEV: "var(--ok)", TEST: "var(--warn)", PROD: "var(--prod)" };

export const SWATCHES = [
  "oklch(0.62 0.2 25)", "oklch(0.78 0.14 70)", "oklch(0.72 0.14 150)",
  "oklch(0.74 0.12 200)", "oklch(0.64 0.15 270)", "oklch(0.68 0.15 330)",
];

/** One colour per partition (cycling), for the bar at the left of each message row. */
const PARTITION_COLORS = [
  "oklch(0.74 0.12 200)", "oklch(0.72 0.14 150)", "oklch(0.78 0.14 70)", "oklch(0.68 0.15 330)",
  "oklch(0.64 0.15 270)", "oklch(0.7 0.16 25)", "oklch(0.76 0.1 110)", "oklch(0.7 0.12 240)",
];
export const partitionColor = (p: number) => PARTITION_COLORS[p % PARTITION_COLORS.length];

/** Kafka-style wildcard filter used by the topic list (orders.*). */
export function wildcard(pattern: string): (s: string) => boolean {
  const p = pattern.trim();
  if (!p) return () => true;
  if (!p.includes("*")) return (s) => s.toLowerCase().includes(p.toLowerCase());
  const re = new RegExp("^" + p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
  return (s) => re.test(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The value's bytes, for the hex view and saving to a file. */
export function valueBytes(m: RawMessage): Uint8Array {
  if (m.valueBase64 != null) return b64ToBytes(m.valueBase64);
  return new TextEncoder().encode(m.value ?? "");
}

function kindOf(m: RawMessage): Kind {
  if (m.tombstone) return "null";
  if (m.value == null) return "binary";
  const t = m.value.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      JSON.parse(m.value);
      return "json";
    } catch {
      return "text";
    }
  }
  if (t.startsWith("<")) return "xml";
  return "text";
}

export function decorate(m: RawMessage): KMessage {
  const kind = kindOf(m);
  let preview: string | null = null;
  if (m.value != null) {
    preview = kind === "json" ? JSON.stringify(JSON.parse(m.value)) : m.value;
    preview = preview.replace(/\s+/g, " ").slice(0, 300);
  }
  return { ...m, id: `${m.partition}-${m.offset}`, kind, preview };
}

/** Newest first: by timestamp, then offset. */
export function newestFirst(a: KMessage, b: KMessage) {
  return b.timestamp - a.timestamp || b.partition - a.partition || b.offset - a.offset;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
