/**
 * `preset/card-rules` — the rules table in a preset's card, generated from the preset beside it.
 *
 * Every shipped preset has a card, `presets/<name>.md` beside `presets/<name>.jsonc`: what the venue
 * or the template family is, its call for papers, its kinds and limits — prose a person writes. One
 * part of the card is NOT prose: which rules a paper extending the preset runs with, at which
 * severity and options, and which file of the chain set each. That part is generated between two
 * markers and checked on every lint, so it cannot say anything the preset does not:
 *
 *   <!-- paperlint:preset-rules -->
 *   …generated: what the preset is, its call for papers, the resolved rules…
 *   <!-- /paperlint:preset-rules -->
 *
 * A section that differs from what the preset resolves to is reported, and `eslint --fix` writes it.
 * A card with no markers gets the section appended by `--fix`; a card with one marker and not the
 * other is reported and left alone, since where the section should end is a person's call.
 *
 * ── WHY OUR OWN RULE, AND NOT eslint-doc-generator ───────────────────────────────
 * eslint-doc-generator documents an ESLint PLUGIN: its rules, and which of the plugin's exported
 * configs enable each. A preset is not an ESLint config — it is paperlint's own format, merged along
 * an `extends` chain of files (`src/presets.ts`), and the column that matters here (which file of
 * the chain set a rule) has no counterpart in a plugin's configs.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The card's markdown tree (the two markers are top-level `html` nodes), the preset beside it through
 * `resolvePreset` — the reader every rule uses — and whether `docs/rules/<rule>.md` exists, to link
 * a rule to its page or, before it has one, to the index `docs/rules.md`.
 */
import { basename, dirname, join, relative } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { Files } from "./ports/files.ts";
import {
  presetProblemText,
  resolvePreset,
  resolveShipped,
  SHIPPED_PREFIX,
  type Preset,
} from "./presets.ts";

/** The first line of the generated section. */
export const SECTION_START = "<!-- paperlint:preset-rules -->";
/** The last line of the generated section. */
export const SECTION_END = "<!-- /paperlint:preset-rules -->";

const PRESET_EXT = ".jsonc";
const CARD_EXT = ".md";

export interface PresetCardDeps {
  readonly files: Files;
  /** The shipped presets and their schema: where `paperlint:<name>` resolves. */
  readonly venuesDir: string;
  /** The repository root: the rule pages are `docs/rules/<group>/<rule>.md` under it. */
  readonly docsRoot: string;
}

/** A point of a markdown node, as mdast gives it: @eslint/markdown's parser sets the offset on every node. */
interface Point {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/** The slice of an mdast node the rule reads. */
export interface MdNode {
  readonly type: string;
  readonly value?: string;
  readonly position: { readonly start: Point; readonly end: Point };
}

/** The card's root: its top-level blocks. */
export interface MdRoot extends MdNode {
  readonly children: readonly MdNode[];
}

/** What `--fix` may do: replace a range of the card's text, or insert after one. */
export interface CardFixer {
  replaceTextRange(range: readonly [number, number], text: string): unknown;
  insertTextAfterRange(range: readonly [number, number], text: string): unknown;
}

/** The slice of ESLint's rule context this rule uses. */
export interface CardRuleContext {
  readonly filename: string;
  readonly sourceCode: { readonly text: string };
  report(d: {
    readonly node: MdNode;
    readonly messageId: string;
    readonly data?: Readonly<Record<string, string>>;
    readonly fix?: (fixer: CardFixer) => unknown;
  }): void;
}

export interface CardRuleModule {
  readonly meta: {
    readonly type: "problem";
    readonly fixable: "code";
    readonly docs: { readonly description: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: CardRuleContext): { readonly root: (node: MdRoot) => void };
}

/** One row of the table: a rule of the resolved preset. */
export interface RuleRow {
  readonly id: string;
  readonly severity: string;
  /** The options after the severity, as JSON; empty when the entry has none. */
  readonly options: string;
  /** The file of the chain that set the entry. */
  readonly origin: string;
}

/** A rule entry (`"error"`, `2`, `["error", { … }]`) → its severity and its options as JSON. Pure. */
export function entryParts(entry: unknown): {
  readonly severity: string;
  readonly options: string;
} {
  // One level of `flat`: an array entry gives its elements, a bare severity itself.
  const [severity, ...options] = [entry].flat();
  return {
    severity: String(severity),
    options: options.map((o) => JSON.stringify(o)).join(", "),
  };
}

/** The resolved preset's rules, one row each, by rule id. Pure. */
export const ruleRows = (preset: Preset): readonly RuleRow[] =>
  Object.entries(preset.ruleOrigins)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, origin]) => ({ id, ...entryParts(preset.rules[id]), origin }));

