/**
 * THE VENUE-CONFORMANCE RULES OVER THE SOURCE — `paper.tex` judged against what its venue preset
 * requires of the LaTeX itself, before any build:
 *
 *   tex/template          error  the `\documentclass` is the preset's class, with every option it names
 *   tex/required-section  error  each section the preset requires is there, titled exactly, and
 *                                where the preset says (`last`: after every section of the body)
 *   tex/venue-leftover    warn   the text a reader sees names ANOTHER shipped venue — its `name`
 *                                or one of its `aliases` — than the one the paper extends
 *
 * and, in the `format` plugin (named for the requirement, not the input — paperlint#151):
 *
 *   format/layout-override  error  the source changes the page layout the venue's template sets for
 *                                  the whole document — margins, text block, line spacing
 *
 * The `format` plugin's other rule, `format/page-limit`, judges the built PDF (`venue-rules.ts`).
 *
 * ── WHY THEY LIVE HERE AND NOT IN `eslint-rules/` ────────────────────────────────
 * Like the `pdf/*` venue rules (`venue-rules.ts`), they need the paper's resolved preset —
 * `paperPreset`, the one answer to "which venue is this paper judged against" — and read it through
 * the `Files` port. What they read of the source comes through the `LatexReader` port
 * (`src/ports/latex.ts`, implemented over unified-latex in `src/adapters/latex/`): the parse tree of
 * `sourceCode.raw`, never a search of the text.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────
 * No `paperlint.json`, no `extends`, or a preset that does not resolve: silent. `pdf/measured` and
 * `pdf/profile` already say so, once. A preset that names no template: silent — there is nothing to
 * compare, and a template-family preset is where it is named.
 */
import { basename, dirname } from "node:path";
import {
  collapse,
  documentClassLine,
  missingOptions,
  runText,
  spanIn,
  type ClassCandidate,
  type ClassLine,
  type DocumentClass,
  type Heading,
  type LayoutOverride,
  type Outline,
  type Place,
  type Span,
  type TextRun,
} from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import { paperPreset, shippedVenueNames, type Preset } from "./presets.ts";
import type { NamedVenue } from "./domain/venue-name.ts";
import type { PaperSource } from "./domain/paper-source.ts";
import { readPaper, reportInPaper } from "./tex-paper.ts";
import type { RequiredSection } from "./tex-requirements.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";

/** A finding and where it points; null points at the top of the file. */
export interface Located extends Finding {
  readonly at: Span | null;
}

/** The slice of ESLint's rule context these rules use. `raw` exists on the `.tex` language's. */
export interface TexRuleContext {
  readonly filename: string;
  /** The rule's options from the config, as ESLint validated them against its schema. */
  readonly options?: readonly unknown[];
  readonly sourceCode: {
    readonly text: string;
    readonly raw?: string;
    getLocFromIndex(index: number): Readonly<{ line: number; column: number }>;
  };
  report(
    d: {
      readonly loc: {
        readonly start: { line: number; column: number };
        readonly end: { line: number; column: number };
      };
    } & (
      | {
          readonly messageId: string;
          readonly data?: Readonly<Record<string, string | number>>;
        }
      | { readonly message: string }
    ),
  ): void;
}

export interface TexRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: { readonly description: string; readonly url: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: TexRuleContext): { root?: () => void };
}

// ── the judges: what the source says + a resolved preset → findings. Pure. ─────────

/** A place as a finding points at it: its span, or null — the top of the file — when unplaced. */
const spanOf = (p: Place): Span | null => (p.kind === "at" ? p.span : null);

/**
 * What every template finding names: the venue and the class line it requires. A type alias, not an
 * interface: a finding's `data` is a string record, and only an alias is assignable to one.
 */
type TemplateData = {
  readonly venue: string;
  readonly template: string;
};

/** A class line that names a class, against the template's: the same class, with every option. */
function judgeClass(
  line: Extract<ClassLine, { readonly kind: "class" }>,
  want: DocumentClass,
  data: TemplateData,
): readonly Located[] {
  const at = spanOf(line.place);
  if (line.cls !== want.cls)
    return [{ messageId: "wrongClass", data: { ...data, got: line.cls }, at }];
  return missingOptions(line, want).map((option) => ({
    messageId: "missingOption",
    data: { ...data, option },
    at,
  }));
}

/** A candidate as the message names it: its line, or an empty `\documentclass{}`. */
const candidateLine = (c: ClassCandidate): string =>
  c.kind === "class" ? documentClassLine(c) : "\\documentclass{}";

