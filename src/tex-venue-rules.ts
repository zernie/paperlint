/**
 * THE VENUE-CONFORMANCE RULES OVER THE SOURCE — `paper.tex` judged against what its venue preset
 * requires of the LaTeX itself, before any build:
 *
 *   tex/template          error  the `\documentclass` is the preset's class, with every option it names
 *                                and none it forbids (`template_forbids`)
 *   tex/required-section  error  each section the preset requires is there, titled exactly, and
 *                                where the preset says (`last`: after every section of the body)
 *   tex/venue-leftover    warn   the text a reader sees names ANOTHER shipped venue — its `name`
 *                                or one of its `aliases` — than the edition the paper extends: in
 *                                prose beside a recent year, in a venue-identity command always
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
  optionsInEffect,
  readWhole,
  runText,
  spanIn,
  usepackageLine,
  type ClassCandidate,
  type ClassLine,
  type DocumentClass,
  type Heading,
  type LayoutOverride,
  type Outline,
  type PackageLoad,
  type Place,
  type StylePackage,
  type Span,
  type TextRun,
} from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import {
  paperPreset,
  shippedStyles,
  shippedVenueNames,
  type Preset,
  type PresetTemplate,
} from "./presets.ts";
import type { NamedVenue } from "./domain/venue-name.ts";
import { editionLabel } from "./domain/edition.ts";
import type { PaperSource } from "./domain/paper-source.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import type { RequiredSection } from "./tex-requirements.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";
import { isPorting } from "./domain/cycle.ts";

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

/** What the template requires of a class line: its class and options, and the options it forbids. */
interface Wanted {
  readonly cls: DocumentClass;
  readonly forbids: readonly string[];
}

/**
 * A class line that names a class, against the template's: the same class, with every option, and
 * none of the options the preset forbids. An option `\PassOptionsToClass` gave the class before the
 * line counts as the line's, and a forbidden one is reported where it is passed. When an option is
 * built by a macro, what it carries is not known: no option is said to be missing, and a forbidden
 * option written out is still reported — it is in effect whatever the macro holds.
 */
function judgeClass(
  line: Extract<ClassLine, { readonly kind: "class" }>,
  want: Wanted,
  data: TemplateData,
): readonly Located[] {
  const at = spanOf(line.place);
  if (line.cls !== want.cls.cls)
    return [{ messageId: "wrongClass", data: { ...data, got: line.cls }, at }];
  const without = want.forbids.map((o) => `\`${o}\``).join(", ");
  const forbidden = (options: readonly string[], where: Span | null) =>
    want.forbids
      .filter((o) => options.includes(o))
      .map((option) => ({
        messageId: "forbiddenOption",
        data: { ...data, option, without },
        at: where,
      }));
  const missing = readWhole(line)
    ? missingOptions(optionsInEffect(line), want.cls)
    : [];
  return [
    ...line.passed.flatMap((p) => forbidden(p.options, spanOf(p.place))),
    ...forbidden(line.options, at),
    ...missing.map((option) => ({
      messageId: "missingOption",
      data: { ...data, option },
      at,
    })),
  ];
}

/**
 * A candidate as the message names it: its line, or an empty `\documentclass{}` — the one other
 * kind a message names, since an unread candidate may match and silences the switch.
 */
const candidateLine = (c: ClassCandidate): string =>
  c.kind === "class" ? documentClassLine(c) : "\\documentclass{}";

/** Whether a candidate may be the template's line: a class line with no finding, or an unread one. */
const mayMatch = (
  c: ClassCandidate,
  want: Wanted,
  data: TemplateData,
): boolean =>
  c.kind === "unread" ||
  (c.kind === "class" && judgeClass(c, want, data).length === 0);

/**
 * Several class lines behind a TeX switch: satisfied when any candidate is the template's class
 * with its options, or may be (one built by a macro); otherwise one finding, at the first
 * candidate, naming every one.
 */