/** How a card names a preset file: `paperlint:<name>` when it is shipped, else its path from the card. */
const specOf = (file: string, card: string, venuesDir: string): string =>
  dirname(file) === venuesDir
    ? `${SHIPPED_PREFIX}${basename(file, PRESET_EXT)}`
    : relative(dirname(card), file);

/** A table cell's text with GFM's column separator escaped. Pure. */
const cell = (text: string): string => text.split("|").join("\\|");

/** What the card says about where to look for the section's source, and how to rewrite it. */
const generatedNote = (preset: string): string =>
  `<!-- Generated from ${preset} by \`npx eslint --fix\` (rule preset/card-rules). Edit the preset, not this section. -->`;

/** The section's first paragraph: what the preset is, its call for papers or its relatives. */
function identityLine(o: {
  readonly preset: Preset;
  readonly own: string;
  readonly specOf: (file: string) => string;
  readonly extendedBy: readonly string[];
}): string {
  const spec = o.specOf(o.own);
  const extendsText = o.preset.chain
    .slice(-2, -1)
    .map((parent) => ` · extends \`${o.specOf(parent)}\``)
    .join("");
  switch (o.preset.identity.type) {
    case "venue":
      return `**\`${spec}\`** — venue preset for ${o.preset.identity.name} · call for papers: <${o.preset.identity.url}>${extendsText}`;
    case "family": {
      const by = o.extendedBy.length
        ? o.extendedBy.map((s) => `\`${s}\``).join(", ")
        : "no shipped preset";
      return `**\`${spec}\`** — template family, no venue of its own${extendsText} · extended by ${by}`;
    }
    case "base":
      return `**\`${basename(o.own)}\`** — the TeX base set: every paper gets it, whatever it extends, and no preset extends it`;
  }
}

/** The table, or the sentence that stands for an empty one. Pure. */
function rulesTable(
  rows: readonly RuleRow[],
  own: string,
  link: (id: string) => string,
  originSpec: (file: string) => string,
): string {
  if (rows.length === 0)
    return "This preset sets no rules: a paper that extends it runs with paperlint's defaults.";
  return [
    "| rule | severity | options | set in |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| [\`${r.id}\`](${link(r.id)}) | ${r.severity} | ${r.options === "" ? "—" : `\`${cell(r.options)}\``} | ${r.origin === own ? "this preset" : `inherited from \`${originSpec(r.origin)}\``} |`,
    ),
  ].join("\n");
}

/** A rule's link from the card: its page under `docs/rules/`, or the index before it has one. */
const ruleLink =
  (o: {
    readonly card: string;
    readonly docsRoot: string;
    readonly docExists: (file: string) => boolean;
  }) =>
  (id: string): string => {
    const page = join(o.docsRoot, "docs", "rules", `${id}.md`);
    return relative(
      dirname(o.card),
      o.docExists(page) ? page : join(o.docsRoot, "docs", "rules.md"),
    );
  };

/**
 * The section between the markers for the preset `own`, resolved, as the card `card` shows it —
 * without the markers. Wrapped in prettier-ignore, so the formatter and this rule never disagree
 * about the table's spacing. Pure but for `docExists`.
 */
export function cardSection(o: {
  readonly preset: Preset;
  readonly own: string;
  readonly card: string;
  readonly venuesDir: string;
  readonly docsRoot: string;
  readonly docExists: (file: string) => boolean;
  readonly extendedBy: readonly string[];
}): string {
  const link = ruleLink(o);
  const spec = (file: string): string => specOf(file, o.card, o.venuesDir);
  return [
    "<!-- prettier-ignore-start -->",
    generatedNote(basename(o.own)),
    "",
    identityLine({
      preset: o.preset,
      own: o.own,
      specOf: spec,
      extendedBy: o.extendedBy,
    }),
    "",
    rulesTable(ruleRows(o.preset), o.own, link, spec),
    "",
    "<!-- prettier-ignore-end -->",
  ].join("\n");
}

/** The shipped presets whose chain runs through `file`, by their spec, `file` itself left out. */
const extendedByOf = (
  file: string,
  deps: PresetCardDeps,
): readonly string[] =>
  resolveShipped(deps)
    .flatMap((p) => (p.chain.includes(file) ? p.chain.slice(-1) : []))
    .filter((leaf) => leaf !== file)
    .map((leaf) => specOf(leaf, file, deps.venuesDir));

