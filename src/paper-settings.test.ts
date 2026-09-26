/**
 * `<paper>/paperlint.json` — the per-paper settings file: parsed strictly, merged over the root
 * `paperlint.json`'s defaults, and `rules` turned into an ESLint block for that paper alone.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { findProjectRoot } from "../lib/paper-config.mjs";
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
      /unknown key "venu" — known keys: papersDir, structure, rules, extends, kind, pdf/,
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
      "rules that are neither an object nor a list of blocks",
      { rules: "pdf/profile" },
      /"rules" must be an object/,
    ],
    [
      "🔴 papersDir — a project setting, refused in a paper's file",
      { papersDir: "papers" },
      /"papersDir" is a project setting — set it in the root paperlint\.json/,
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

describe("readPaperSettings — the root paperlint.json's defaults, the paper's file over them", () => {
  const ROOT = "/work";
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ [`${ROOT}/package.json`]: "{}", ...f });
  const read = (f: Record<string, string>) => {
    const r = readPaperSettings(withFiles(f), PAPER);
    if (!r.ok) throw new Error(r.error.why);
    return r.value;
  };

  it("no file at either level: null", () => {
    expect(read({})).toBeNull();
  });

  it("root only: its extends and kind are this paper's", () => {
    expect(
      read({
        [`${ROOT}/paperlint.json`]:
          '{"papersDir":"papers","extends":"paperlint:agenticdev","kind":"short"}',
      }),
    ).toEqual({
      extends: "paperlint:agenticdev",
      kind: "short",
      pdf: null,
      rules: null,
    });
  });

  it("paper only: its own values", () => {
    expect(
      read({ [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisec"}' }),
    ).toEqual({
      extends: "paperlint:aisec",
      kind: null,
      pdf: null,
      rules: null,
    });
  });

  it("🔴 both: the paper's value wins, an absent one falls back to the root's, and `\"extends\": null` is absent", () => {
    expect(
      read({
        [`${ROOT}/paperlint.json`]:
          '{"extends":"paperlint:agenticdev","kind":"short","rules":{"pdf/profile":"off"}}',
        [`${PAPER}/paperlint.json`]:
          '{"extends":null,"kind":"research","rules":{"pdf/fonts":"off"}}',
      }),
    ).toEqual({
      extends: "paperlint:agenticdev",
      kind: "research",
      pdf: null,
      // The root's rules are the project's blocks (cli.ts), not this paper's.
      rules: { "pdf/fonts": "off" },
    });
  });

  it("🔴 from INSIDE a paper, the project root is not the paper: its paperlint.json sits beside paper.tex", () => {
    const files = withFiles({
      [`${PAPER}/paper.tex`]: "x",
      [`${PAPER}/paperlint.json`]: '{"kind":"research"}',
      [`${ROOT}/paperlint.json`]: '{"extends":"paperlint:aisec"}',
    });
    const isFile = (p: string) => files.isFile(p as AbsolutePath);
    expect(findProjectRoot(PAPER, isFile)).toBe(ROOT);
    // No root file anywhere: the package.json directory.
    expect(findProjectRoot(PAPER, (p) => p === `${ROOT}/package.json`)).toBe(
      ROOT,
    );
    // Neither: where the walk started.
    expect(findProjectRoot(PAPER, () => false)).toBe(PAPER);
  });

  it("papersDir in a paper's file: broken, naming the root file as its place", () => {
    const r = readPaperSettings(
      withFiles({ [`${PAPER}/paperlint.json`]: '{"papersDir":"x"}' }),
      PAPER,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.why).toMatch(/project setting/);
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
