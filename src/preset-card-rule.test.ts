/**
 * `preset/card-rules` through real ESLint, on a copy of the shipped presets and the rule pages: the
 * section a card must hold, the findings for each way a card can be wrong, and what `--fix` writes.
 */
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { describe, expect, it } from "vitest";
import { nodeFiles } from "./adapters/node/index.ts";
import { eslintConfig } from "./cli.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  entryParts,
  presetCardRules,
  SECTION_END,
  SECTION_START,
} from "./preset-card-rule.ts";
import { useTempDir } from "../test/support.ts";

const REPO = join(presetsDir(), "..");
const root = useTempDir("paperlint-card-rule-");
cpSync(presetsDir(), join(root, "presets"), { recursive: true });
cpSync(join(REPO, "docs", "rules"), join(root, "docs", "rules"), {
  recursive: true,
});
cpSync(join(REPO, "docs", "rules.md"), join(root, "docs", "rules.md"));
const P = join(root, "presets");

const eslint = (fix = false) =>
  new ESLint({
    cwd: root,
    fix,
    overrideConfigFile: true,
    // Through cli.ts's one adapter from paperlint's blocks to ESLint's type (`eslintConfig`).
    overrideConfig: eslintConfig([
      {
        files: ["presets/*.md"],
        plugins: {
          markdown,
          preset: {
            rules: presetCardRules({
              files: nodeFiles,
              venuesDir: P,
              docsRoot: root,
            }),
          },
        },
        language: "markdown/gfm",
        rules: { "preset/card-rules": "error" },
      },
    ]),
  });

/** The findings for one card, as `messageId`-free text: rule id and message. */
async function findings(card: string): Promise<string[]> {
  const [r] = await eslint().lintFiles([join(P, card)]);
  return (r?.messages ?? []).map((m) => `${String(m.ruleId)}: ${m.message}`);
}

/** The card after `eslint --fix`, written to disk as ESLint would. */
async function fixed(card: string): Promise<string> {
  const results = await eslint(true).lintFiles([join(P, card)]);
  await ESLint.outputFixes(results);
  return readFileSync(join(P, card), "utf8");
}

/** The generated section of a card's text, markers included. */
const sectionOf = (text: string): string =>
  text.slice(
    text.indexOf(SECTION_START),
    text.indexOf(SECTION_END) + SECTION_END.length,
  );

const STALE =
  "preset/card-rules: the rules section does not match the preset beside this card — run `npx eslint --fix` on this file to rewrite it from the preset";

describe("the shipped cards", () => {
  it("every shipped card holds the section its preset resolves to", async () => {
    const results = await eslint().lintFiles([join(P, "*.md")]);
    // Guards: a glob that matched nothing lints nothing and reports clean.
    expect(results.map((r) => r.filePath.slice(P.length + 1)).sort()).toEqual([
      "acm-sigconf.md",
      "agenticdev.md",
      "aidc.md",
      "aisec.md",
      "ieee-conference.md",
      "realm.md",
      "tex-base.md",
    ]);
    expect(results.flatMap((r) => r.messages)).toEqual([]);
  });

  it("agenticdev: its own rules, linked to their page or to the index, and what it extends", async () => {
    const text = readFileSync(join(P, "agenticdev.md"), "utf8");
    writeFileSync(
      join(P, "agenticdev.md"),
      text.replace(sectionOf(text), `${SECTION_START}\n${SECTION_END}`),
    );
    expect(await findings("agenticdev.md")).toEqual([STALE]);
    // Guards: --fix writes the resolved preset — the section is the generated output, compared whole.
    expect(sectionOf(await fixed("agenticdev.md"))).toBe(
      [
        SECTION_START,
        "<!-- prettier-ignore-start -->",
        "<!-- Generated from agenticdev.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->",
        "",
        "**`paperlint:agenticdev`** — venue preset for AgenticDev · call for papers: <https://conf.researchr.org/home/ase-2026/agenticdev-2026> · extends `paperlint:acm-sigconf`",
        "",
        "| rule | severity | options | set in |",
        "| --- | --- | --- | --- |",
        '| [`pdf/last-page-balance`](../docs/rules.md) | error | `{"tolerancePt":120}` | this preset |',
        '| [`tex/heading-case`](../docs/rules/tex/heading-case.md) | error | `{"title":"chicago-headline","headings":"chicago-headline"}` | this preset |',
        "",
        "<!-- prettier-ignore-end -->",
        SECTION_END,
      ].join("\n"),
    );
    expect(await findings("agenticdev.md")).toEqual([]);
  });
});