/** The section a card should hold, or the finding that stands in its place. */
type Expected =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly messageId: string;
      readonly data: Readonly<Record<string, string>>;
    };

/** The expected section for the card at `card`, or the finding that stands in its place. */
function expectedSection(card: string, deps: PresetCardDeps): Expected {
  const own = join(dirname(card), `${basename(card, CARD_EXT)}${PRESET_EXT}`);
  if (!deps.files.isFile(callerPath(own)))
    return { ok: false, messageId: "noPreset", data: { preset: own } };
  const r = resolvePreset(`./${basename(own)}`, card, deps);
  if (!r.ok) {
    const why = presetProblemText(r.error);
    return { ok: false, messageId: "presetProblem", data: { why } };
  }
  return {
    ok: true,
    text: cardSection({
      preset: r.value,
      own,
      card,
      venuesDir: deps.venuesDir,
      docsRoot: deps.docsRoot,
      docExists: (f) => deps.files.isFile(callerPath(f)),
      extendedBy: extendedByOf(own, deps),
    }),
  };
}

/** The first top-level `html` node of the card that is exactly `marker`, or null. */
const markerIn = (root: MdRoot, marker: string): MdNode | null =>
  root.children
    .filter((n) => n.type === "html")
    .find((n) => String(n.value).trim() === marker) ?? null;

/** The section to append to a card that has none, after its last line. */
const appended = (text: string, section: string): string =>
  `${text.endsWith("\n") ? "" : "\n"}\n${SECTION_START}\n${section}\n${SECTION_END}\n`;

/** One finding, as the rule hands it to ESLint. */
type CardReport = Parameters<CardRuleContext["report"]>[0];

/** The finding for the section between `start` and `end`: stale, with the fix; null when it is right. */
function staleSection(
  between: { readonly start: MdNode; readonly end: MdNode },
  text: string,
  section: string,
): CardReport | null {
  const from = between.start.position.end.offset;
  const to = between.end.position.start.offset;
  const expected = `\n${section}\n`;
  return text.slice(from, to) === expected
    ? null
    : {
        node: between.start,
        messageId: "stale",
        fix: (fixer) => fixer.replaceTextRange([from, to], expected),
      };
}

/** The card's section against `section`, the one its preset resolves to: missing, unpaired, stale, or right (null). */
function sectionFinding(
  root: MdRoot,
  text: string,
  section: string,
): CardReport | null {
  const start = markerIn(root, SECTION_START);
  const end = markerIn(root, SECTION_END);
  if (start === null)
    return end === null
      ? {
          node: root,
          messageId: "missing",
          fix: (fixer) =>
            fixer.insertTextAfterRange(
              [text.length, text.length],
              appended(text, section),
            ),
        }
      : { node: end, messageId: "unpaired" };
  if (end === null) return { node: start, messageId: "unpaired" };
  return staleSection({ start, end }, text, section);
}

/** Judge the card `context.filename`: its preset beside it, then its generated section. */
function judgeCard(
  context: CardRuleContext,
  root: MdRoot,
  deps: PresetCardDeps,
): void {
  const want = expectedSection(context.filename, deps);
  const finding = want.ok
    ? sectionFinding(root, context.sourceCode.text, want.text)
    : { node: root, messageId: want.messageId, data: want.data };
  if (finding !== null) context.report(finding);
}

/** The rule, over `deps`. */
export function presetCardRule(deps: PresetCardDeps): CardRuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: {
        description:
          "a preset card's rules table is the one its preset resolves to — generated, never hand-written",
      },
      schema: [],
      messages: {
        stale:
          "the rules section does not match the preset beside this card — run `npx eslint --fix` on this file to rewrite it from the preset",
        missing: `this card has no generated rules section — run \`npx eslint --fix\` on this file to append one (between ${SECTION_START} and ${SECTION_END})`,
        unpaired: `the generated rules section needs both markers, ${SECTION_START} and ${SECTION_END}, each on its own line`,
        noPreset:
          "a preset card describes the preset beside it, and there is none: {{preset}}",
        presetProblem:
          "the preset beside this card does not resolve, so its rules cannot be listed: {{why}}",
      },
    },
    create(context) {
      return {
        root(node) {
          judgeCard(context, node, deps);
        },
      };
    },
  };
}

/** The plugin's rules: `preset/card-rules` once registered under the name `preset`. */
export const presetCardRules = (
  deps: PresetCardDeps,
): Readonly<Record<string, CardRuleModule>> => ({
  "card-rules": presetCardRule(deps),
});