/**
 * Several class lines behind a TeX switch: satisfied when any candidate is the template's class
 * with its options; otherwise one finding, at the first candidate, naming every one.
 */
function judgeCandidates(
  candidates: readonly [ClassCandidate, ...ClassCandidate[]],
  want: DocumentClass,
  data: TemplateData,
): readonly Located[] {
  const matches = candidates.some(
    (c) => c.kind === "class" && judgeClass(c, want, data).length === 0,
  );
  if (matches) return [];
  const named = candidates.map((c) => `\`${candidateLine(c)}\``).join(", ");
  const found = { ...data, count: candidates.length, candidates: named };
  return [
    { messageId: "noCandidate", data: found, at: spanOf(candidates[0].place) },
  ];
}

/** The paper's class line against a template that was read: present, naming a class, that class. */
function judgeClassLine(
  line: ClassLine,
  want: DocumentClass,
  data: TemplateData,
): readonly Located[] {
  switch (line.kind) {
    case "missing":
      return [{ messageId: "noClass", data, at: null }];
    case "empty":
      return [{ messageId: "emptyClass", data, at: spanOf(line.place) }];
    case "class":
      return judgeClass(line, want, data);
    case "ambiguous":
      return judgeCandidates(line.candidates, want, data);
  }
}

/**
 * The paper's class line against the preset's template: a template the reader cannot read is said
 * once; then the class must be there, name a class, be the template's class, and carry every
 * option the template names.
 */
export function judgeTemplate(
  line: ClassLine,
  preset: Preset,
  latex: Pick<LatexReader, "template">,
): readonly Located[] {
  const t = preset.template;
  if (t === null) return [];
  const want = latex.template(t.text);
  if (want === null) {
    const data = { file: t.file, text: JSON.stringify(t.text) };
    return [{ messageId: "badTemplate", data, at: null }];
  }
  const data = { venue: preset.label, template: documentClassLine(want) };
  return judgeClassLine(line, want, data);
}

/** Where a heading starts, or null when the parser gave it no place. */
const startOf = (p: Place): number | null =>
  p.kind === "at" ? p.span.start : null;

/** A required section that is absent, reported where the document ends — where it would go. */
const missingSection = (
  outline: Outline,
  data: { readonly venue: string; readonly title: string },
): Located => ({
  messageId: "missing",
  data,
  at: outline.end === null ? null : { start: outline.end, end: outline.end },
});

/** The first section of the body that starts after `start` and is not titled `title`. */
function bodySectionAfter(
  outline: Outline,
  start: number,
  title: string,
): Heading | undefined {
  const backMatter = outline.backMatter ?? Number.POSITIVE_INFINITY;
  return outline.sections.find((h) => {
    const s = startOf(h.place);
    return s !== null && s > start && s < backMatter && h.title !== title;
  });
}

/**
 * One required section against the outline: missing (reported where the document ends, where it
 * would go), or — for `last` — standing before a section of the body. The body is every section
 * before the appendix and the bibliography, so the required one may follow the bibliography. A
 * heading without a place cannot be ordered, so it is never reported as out of order.
 */
function judgeSection(
  outline: Outline,
  want: RequiredSection,
  venue: string,
): readonly Located[] {
  const title = collapse(want.title);
  const last = outline.sections.filter((h) => h.title === title).at(-1);
  const data = { venue, title };
  if (last === undefined) return [missingSection(outline, data)];
  const lastStart = startOf(last.place);
  if (want.position !== "last" || lastStart === null) return [];
  const after = bodySectionAfter(outline, lastStart, title);
  if (after === undefined) return [];
  const notLast = { ...data, after: after.title };
  return [{ messageId: "notLast", data: notLast, at: spanOf(last.place) }];
}

/** Every section the preset requires, against the paper's outline. */
export function judgeRequiredSections(
  outline: () => Outline,
  preset: Preset,
): readonly Located[] {
  if (preset.requiredSections.length === 0) return [];
  const o = outline();
  return preset.requiredSections.flatMap((r) =>
    judgeSection(o, r, preset.label),
  );
}

/** Another shipped venue: the word for it, and what it is called in a paper's text. */
export type OtherVenue = NamedVenue;

/** `s` as a pattern that matches it literally. */
const literal = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Each place the rendered text names another venue — one of its aliases as a whole word, case
 * and all — unless that alias is also this paper's venue's own (a shared parent conference).
 */
