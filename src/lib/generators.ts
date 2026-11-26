// Placeholders like {{uuid}} or {{randomInt(1, 100)}} in a message's value, key and headers.
// They are filled in separately for every message sent, so "Send count" can produce varied test data.
// An unknown name, or arguments that do not fit, leave the text as it was.
import type { ProduceHeader } from "./types";

export interface GenContext {
  /** 1-based position of the message within one send. */
  index: number;
  /** Time of the send, shared by all its messages. */
  now: number;
}

export interface GenFunction {
  name: string;
  /** What to insert from the picker. */
  insert: string;
  description: string;
}

/** Shown in the Produce dialog's Functions menu. */
export const GEN_FUNCTIONS: GenFunction[] = [
  { name: "uuid", insert: "{{uuid}}", description: "Random UUID v4" },
  { name: "randomString", insert: "{{randomString(12)}}", description: "Letters and digits, given length" },
  { name: "randomInt", insert: "{{randomInt(1, 1000)}}", description: "Whole number, min to max" },
  { name: "randomDecimal", insert: "{{randomDecimal(0, 100, 2)}}", description: "Number with decimals, min to max" },
  { name: "randomBool", insert: "{{randomBool}}", description: "true or false" },
  { name: "randomItem", insert: "{{randomItem(red, green, blue)}}", description: "One of the given values" },
  { name: "index", insert: "{{index}}", description: "Message number in this send: 1, 2, 3…" },
  { name: "timestamp", insert: "{{timestamp}}", description: "Epoch milliseconds" },
  { name: "now", insert: "{{now}}", description: "ISO 8601 date and time" },
];

const PLACEHOLDER = /\{\{ *([A-Za-z]+)(?:\(([^()]*)\))? *\}\}/g;
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MAX_STRING = 10_000;

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nums(args: string[]): number[] | null {
  const out = args.map((a) => (a === "" ? Number.NaN : Number(a)));
  return out.every(Number.isFinite) ? out : null;
}

/** The value of one placeholder, or null when it is not one of ours. */
function evaluate(name: string, rawArgs: string | undefined, ctx: GenContext): string | null {
  const args = rawArgs == null || rawArgs.trim() === "" ? [] : rawArgs.split(",").map((a) => a.trim());
  switch (name) {
    case "uuid":
      return args.length ? null : uuid();
    case "randomString": {
      const len = args.length ? Number(args[0]) : 12;
      if (args.length > 1 || !Number.isInteger(len) || len < 1 || len > MAX_STRING) return null;
      let s = "";
      for (let i = 0; i < len; i++) s += ALNUM[Math.floor(Math.random() * ALNUM.length)];
      return s;
    }
    case "randomInt": {
      const n = args.length ? nums(args) : [0, 1000];
      if (!n || n.length !== 2 || !n.every(Number.isInteger) || n[0] > n[1]) return null;
      return String(randInt(n[0], n[1]));
    }
    case "randomDecimal": {
      const n = args.length ? nums(args) : [0, 1, 2];
      if (!n || n.length < 2 || n.length > 3 || n[0] > n[1]) return null;
      const digits = n[2] ?? 2;
      if (!Number.isInteger(digits) || digits < 0 || digits > 10) return null;
      return (n[0] + Math.random() * (n[1] - n[0])).toFixed(digits);
    }
    case "randomBool":
      return args.length ? null : String(Math.random() < 0.5);
    case "randomItem":
      return args.length ? args[Math.floor(Math.random() * args.length)] : null;
    case "index":
      return args.length ? null : String(ctx.index);
    case "timestamp":
      return args.length ? null : String(ctx.now);
    case "now":
      return args.length ? null : new Date(ctx.now).toISOString();
    default:
      return null;
  }
}

/** Fills in every placeholder in the text; anything that is not one is kept as written. */
export function render(text: string, ctx: GenContext): string {
  return text.replace(PLACEHOLDER, (whole, name: string, args?: string) => evaluate(name, args, ctx) ?? whole);
}

/** Whether the text uses at least one placeholder that render() fills in. */
export function hasPlaceholders(text: string | null | undefined): boolean {
  if (!text) return false;
  const ctx = { index: 1, now: 0 };
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (evaluate(m[1], m[2], ctx) != null) return true;
  }
  return false;
}

export interface RenderedRecord {
  key: string | null;
  value: string | null;
  headers: ProduceHeader[];
}

/** One record per message, each with its placeholders filled in. */
export function renderRecords(
  r: { key: string | null; value: string | null; headers: ProduceHeader[] },
  count: number,
  now = Date.now(),
): RenderedRecord[] {
  const out: RenderedRecord[] = [];
  for (let i = 1; i <= count; i++) {
    const ctx = { index: i, now };
    out.push({
      key: r.key == null ? null : render(r.key, ctx),
      value: r.value == null ? null : render(r.value, ctx),
      headers: r.headers.map((h) => ({ key: h.key, value: render(h.value, ctx) })),
    });
  }
  return out;
}
