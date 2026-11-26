import { describe, expect, it } from "vitest";
import { GEN_FUNCTIONS, hasPlaceholders, render, renderRecords } from "../generators";

const ctx = { index: 3, now: Date.UTC(2026, 0, 2, 3, 4, 5) };

describe("render", () => {
  it("fills in uuid", () => {
    expect(render("{{uuid}}", ctx)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("fills in randomString with the default and a given length", () => {
    expect(render("{{randomString}}", ctx)).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(render("{{randomString(5)}}", ctx)).toMatch(/^[A-Za-z0-9]{5}$/);
  });

  it("keeps randomInt and randomDecimal within bounds", () => {
    for (let i = 0; i < 200; i++) {
      const n = Number(render("{{randomInt(-3, 3)}}", ctx));
      expect(Number.isInteger(n) && n >= -3 && n <= 3).toBe(true);
      const d = render("{{randomDecimal(1, 2, 3)}}", ctx);
      expect(d).toMatch(/^\d\.\d{3}$/);
      expect(Number(d) >= 1 && Number(d) <= 2).toBe(true);
    }
  });

  it("picks from randomItem and gives booleans", () => {
    expect(["a", "b c", "d"]).toContain(render("{{randomItem(a, b c, d)}}", ctx));
    expect(["true", "false"]).toContain(render("{{randomBool}}", ctx));
  });

  it("uses the context for index, timestamp and now", () => {
    expect(render("#{{index}} {{timestamp}} {{now}}", ctx)).toBe(`#3 ${ctx.now} 2026-01-02T03:04:05.000Z`);
  });

  it("allows spaces inside the braces", () => {
    expect(render("{{ index }}", ctx)).toBe("3");
  });

  it("leaves unknown names and bad arguments as written", () => {
    const text = "{{name}} {{randomInt(5, 1)}} {{randomString(0)}} {{uuid(1)}} {{randomInt(a, b)}} {{randomItem()}}";
    expect(render(text, ctx)).toBe(text);
  });

  it("fills placeholders inside JSON", () => {
    const out = render('{"id": "{{uuid}}", "n": {{randomInt(1, 9)}}, "i": {{index}}}', ctx);
    const parsed = JSON.parse(out);
    expect(parsed.i).toBe(3);
    expect(parsed.n).toBeGreaterThanOrEqual(1);
  });

  it("renders every function in the picker", () => {
    for (const f of GEN_FUNCTIONS) expect(render(f.insert, ctx)).not.toBe(f.insert);
  });
});

describe("hasPlaceholders", () => {
  it("is true only for placeholders render() fills in", () => {
    expect(hasPlaceholders("id={{uuid}}")).toBe(true);
    expect(hasPlaceholders("{{mustache}}")).toBe(false);
    expect(hasPlaceholders("plain")).toBe(false);
    expect(hasPlaceholders(null)).toBe(false);
  });
});

describe("renderRecords", () => {
  it("renders each message separately and keeps a null key", () => {
    const recs = renderRecords({ key: null, value: "{{index}}:{{uuid}}", headers: [{ key: "n", value: "{{index}}" }] }, 3, 0);
    expect(recs.map((r) => r.value!.split(":")[0])).toEqual(["1", "2", "3"]);
    expect(new Set(recs.map((r) => r.value)).size).toBe(3);
    expect(recs.map((r) => r.headers[0].value)).toEqual(["1", "2", "3"]);
    expect(recs.every((r) => r.key === null)).toBe(true);
  });
});