export function judgeLeftover(
  runs: readonly TextRun[],
  preset: Preset,
  others: readonly OtherVenue[],
): readonly Located[] {
  const own = new Set(preset.aliases);
  const names = others.flatMap((o) =>
    o.aliases
      .filter((a) => !own.has(a))
      .map((alias) => ({
        other: o.label,
        re: new RegExp(
          `(?<![\\p{L}\\p{N}])${literal(alias)}(?![\\p{L}\\p{N}])`,
          "gu",
        ),
      })),
  );
  return runs.flatMap((run) =>
    names.flatMap(({ other, re }) =>
      [...runText(run).matchAll(re)].map((m) => ({
        messageId: "leftover",
        data: { name: m[0], other, venue: preset.label },
        at: spanIn(run, m.index, m.index + m[0].length),
      })),
    ),
  );
}

/** Where a rule's page lives: `docs/rules/tex/<name>.md` on the default branch. */
export const ruleDocsUrl = (
  name:
    | TexVenueRuleName
    | "claim-provenance"
    | "register"
    | "contrast-frames"
    | "claim-emphasis"
    | "relation-markers",
): string =>
  `https://github.com/zernie/paperlint/blob/main/docs/rules/tex/${name}.md`;

/** What a judge reads: the paper's source through the reader, its preset, the other venues. */
interface Reading {
  readonly src: string;
  readonly latex: LatexReader;
  readonly preset: Preset;
  readonly others: () => readonly OtherVenue[];
}
type Judge = (r: Reading) => readonly Located[];

export type TexVenueRuleName =
  "template" | "required-section" | "venue-leftover";

/** Every rule this module builds: the `tex` plugin's three and the `format` plugin's one. */
type RuleName = TexVenueRuleName | "layout-override";

/** Each layout override, where it stands. Silent for a preset that names no template. */
export function judgeLayout(
  overrides: readonly LayoutOverride[],
  preset: Preset,
): readonly Located[] {
  const template = preset.template;
  if (template === null) return [];
  return overrides.map((o) => ({
    messageId: "override",
    data: { command: o.command, venue: preset.label, template: template.text },
    at: spanOf(o.place),
  }));
}

const RULES: Readonly<
  Record<
    RuleName,
    { readonly judge: Judge; readonly meta: TexRuleModule["meta"] }
  >
> = {
  template: {
    judge: (r) =>
      judgeTemplate(r.latex.documentClass(r.src), r.preset, r.latex),
    meta: {
      type: "problem",
      docs: {
        description:
          "the \\documentclass is the venue preset's class, with every option the preset names",
        url: ruleDocsUrl("template"),
      },
      schema: [],
      messages: {
        noClass:
          "paper.tex has no \\documentclass; {{venue}} requires `{{template}}`",
        emptyClass:
          "the \\documentclass names no class; {{venue}} requires `{{template}}`",
        badTemplate:
          '{{file}}: the preset\'s "template" {{text}} is neither a \\documentclass line nor a class name, so the class cannot be checked',
        wrongClass:
          "the class is `{{got}}`, and {{venue}} requires `{{template}}` — the page size, fonts and layout the venue checks come from the class",
        missingOption:
          "the class option `{{option}}` is missing: {{venue}} requires `{{template}}`",
        noCandidate:
          "none of the {{count}} \\documentclass lines is `{{template}}`, which {{venue}} requires: {{candidates}}. The source picks one behind a TeX switch, which is not evaluated; make one of them the venue's",
      },
    },
  },
  "required-section": {
    judge: (r) => judgeRequiredSections(() => r.latex.outline(r.src), r.preset),
    meta: {
      type: "problem",
      docs: {
        description:
          "every section the venue preset requires is there, titled exactly, and where the preset says",
        url: ruleDocsUrl("required-section"),
      },
      schema: [],
      messages: {
        missing:
          "{{venue}} requires a section titled «{{title}}» and there is none — add `\\section*{{{title}}}` (the title exactly; a bold paragraph does not count)",
        notLast:
          "«{{title}}» must close the paper at {{venue}}, and the section «{{after}}» comes after it — move it after the last section of the body (after the bibliography is fine)",
      },
    },
  },
  "layout-override": {
    judge: (r) => judgeLayout(r.latex.layoutOverrides(r.src), r.preset),
    meta: {
      type: "problem",
      docs: {
        description:
          "the source changes the page layout the venue's template sets for the whole document: margins, text block, line spacing",
        url: "https://github.com/zernie/paperlint/blob/main/docs/rules/format/layout-override.md",
      },
      schema: [],
      messages: {
        override:
          "`{{command}}` changes the page layout {{venue}}'s template sets (`{{template}}`) — a desk-reject reason at venues that check the format. Remove it; if the venue allows it, disable this line with a comment saying so",
      },
    },
  },
  "venue-leftover": {
    judge: (r) =>
      judgeLeftover(r.latex.renderedRuns(r.src), r.preset, r.others()),
    meta: {
      type: "suggestion",
      docs: {
        description:
          "the text names another shipped venue than the one the paper extends — a leftover from an earlier submission",
        url: ruleDocsUrl("venue-leftover"),
      },
      schema: [],
      messages: {
        leftover:
          "«{{name}}» names {{other}}, and this paper extends {{venue}} — a leftover from an earlier submission? A reviewer reads it before the abstract. Comments and citation keys are not reported; a sentence that names the other venue on purpose can keep it with a disable directive",
      },
    },
  },
};

