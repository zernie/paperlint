/**
 * `preset/card-rules` through real ESLint, on a copy of the shipped presets and the rule pages: the
 * section a card must hold, the findings for each way a card can be wrong, and what `--fix` writes.
 */
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/**
 * The first test lints every card in presets/, and that grows with each venue. Measured in CI's
 * coverage job with 19 cards: 2.0 s and 3.5 s (run 44507805064, attempts 1 and 2); 1.4 s here with
 * 17. At that rate it passes vitest's 5 s default at about 27 cards; 21 cards took 5.0 s under
 * `npm run test:changed` (2026-11-19), past vitest's default.
 */
const ALL_CARDS_MS = 30_000;

/** Every card in presets/, by file name: a new preset adds its card here. */
const SHIPPED_CARDS = [
  "aaai-2027.md",
  "aaai-press.md",
  "acl-latex.md",
  "acm-acmsmall.md",
  "acm-sigconf.md",
  "acsac-2026.md",
  "agent-2027.md",
  "agenticdev-2026.md",
  "agentverify-2027.md",
  "aidc-2026.md",
  "aisec-2026.md",
  "ase-2026.md",
  "ccs-2026.md",
  "emnlp-2026.md",
  "fse-2027.md",
  "icml-2027.md",
  "icml-style.md",
  "icse-2027.md",
  "icse-2028.md",
  "ieee-conference.md",
  "langcode-2027.md",
  "msr-2027.md",
  "naacl-2027.md",
  "neurips-2026.md",
  "neurips-style.md",
  "nlbse-2027.md",
  "realm-2026.md",
  "sp-2027.md",
  "tex-base.md",
];

describe("the shipped cards", { timeout: ALL_CARDS_MS }, () => {
  it("every shipped card holds the section its preset resolves to", async () => {
    const results = await eslint().lintFiles([join(P, "*.md")]);
    // Guards: a glob that matched nothing lints nothing and reports clean.
    expect(results.map((r) => r.filePath.slice(P.length + 1)).sort()).toEqual(
      SHIPPED_CARDS,
    );
    expect(results.flatMap((r) => r.messages)).toEqual([]);
  });

  it("agenticdev: its own rules, linked to their page or to the index, and what it extends", async () => {
    const text = readFileSync(join(P, "agenticdev-2026.md"), "utf8");
    writeFileSync(
      join(P, "agenticdev-2026.md"),
      text.replace(sectionOf(text), `${SECTION_START}\n${SECTION_END}`),
    );
    expect(await findings("agenticdev-2026.md")).toEqual([STALE]);
    // Guards: --fix writes the resolved preset — the section is the generated output, compared whole.
    expect(sectionOf(await fixed("agenticdev-2026.md"))).toBe(
      [
        SECTION_START,
        "<!-- prettier-ignore-start -->",
        "<!-- Generated from agenticdev-2026.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->",
        "",
        "**`paperlint:agenticdev-2026`** — venue preset for AgenticDev 2026 · call for papers: <https://conf.researchr.org/home/ase-2026/agenticdev-2026> · extends `paperlint:acm-sigconf`",
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
    expect(await findings("agenticdev-2026.md")).toEqual([]);
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
        extends: "paperlint:agenticdev-2026",
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
      '| [`pdf/last-page-balance`](../docs/rules.md) | error | `{"tolerancePt":120}` | inherited from `paperlint:agenticdev-2026` |',
      '| [`tex/heading-case`](../docs/rules/tex/heading-case.md) | error | `{"title":"chicago-headline","headings":"chicago-headline"}` | inherited from `paperlint:agenticdev-2026` |',
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

describe("a chain that leaves presets/", () => {
  it("a rule set by a preset outside presets/ names that file by its path from the card", async () => {
    mkdirSync(join(root, "shared"), { recursive: true });
    writeFileSync(
      join(root, "shared", "fixture-base.jsonc"),
      JSON.stringify({
        type: "family",
        extends: "paperlint:acm-sigconf",
        rules: { "pdf/body-size": "warn" },
      }),
    );
    writeFileSync(
      join(P, "fixture-outside.jsonc"),
      JSON.stringify({
        type: "venue",
        name: "Outside",
        url: "https://example.org/cfp",
        extends: "../shared/fixture-base.jsonc",
      }),
    );
    writeFileSync(join(P, "fixture-outside.md"), "# Outside\n");
    // Guards: a file of the chain that is not a shipped preset is not given a `paperlint:` name
    // that would resolve nowhere; it is the path a reader can open from the card.
    expect(
      (await fixed("fixture-outside.md"))
        .split("\n")
        .filter((l) => l.startsWith("| [")),
    ).toEqual([
      "| [`pdf/body-size`](../docs/rules/pdf/body-size.md) | warn | — | inherited from `../shared/fixture-base.jsonc` |",
    ]);
    rmSync(join(P, "fixture-outside.jsonc"));
    rmSync(join(P, "fixture-outside.md"));
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
      "No preset of this chain sets a rule: under it, every rule keeps paperlint's default.",
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
