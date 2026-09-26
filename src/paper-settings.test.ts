/**
 * `<paper>/paperlint.json` — the per-paper settings file: parsed strictly, and `rules` turned into
 * an ESLint block for that paper alone.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import {
  paperRules,
  parsePaperSettings,
  readPaperSettings,
} from "./paper-settings.ts";

const PAPER = "/work/papers/p";
const SHIPPED = new Set([
  "pdf/last-page-balance",
  "pdf/profile",
  "paper/section-word",
]);

describe("parsePaperSettings", () => {
  it("reads extends, kind, pdf and rules; every absent field is null", () => {
    expect(
      parsePaperSettings({ extends: "paperlint:aisec", kind: "research" }),
    ).toEqual({
      ok: true,
      value: {
        extends: "paperlint:aisec",
        kind: "research",
        pdf: null,
        rules: null,
      },
    });
    expect(parsePaperSettings({})).toEqual({
      ok: true,
      value: { extends: null, kind: null, pdf: null, rules: null },
    });
  });

  it("extends: null is valid and means no venue chosen yet — what `paperlint new` writes", () => {
    expect(parsePaperSettings({ extends: null })).toEqual({
      ok: true,
      value: { extends: null, kind: null, pdf: null, rules: null },
    });
  });
});

describe("parsePaperSettings — optional keys", () => {
  it("accepts $comment, JSON Schema's comment keyword, and ignores it", () => {
    expect(
      parsePaperSettings({ extends: "paperlint:aisec", $comment: "why" }).ok,
    ).toBe(true);
  });

  it.each([
    [
      "an unknown key (a typo is not silent)",
      { venu: "aisec" },
      /unknown key "venu".*extends, kind, pdf, rules/,
    ],
    [
      "a comment key other than `$comment`",
      { extends: "paperlint:aisec", _: "note" },
      /unknown key "_"/,
    ],
    [
      "an extends that is not a string",
      { extends: 3 },
      /"extends" must be a non-empty string/,
    ],
    [
      "an empty extends",
      { extends: "" },
      /"extends" must be a non-empty string/,
    ],
    [
      "rules that are not an object",
      { rules: ["pdf/profile"] },
      /"rules" must be an object/,
    ],
    ["not an object at all", ["aisec"], /must be a JSON object/],
  ])("refuses %s", (_, json, why) => {
    const r = parsePaperSettings(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(why);
  });
});

describe("readPaperSettings", () => {
  it("no file: null — the paper declares nothing", () => {
    expect(readPaperSettings(memoryFiles(), PAPER)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("reads paperlint.json", () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisec"}',
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok && r.value?.extends).toBe("paperlint:aisec");
  });

  it("not JSON: broken, with the parser's reason", () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: "{ extends: aisec",
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("broken");
  });
});

describe("paperRules — `rules` in paperlint.json", () => {
  const settings = (rules: Record<string, unknown> | null) => ({
    extends: null,
    kind: null,
    pdf: null,
    rules,
  });

  it("no rules: none", () => {
    expect(paperRules(PAPER, settings(null), SHIPPED)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("known rules, parsed", () => {
    expect(
      paperRules(
        PAPER,
        settings({ "pdf/last-page-balance": "error" }),
        SHIPPED,
      ),
    ).toEqual({ ok: true, value: { "pdf/last-page-balance": "error" } });
  });

  it.each([
    [
      "an unknown rule id",
      { "pdf/no-such-rule": "error" },
      /"pdf\/no-such-rule" is not a rule paperlint ships/,
    ],
    ["a bad severity", { "pdf/profile": "loud" }, /is not a severity/],
  ])("refuses %s, naming the file", (_, rules, why) => {
    const r = paperRules(PAPER, settings(rules), SHIPPED);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(why);
      expect(r.error).toMatch(/paperlint\.json/);
    }
  });
});