/** The level each rule is on at in paperlint's own config, for every `paper.tex`. */
export const TEX_VENUE_RULE_LEVELS: Readonly<
  Record<`tex/${TexVenueRuleName}`, "error" | "warn">
> = {
  "tex/template": "error",
  "tex/required-section": "error",
  "tex/venue-leftover": "warn",
};

/** The `format` plugin's rule over the source and its level, on for every `paper.tex`. */
export const FORMAT_RULE_LEVELS: Readonly<
  Record<"format/layout-override", "error">
> = {
  "format/layout-override": "error",
};

/**
 * Every shipped venue but the ones on this paper's own chain, from the one source of venue names
 * (`shippedVenueNames`). A preset all of whose files are on this paper's chain is this venue or one
 * it extends.
 */
export function otherVenues(
  preset: Pick<Preset, "chain">,
  deps: VenueRuleDeps,
): readonly OtherVenue[] {
  return shippedVenueNames(deps)
    .filter((v) => !v.chain.every((f) => preset.chain.includes(f)))
    .map(({ label, aliases }) => ({ label, aliases }));
}

/** What the venue-conformance rules are built with: the preset store, and the LaTeX reader. */
export interface TexVenueRuleDeps extends VenueRuleDeps {
  readonly latex: LatexReader;
}

/**
 * What a judge reads for the paper whose `paper.tex` is `filename` — the paper with its includes
 * spliced (`readPaper`) — or null when the paper has no resolved preset (`pdf/measured` and
 * `pdf/profile` already say so).
 */
function readingOf(
  filename: string,
  src: string,
  deps: TexVenueRuleDeps,
): { readonly reading: Reading; readonly paper: PaperSource } | null {
  const dir = dirname(filename);
  const p = paperPreset(dir, deps);
  if (p.kind !== "resolved") return null;
  const preset = p.preset;
  const others = () => otherVenues(preset, deps);
  const paper = readPaper(filename, src, deps);
  return {
    reading: { src: paper.text, latex: deps.latex, preset, others },
    paper,
  };
}

function rule(name: RuleName, deps: TexVenueRuleDeps): TexRuleModule {
  const { judge, meta } = RULES[name];
  return {
    meta,
    create(context) {
      // Judged once per paper, on its paper.tex: the paper directory is the file's directory.
      if (basename(context.filename) !== "paper.tex") return {};
      return {
        root() {
          const sc = context.sourceCode;
          const r = readingOf(context.filename, sc.raw ?? sc.text, deps);
          if (r !== null)
            reportInPaper(context, meta.messages, r.paper, judge(r.reading));
        },
      };
    },
  };
}

/** The venue-conformance rules, as rules of the `tex` plugin (beside `tex/future-promise`). */
export function texVenueRules(
  deps: TexVenueRuleDeps,
): Readonly<Record<TexVenueRuleName, TexRuleModule>> {
  return {
    template: rule("template", deps),
    "required-section": rule("required-section", deps),
    "venue-leftover": rule("venue-leftover", deps),
  };
}

/** The `format` plugin's rule over the source (`page-limit`, over the PDF, is in `venue-rules.ts`). */
export function formatRules(
  deps: TexVenueRuleDeps,
): Readonly<Record<"layout-override", TexRuleModule>> {
  return { "layout-override": rule("layout-override", deps) };
}