function judgeCandidates(
  candidates: readonly [ClassCandidate, ...ClassCandidate[]],
  want: Wanted,
  data: TemplateData,
): readonly Located[] {
  if (candidates.some((c) => mayMatch(c, want, data))) return [];
  const named = candidates.map((c) => `\`${candidateLine(c)}\``).join(", ");
  const found = { ...data, count: candidates.length, candidates: named };
  return [
    { messageId: "noCandidate", data: found, at: spanOf(candidates[0].place) },
  ];
}

/** The paper's class line against a template that was read: present, naming a class, that class. */
function judgeClassLine(
  line: ClassLine,
  want: Wanted,
  data: TemplateData,
): readonly Located[] {
  switch (line.kind) {
    case "missing":
      return [{ messageId: "noClass", data, at: null }];
    // A class this reader cannot see or read is not judged: it may be the venue's.
    case "unseen":
    case "unread":
      return [];
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
  latex: Pick<LatexReader, "template" | "templateStyle">,
  style: StyleInput = NO_STYLE_INPUT,
): readonly Located[] {
  const t = preset.template;
  if (t === null) return [];
  const want = latex.template(t.text);
  if (want === null) {
    const data = { file: t.file, text: JSON.stringify(t.text) };
    return [{ messageId: "badTemplate", data, at: null }];
  }
  const data = { venue: preset.label, template: documentClassLine(want) };
  return [
    ...judgeClassLine(line, { cls: want, forbids: t.forbids }, data),
    ...judgeStyle(style, preset, latex),
  ];
}

/** What the style check reads: the packages the paper loads, and the styles of other shipped venues. */
export interface StyleInput {
  readonly packages: readonly PackageLoad[];
  /** The package names of the `template_style` of every shipped venue off this paper's chain. */
  readonly others: readonly string[];
}

const NO_STYLE_INPUT: StyleInput = { packages: [], others: [] };

/**
 * A style's series: its name without the edition and what follows it — `neurips_2026` → `neurips`,
 * `iclr2027_conference` → `iclr`, `ijcai26` → `ijcai`. Two names of one series and two editions are
 * another year's style.
 */
const seriesOf = (name: string): string =>
  name.replace(/[-_]?\d{2,4}(?:[-_].*)?$/u, "");

/**
 * Another style than the template's, loaded in its place: one a shipped preset off this paper's chain
 * names, or one of the same series and another edition. Any other package is the paper's own.
 */
const isOtherStyle = (
  name: string,
  want: string,
  others: readonly string[],
): boolean =>
  name !== want &&
  (others.includes(name) ||
    (seriesOf(name) !== "" && seriesOf(name) === seriesOf(want)));

/**
 * The lines that load the template's style: satisfied when any carries every option the style names;
 * otherwise each option the first line lacks, at that line.
 */
function judgeLoaded(
  loads: readonly PackageLoad[],
  want: StylePackage,
  data: { readonly venue: string; readonly style: string },
): readonly Located[] {
  const [first] = loads;
  if (
    first === undefined ||
    loads.some((l) => want.options.every((o) => l.options.includes(o)))
  )
    return [];
  return want.options
    .filter((o) => !first.options.includes(o))
    .map((option) => ({
      messageId: "missingStyleOption",
      data: { ...data, option },
      at: spanOf(first.place),
    }));
}

/**
 * The paper's packages against the preset's `template_style`: loaded with every option it names (by
 * any of the lines, as several class lines behind a switch); loaded without one; another venue's or
 * another year's style loaded instead; or not loaded at all.
 */
export function judgeStyle(
  { packages, others }: StyleInput,
  preset: Preset,
  latex: Pick<LatexReader, "templateStyle">,
): readonly Located[] {
  const s = preset.templateStyle;
  if (s === null) return [];
  const want = latex.templateStyle(s.text);
  if (want === null) {
    const data = { file: s.file, text: JSON.stringify(s.text) };
    return [{ messageId: "badStyle", data, at: null }];
  }
  const data = { venue: preset.label, style: usepackageLine(want) };
  const loads = packages.filter((p) => p.name === want.name);
  if (loads.length > 0) return judgeLoaded(loads, want, data);
  const instead = packages.find((p) => isOtherStyle(p.name, want.name, others));
  return instead === undefined
    ? [{ messageId: "missingStyle", data, at: null }]
    : [
        {
          messageId: "wrongStyle",
          data: { ...data, got: instead.name },
          at: spanOf(instead.place),
        },
      ];
}

/**
 * Whether the paper's class line is known to be the template's: read whole — no class or option
 * built by a macro, no class unseen — and judged without a finding; behind a switch, one candidate
 * so. Silence from `judgeTemplate` is not enough: it is also silent on a line it cannot read.
 */
export function isTemplate(
  line: ClassLine,
  t: PresetTemplate,
  venue: string,
  latex: Pick<LatexReader, "template">,
): boolean {
  const want = latex.template(t.text);
  if (want === null) return false;
  const wanted = { cls: want, forbids: t.forbids };
  const data = { venue, template: documentClassLine(want) };
  const proved = (c: ClassLine): boolean =>
    c.kind === "class" &&
    readWhole(c) &&
    judgeClass(c, wanted, data).length === 0;
  return line.kind === "ambiguous"
    ? line.candidates.some(proved)
    : proved(line);
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

/**
 * Another shipped venue as the text names it: the word for it (its `name`), every name it goes by,
 * and its edition's year (from its id).
 */
export type OtherVenue = NamedVenue & Pick<Preset, "year" | "declaredAliases">;

/**
 * A year beside a name, right after it: `2027`, `'27` or `’27`, after spaces or none (`~` renders
 * as a no-break space). Anchored: it is tried on the text after the name.
 */
const YEAR_AFTER = /^[\s\u00a0]*(?:(\d{4})|['’](\d{2}))(?![\p{L}\p{N}])/u;

/** The year written right after offset `end` of `text`, or null. `'27` is 2027. Pure. */
function yearAfter(text: string, end: number): number | null {
  const m = YEAR_AFTER.exec(text.slice(end));
  if (m === null) return null;
  return m[1] !== undefined
    ? Number.parseInt(m[1], 10)
    : 2000 + Number.parseInt(String(m[2]), 10);
}

/** `s` as a pattern that matches it literally. */
const literal = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** One name a match is judged by: whether it is the paper's own, and the venue it shows as. */
interface NameToJudge {
  readonly name: string;
  readonly own: boolean;
  readonly shows: string;
}

/**
 * Every name to look for, once each: every other shipped venue's, shown as that venue's `name`, and
 * the paper's own and its parent's, which count only in another edition. Pure.
 */
function namesToJudge(
  preset: Pick<Preset, "label" | "aliases" | "parentNames">,
  others: readonly OtherVenue[],
): readonly NameToJudge[] {
  const own = new Set([...preset.aliases, ...preset.parentNames]);
  const shownBy = (name: string): string =>
    others.find((o) => o.aliases.includes(name))?.label ??
    (preset.aliases.includes(name) ? preset.label : name);
  const all = [...new Set([...others.flatMap((o) => o.aliases), ...own])];
  return all.map((name) => ({
    name,
    own: own.has(name),
    shows: shownBy(name),
  }));
}

/**
 * Whether a name at a place, with `year` beside it (null: none), names another venue than the
 * paper's edition (of year `paperYear`). Inside a venue-identity command (`inLine`) any other
 * venue's name counts; in prose only beside a year no older than the paper's year minus one, so
 * related work («ICSE 2019») and a bare acronym are not leftovers. The paper's own names, and its
 * parent's, count only beside another year: another edition of its own series. Pure.
 */
export function namesAnotherEdition(
  n: { readonly own: boolean; readonly inLine: boolean },
  year: number | null,
  paperYear: number | null,
): boolean {
  const recent = paperYear === null || (year !== null && year >= paperYear - 1);
  if (n.own)
    return (
      year !== null &&
      paperYear !== null &&
      year !== paperYear &&
      (n.inLine || recent)
    );
  return n.inLine || (year !== null && recent);
}

/** A name to look for, with the pattern that finds it as a whole word. */
type NameMatcher = NameToJudge & { readonly re: RegExp };

/**
 * The findings of one name in one run: each whole-word match judged with the year beside it and
 * whether it stands in a venue-stating command (`inLine`). Pure.
 */
function matchesIn(
  run: TextRun,
  n: NameMatcher,
  paper: {
    readonly inLine: (at: Span | null) => boolean;
    readonly year: number | null;
    readonly venue: string;
  },
): readonly Located[] {
  const { inLine, venue } = paper;
  const text = runText(run);
  return [...text.matchAll(n.re)].flatMap((m) => {
    const at = spanIn(run, m.index, m.index + m[0].length);
    const year = yearAfter(text, m.index + m[0].length);
    const judged = { own: n.own, inLine: inLine(at) };
    if (!namesAnotherEdition(judged, year, paper.year)) return [];
    const other = editionLabel(n.shows, year);
    return [{ messageId: "leftover", data: { name: m[0], other, venue }, at }];
  });
}

/**
 * Each place the rendered text names another venue than the paper's edition — a name as a whole
 * word, case and all, judged with the year beside it (`namesAnotherEdition`). `lines` are the spans
 * of the commands that state the paper's venue (`\acmConference` …).
 */
export function judgeLeftover(
  runs: readonly TextRun[],
  lines: readonly Place[],
  preset: Preset,
  others: readonly OtherVenue[],
): readonly Located[] {
  const venue = editionLabel(preset.label, preset.year);
  const inLine = (at: Span | null): boolean =>
    at !== null &&
    lines.some(
      (l) =>
        l.kind === "at" && l.span.start <= at.start && at.start < l.span.end,
    );
  const names: readonly NameMatcher[] = namesToJudge(preset, others).map(
    (n) => ({
      ...n,
      re: new RegExp(
        `(?<![\\p{L}\\p{N}])${literal(n.name)}(?![\\p{L}\\p{N}])`,
        "gu",
      ),
    }),
  );
  return runs.flatMap((run) =>
    names.flatMap((n) =>
      matchesIn(run, n, { inLine, year: preset.year, venue }),
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
    | "relation-markers"
    | "negated-sentences"
    | "heading-case"
    | "max-paragraph-words"
    | "max-paragraph-numbers"
    | "max-sentence-words"
    | "max-caption-words"
    | "term-before-definition"
    | "term-defined-twice",
): string =>
  `https://github.com/zernie/paperlint/blob/main/docs/rules/tex/${name}.md`;

/** What a judge reads: the paper's source through the reader, its preset, the other venues. */
interface Reading {
  readonly src: string;
  readonly latex: LatexReader;
  readonly preset: Preset;
  readonly others: () => readonly OtherVenue[];
  /** The package names of the styles other shipped venues' templates load. */
  readonly styles: () => readonly string[];
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
      judgeTemplate(r.latex.documentClass(r.src), r.preset, r.latex, {
        packages: r.latex.packages(r.src),
        others: r.styles(),
      }),
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
        forbiddenOption:
          "the class option `{{option}}` is forbidden: {{venue}} requires `{{template}}` without {{without}}",
        badStyle:
          '{{file}}: the preset\'s "template_style" {{text}} is not one \\usepackage line naming one package, so the style cannot be checked',
        missingStyle:
          "{{venue}} requires `{{style}}`; paper.tex loads no such package — the page, the fonts and the margins the venue checks come from it",
        wrongStyle:
          "paper.tex loads `{{got}}`, another venue's or another year's style; {{venue}} requires `{{style}}`",
        missingStyleOption:
          "the style option `{{option}}` is missing: {{venue}} requires `{{style}}`",
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
      judgeLeftover(
        r.latex.renderedRuns(r.src),
        r.latex.venueLines(r.src),
        r.preset,
        r.others(),
      ),
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
    .map(({ label, aliases, year, declaredAliases }) => ({
      label,
      aliases,
      year,
      declaredAliases,
    }));
}

/**
 * The package names of the styles every shipped venue off this paper's chain loads into its class:
 * what `tex/template` reports when a paper loads one instead of its own venue's.
 */
export function otherStyles(
  preset: Pick<Preset, "chain">,
  deps: TexVenueRuleDeps,
): readonly string[] {
  return shippedStyles(deps)
    .filter((s) => !s.chain.every((f) => preset.chain.includes(f)))
    .flatMap((s) => {
      const parsed = deps.latex.templateStyle(s.text);
      return parsed === null ? [] : [parsed.name];
    });
}

/** What the venue-conformance rules are built with: the preset store, the LaTeX reader, and the paper's files as the build recorded them. */
export interface TexVenueRuleDeps extends VenueRuleDeps, ProseDeps {}

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
  // The port to this venue's template is declared open work: the class line is the previous
  // venue's by declaration, and `cycle/port-done` watches that declaration.
  if (p.settings.cycles !== null && isPorting(p.settings.cycles.current))
    return null;
  const preset = p.preset;
  const others = () => otherVenues(preset, deps);
  const styles = () => otherStyles(preset, deps);
  const paper = readPaper(filename, src, deps);
  return {
    reading: { src: paper.text, latex: deps.latex, preset, others, styles },
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

// ── cycle/port-done: the declared port is finished ───────────────────────────────────────

/**
 * `cycle/port-done` (error): the current cycle declares `"phase": "porting"`, and the paper's
 * `\documentclass` is already the venue's template. The declaration silences every venue rule
 * (`src/venue-rules.ts`, `readingOf` above); once the class line is the venue's, the port is done
 * and the declaration is stale — this is the other half that keeps `porting` from being a mute
 * button. Silent when the preset names no template: there is nothing to compare, as for `tex/template`.
 */
export function judgePortDone(
  r: Pick<Reading, "src" | "latex" | "preset">,
  cycleId: string,
): readonly Located[] {
  const t = r.preset.template;
  if (t === null) return [];
  const line = r.latex.documentClass(r.src);
  // Only a class line read whole and found to be the venue's ends the port: one built by a macro
  // gets no finding from tex/template, and is not the venue's for that. And the style with it: a
  // port from one article-based style to another is not done while the class line already matches.
  if (!isTemplate(line, t, r.preset.label, r.latex)) return [];
  const style = { packages: r.latex.packages(r.src), others: [] };
  if (judgeStyle(style, r.preset, r.latex).length > 0) return [];
  const data = { venue: r.preset.label, template: t.text, id: cycleId };
  return [{ messageId: "done", data, at: null }];
}

const PORT_DONE_META: TexRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "the current cycle still says `porting` while the \\documentclass is already the venue's template — the port is done, drop the phase",
    url: "https://github.com/zernie/paperlint/blob/main/docs/rules/cycle/port-done.md",
  },
  schema: [],
  messages: {
    done: 'the \\documentclass is already `{{template}}`, which {{venue}} requires, and the cycle «{{id}}» still declares "phase": "porting" — the port is done: remove the phase, so the venue\'s format rules judge this paper again',
  },
};

/** The `cycle` plugin's rule over the source, for every `paper.tex`. */
export function cyclePortRules(
  deps: TexVenueRuleDeps,
): Readonly<Record<"port-done", TexRuleModule>> {
  return {
    "port-done": {
      meta: PORT_DONE_META,
      create(context) {
        if (basename(context.filename) !== "paper.tex") return {};
        return {
          root() {
            const p = paperPreset(dirname(context.filename), deps);
            if (p.kind !== "resolved") return;
            const current = p.settings.cycles?.current;
            if (current?.kind !== "cycle" || !isPorting(current)) return;
            const sc = context.sourceCode;
            const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
            const found = judgePortDone(
              { src: paper.text, latex: deps.latex, preset: p.preset },
              current.cycle.id,
            );
            reportInPaper(context, PORT_DONE_META.messages, paper, found);
          },
        };
      },
    },
  };
}

export const CYCLE_PORT_RULE_LEVELS: Readonly<
  Record<"cycle/port-done", "error">
> = { "cycle/port-done": "error" };