describe("the origin column: set here, or inherited from the file of the chain that set it", () => {
  it("a venue over agenticdev: its own rule is its own, agenticdev's are inherited", async () => {
    writeFileSync(
      join(P, "fixture-venue.jsonc"),
      JSON.stringify({
        type: "venue",
        name: "Fixture",
        url: "https://example.org/cfp",
        extends: "paperlint:agenticdev",
        rules: { "pdf/body-size": "off", "tex/register": ["warn", "a|b"] },
      }),
    );
    writeFileSync(join(P, "fixture-venue.md"), "# Fixture\n");
    expect(await findings("fixture-venue.md")).toEqual([
      `preset/card-rules: this card has no generated rules section — run \`npx eslint --fix\` on this file to append one (between ${SECTION_START} and ${SECTION_END})`,
    ]);
    const text = await fixed("fixture-venue.md");
    // Guards: an inherited rule names its parent, an own rule says so; an entry without options
    // shows a dash, and a `|` in the options is escaped so the table keeps its columns.
    expect(text.split("\n").filter((l) => l.startsWith("| ["))).toEqual([
      "| [`pdf/body-size`](../docs/rules/pdf/body-size.md) | off | — | this preset |",
      '| [`pdf/last-page-balance`](../docs/rules.md) | error | `{"tolerancePt":120}` | inherited from `paperlint:agenticdev` |',
      '| [`tex/heading-case`](../docs/rules/tex/heading-case.md) | error | `{"title":"chicago-headline","headings":"chicago-headline"}` | inherited from `paperlint:agenticdev` |',
      '| [`tex/register`](../docs/rules/tex/register.md) | warn | `"a\\|b"` | this preset |',
    ]);
    // Appended after one blank line to a card that ended with a newline.
    expect(text.startsWith(`# Fixture\n\n${SECTION_START}\n`)).toBe(true);
    expect(await findings("fixture-venue.md")).toEqual([]);
  });

  it("a card without a final newline gets one before the appended section", async () => {
    writeFileSync(join(P, "fixture-venue.md"), "# Fixture");
    expect(
      (await fixed("fixture-venue.md")).startsWith(
        `# Fixture\n\n${SECTION_START}\n`,
      ),
    ).toBe(true);
  });
});

describe("a family the shipped presets do not extend", () => {
  it("says so, and that its chain sets no rule", async () => {
    writeFileSync(
      join(P, "fixture-family.jsonc"),
      JSON.stringify({ type: "family", extends: "paperlint:acm-sigconf" }),
    );
    writeFileSync(join(P, "fixture-family.md"), "# Family\n");
    expect(
      sectionOf(await fixed("fixture-family.md"))
        .split("\n")
        .slice(4, 7),
    ).toEqual([
      "**`paperlint:fixture-family`** — template family, no venue of its own · extends `paperlint:acm-sigconf` · extended by no shipped preset",
      "",
      "No preset of this chain sets a rule: a paper that extends it runs with paperlint's defaults.",
    ]);
    rmSync(join(P, "fixture-family.jsonc"));
    rmSync(join(P, "fixture-family.md"));
  });
});

describe("a card that cannot be judged, or whose markers are not a pair", () => {
  it("one marker without the other is reported, and not fixed", async () => {
    for (const marker of [SECTION_START, SECTION_END]) {
      writeFileSync(join(P, "fixture-venue.md"), `# Fixture\n\n${marker}\n`);
      expect(await findings("fixture-venue.md")).toEqual([
        `preset/card-rules: the generated rules section needs both markers, ${SECTION_START} and ${SECTION_END}, each on its own line`,
      ]);
      expect(await fixed("fixture-venue.md")).toBe(`# Fixture\n\n${marker}\n`);
    }
  });

  it("a card with no preset beside it names the file it looked for", async () => {
    writeFileSync(join(P, "orphan.md"), "# Orphan\n");
    expect(await findings("orphan.md")).toEqual([
      `preset/card-rules: a preset card describes the preset beside it, and there is none: ${join(P, "orphan.jsonc")}`,
    ]);
    rmSync(join(P, "orphan.md"));
  });

  it("a card beside a preset that does not resolve says why", async () => {
    writeFileSync(
      join(P, "broken.jsonc"),
      JSON.stringify({ type: "family", extends: "x" }),
    );
    writeFileSync(join(P, "broken.md"), "# Broken\n");
    expect(await findings("broken.md")).toEqual([
      `preset/card-rules: the preset beside this card does not resolve, so its rules cannot be listed: "extends": "x" — a preset is \`paperlint:<name>\` (shipped) or a path starting with ./ or ../ (your own); npm presets: not yet supported. Did you mean "paperlint:x"?`,
    ]);
    rmSync(join(P, "broken.jsonc"));
    rmSync(join(P, "broken.md"));
  });
});

describe("entryParts", () => {
  it.each<[unknown, { severity: string; options: string }]>([
    ["error", { severity: "error", options: "" }],
    [2, { severity: "2", options: "" }],
    [["warn", { a: 1 }, "b"], { severity: "warn", options: '{"a":1}, "b"' }],
  ])("%j", (entry, want) => {
    expect(entryParts(entry)).toEqual(want);
  });
});
