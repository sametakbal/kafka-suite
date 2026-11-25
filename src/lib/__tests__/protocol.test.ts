import { describe, expect, it } from "vitest";
import { isSecured, normalizeProtocol, protocolLabel, usesSasl, usesSsl } from "../protocol";

describe("security protocol helpers", () => {
  it("treats NONE and PLAINTEXT as unsecured", () => {
    expect(isSecured("NONE")).toBe(false);
    expect(isSecured("PLAINTEXT")).toBe(false);
    expect(isSecured(undefined)).toBe(false);
    expect(isSecured("SSL")).toBe(true);
    expect(isSecured("SASL_PLAINTEXT")).toBe(true);
  });

  it("splits SASL and SSL", () => {
    expect(usesSasl("SASL_SSL") && usesSsl("SASL_SSL")).toBe(true);
    expect(usesSasl("SSL")).toBe(false);
    expect(usesSsl("SASL_PLAINTEXT")).toBe(false);
    expect(usesSasl("NONE") || usesSsl("NONE")).toBe(false);
  });

  it("labels", () => {
    expect(protocolLabel("NONE")).toBe("No protocol");
    expect(protocolLabel(null)).toBe("No protocol");
    expect(protocolLabel("SSL", "PLAIN")).toBe("SSL");
    expect(protocolLabel("SASL_SSL", "SCRAM-SHA-512")).toBe("SASL_SSL · SCRAM-SHA-512");
  });

  it("normalizes imported values", () => {
    expect(normalizeProtocol("sasl_ssl")).toBe("SASL_SSL");
    expect(normalizeProtocol(" plaintext ")).toBe("PLAINTEXT");
    expect(normalizeProtocol(null)).toBe("NONE");
    expect(normalizeProtocol("")).toBe("NONE");
    expect(normalizeProtocol("KERBEROS")).toBe("NONE");
    expect(normalizeProtocol(42)).toBe("NONE");
  });
});
