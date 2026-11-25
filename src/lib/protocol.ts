import type { SecurityProtocol } from "./types";

export const SECURITY_PROTOCOLS: SecurityProtocol[] = ["NONE", "PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"];

export const usesSasl = (p: SecurityProtocol | null | undefined) => !!p && p.startsWith("SASL_");
export const usesSsl = (p: SecurityProtocol | null | undefined) => !!p && p.endsWith("SSL");
/** Authenticated or encrypted: shows the lock and may have saved secrets. */
export const isSecured = (p: SecurityProtocol | null | undefined) => usesSasl(p) || usesSsl(p);

/** Text for chips, the status bar and error details. */
export function protocolLabel(p: SecurityProtocol | null | undefined, mechanism?: string) {
  if (!p || p === "NONE") return "No protocol";
  return usesSasl(p) && mechanism ? `${p} · ${mechanism}` : p;
}

/** Imported values: known protocols kept, anything unset or unknown becomes NONE. */
export function normalizeProtocol(v: unknown): SecurityProtocol {
  const p = typeof v === "string" ? v.trim().toUpperCase() : "";
  return (SECURITY_PROTOCOLS as string[]).includes(p) ? (p as SecurityProtocol) : "NONE";
}
