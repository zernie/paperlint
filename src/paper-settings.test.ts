/**
 * `<paper>/paperlint.json` — the per-paper settings file (it was `venue.json` before 2.1.0): parsed
 * strictly, the old name never read, the move planned from bytes, and `rules` turned into an ESLint
 * block for that paper alone.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import {
  migrationOf,
  paperRuleBlock,
  parsePaperSettings,
  readPaperSettings,
} from "./paper-settings.ts";

const PAPER = "/work/papers/p";
const SHIPPED = new Set([
  "pdf/last-page-balance",
  "pdf/profile",
  "paper/typography",
]);
const enc = (s: string) => new TextEncoder().encode(s);

describe("parsePaperSettings", () => {
  it("reads venue, kind, pdf and rules; every absent field is null", () => {
    expect(parsePaperSettings({ venue: "aisec", kind: "research" })).toEqual({
      ok: true,
      value: { venue: "aisec", kind: "research", pdf: null, rules: null },
    });
    expect(parsePaperSettings({})).toEqual({
      ok: true,
      value: { venue: null, kind: null, pdf: null, rules: null },
    });
  });

  it("accepts $comment, JSON Schema's comment keyword, and ignores it", () => {
    expect(parsePaperSettings({ venue: "aisec", $comment: "why" }).ok).toBe(
      true,
    );
  });

  it.each([
    [
      "an unknown key (a typo is not silent)",
      { venu: "aisec" },
      /unknown key "venu".*venue, kind, pdf, rules/,
    ],
    [
      "the pre-2.1.0 comment key `_`",
      { venue: "aisec", _: "note" },
      /unknown key "_"/,
    ],
    [
      "a venue that is not a string",
      { venue: 3 },
      /"venue" must be a non-empty string/,
    ],
    ["an empty venue", { venue: "" }, /"venue" must be a non-empty string/],
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
      [`${PAPER}/paperlint.json`]: '{"venue":"aisec"}',
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok && r.value?.venue).toBe("aisec");
  });

  it("🔴 a venue.json alone is NOT read — it is named, with the command that moves it", () => {
    const files = memoryFiles({ [`${PAPER}/venue.json`]: '{"venue":"aisec"}' });
    const r = readPaperSettings(files, PAPER);
    expect(r).toEqual({ ok: false, error: { kind: "legacy" } });
  });

  it("paperlint.json wins when both exist — the leftover is doctor's to report", () => {
    const files = memoryFiles({
      [`${PAPER}/venue.json`]: '{"venue":"realm"}',
      [`${PAPER}/paperlint.json`]: '{"venue":"aisec"}',
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok && r.value?.venue).toBe("aisec");
  });

  it("not JSON: broken, with the parser's reason", () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: "{ venue: aisec",
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("broken");
  });
});

describe("migrationOf — what `paperlint init` does with a paper's files", () => {
  it.each([
    ["no venue.json", null, null, "none"],
    ["no venue.json, paperlint.json present", null, '{"venue":"a"}', "none"],
    ["venue.json only", '{"venue":"a"}', null, "move"],
    [
      "both, the same JSON (spacing differs)",
      '{"venue":"a"}',
      '{ "venue": "a" }\n',
      "drop-legacy",
    ],
    ["both, different", '{"venue":"a"}', '{"venue":"b"}', "conflict"],
    ["both, one not JSON and not byte-equal", "{", '{"venue":"a"}', "conflict"],
  ])("%s → %s", (_, legacy, current, want) => {
    expect(
      migrationOf(
        legacy === null ? null : enc(legacy),
        current === null ? null : enc(current),
      ),
    ).toBe(want);
  });
});

describe("paperRuleBlock — `rules` in paperlint.json", () => {
  const settings = (rules: Record<string, unknown> | null) => ({
    venue: null,
    kind: null,
    pdf: null,
    rules,
  });

  it("no rules: no block", () => {
    expect(paperRuleBlock(PAPER, settings(null), SHIPPED)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("applies to that paper alone: basePath is the paper directory, files everything under it", () => {
    expect(
      paperRuleBlock(
        PAPER,
        settings({ "pdf/last-page-balance": "error" }),
        SHIPPED,
      ),
    ).toEqual({
      ok: true,
      value: {
        basePath: PAPER,
        files: ["**"],
        rules: { "pdf/last-page-balance": "error" },
      },
    });
  });

  it.each([
    [
      "an unknown rule id",
      { "pdf/no-such-rule": "error" },
      /"pdf\/no-such-rule" is not a rule paperlint ships/,
    ],
    ["a bad severity", { "pdf/profile": "loud" }, /is not a severity/],
  ])("refuses %s, naming the file", (_, rules, why) => {
    const r = paperRuleBlock(PAPER, settings(rules), SHIPPED);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(why);
      expect(r.error).toMatch(/paperlint\.json/);
    }
  });
});
