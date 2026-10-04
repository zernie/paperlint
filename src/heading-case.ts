/**
 * THE RULE THAT JUDGES THE CASE OF TITLES — `tex/heading-case`, over the paper's `\title` and the
 * titles of `\section`, `\subsection`, `\subsubsection`, `\paragraph` and `\subparagraph`
 * (starred or not, and each optional short title).
 *
 *   tex/heading-case  off unless turned on  every word of a title is in the case its scope asks:
 *                                           { title, headings, levels? }, each a CaseStyle
 *
 * ── WHY IT IS AN OPTION AND NOT A DEFAULT ────────────────────────────────────────
 * Which style a venue asks is the venue's, and venues name different authorities: Conference
 * Publishing (AgenticDev's proceedings) quotes the Chicago Manual of Style, ACL links APA title case,
 * IEEE's manual has its own list. So the rule is optional, like `pdf/last-page-balance`: a venue
 * preset whose author kit was read turns it on in its `rules` — today only `presets/agenticdev.jsonc`
 * — and a paper may turn it on in its own `paperlint.json`.
 *
 * ── THE OPTIONS ARE PARSED ONCE, WHEN ESLINT LOADS THE RULE ──────────────────────
 * ESLint checks the SHAPE against `meta.schema`: `title` and `headings` required, no other key, no
 * unknown level. The VALUES are judged by `parseOptions`, because ajv's enum message («should be
 * equal to one of the allowed values») names none of them: a misspelt style, the retired words
 * `headline` and `off`, and `any` for both scopes each throw from `create`, which ESLint reports as
 * «Error while loading rule» and stops the run. The judge then gets `HeadingCaseOptions` and never
 * looks at the raw object again. A bare severity (`"error"`, no options) passes ESLint's schema —
 * it validates the options it is given, not their count — so it is reported once, at the top of the
 * file, rather than passing as a rule that checked nothing.
 *
 * ── ONE FILE AT A TIME ───────────────────────────────────────────────────────────
 * The rule reads the file ESLint hands it, like `paper/section-word`: it runs on `paper.tex` and on
 * every file `paper.tex` includes from its body (the `**` block of `src/cli.ts`), so a heading in
 * `sections/results.tex` is reported at that file and line, and `--fix` edits that file. The
 * preamble is read too: that is where `\title` stands.
 *
 * What a word is asked is decided in `src/domain/heading-case.ts`.
 */
import {
  CASE_STYLES,
  HEADING_LEVELS,
  judgeHeadingCase,
  type CaseFinding,
  type CaseStyle,
  type HeadingCaseOptions,
} from "./domain/heading-case.ts";
import { fieldOf, isRecord } from "./domain/record.ts";
import type { HeadingLevel } from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import { ruleDocsUrl } from "./tex-venue-rules.ts";

/** What the rule reads with: the LaTeX reader. */
export interface HeadingCaseDeps {
  readonly latex: LatexReader;
}

type Loc = { readonly line: number; readonly column: number };

/** The slice of ESLint's rule context this rule uses. `raw` exists on the `.tex` language's. */
export interface HeadingCaseContext {
  readonly options: readonly unknown[];
  readonly sourceCode: {
    readonly text: string;
    readonly raw?: string;
    getLocFromIndex(index: number): Loc;
  };
  report(d: {
    readonly loc: { readonly start: Loc; readonly end: Loc };
    readonly messageId: string;
    readonly data?: Readonly<Record<string, string>>;
    readonly fix?: (fixer: {
      replaceTextRange(range: readonly [number, number], text: string): unknown;
    }) => unknown;
  }): void;
}

export interface HeadingCaseRule {
  readonly meta: {
    readonly type: "suggestion";
    readonly fixable: "code";
    readonly docs: { readonly description: string; readonly url: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: HeadingCaseContext): { root?: () => void };
}

const DOCS_URL = ruleDocsUrl("heading-case");

/** The rule's options as ESLint gave them: a configuration, none at all, or one it refuses. */
type Asked =
  | { readonly kind: "options"; readonly options: HeadingCaseOptions }
  | { readonly kind: "none" }
  | { readonly kind: "refused"; readonly reason: string };

const refused = (reason: string): Asked => ({
  kind: "refused",
  reason: `${reason} — ${DOCS_URL}`,
});

const quoted = (xs: readonly string[]): string =>
  xs.map((x) => JSON.stringify(x)).join(", ");

/** One style value, or why it is none; `key` is how the message names where it stands. */
function styleOf(
  key: string,
  v: unknown,
): CaseStyle | { readonly why: string } {
  const style = CASE_STYLES.find((s) => s === v);
  if (style !== undefined) return style;
  if (v === "headline")
    return {
      why: `"${key}" is "headline", which names no single style: write "chicago-headline" for the Chicago Manual of Style headline style. Other headline variants (APA title case, IEEE, Springer) are not implemented yet, and they disagree with Chicago on words such as With, Between and From`,
    };
  if (v === "off")
    return {
      why: `"${key}" is "off", which is not a style: write "any" to leave this scope unconstrained, or turn the whole rule off with "tex/heading-case": "off"`,
    };
  const shown = v === undefined ? "missing" : JSON.stringify(v);
  return {
    why: `"${key}" is ${shown}, which is not a style: one of ${quoted(CASE_STYLES)}`,
  };
}

type Levels = Readonly<Partial<Record<HeadingLevel, CaseStyle>>>;

/** The `levels` object: the levels it names, each with its style, or why it is refused. */
function levelsOf(v: unknown): Levels | { readonly why: string } {
  if (v === undefined) return {};
  if (!isRecord(v))
    return {
      why: `"levels" is ${JSON.stringify(v)}, not an object such as {"paragraph": "sentence"}`,
    };
  return HEADING_LEVELS.reduce<Levels | { readonly why: string }>(
    (acc, level) => {
      if ("why" in acc || !(level in v)) return acc;
      const style = styleOf(`levels.${level}`, v[level]);
      return typeof style === "string" ? { ...acc, [level]: style } : style;
    },
    {},
  );
}

/** Whether every scope is `any`: the rule turned off, said in a second way. */
const asksNothing = (o: HeadingCaseOptions): boolean =>
  o.title === "any" &&
  o.headings === "any" &&
  Object.values(o.levels ?? {}).every((s) => s === "any");

/** ESLint's options for the rule → what it is asked, parsed once. */
function parseOptions(options: readonly unknown[]): Asked {
  const [raw] = options;
  if (raw === undefined) return { kind: "none" };
  if (!isRecord(raw))
    return refused(
      `the options are ${JSON.stringify(raw)}, not an object such as {"title": "chicago-headline", "headings": "chicago-headline"}`,
    );
  const title = styleOf("title", fieldOf(raw, "title"));
  if (typeof title !== "string") return refused(title.why);
  const headings = styleOf("headings", fieldOf(raw, "headings"));
  if (typeof headings !== "string") return refused(headings.why);
  const levels = levelsOf(fieldOf(raw, "levels"));
  if ("why" in levels) return refused(levels.why);
  const parsed = { title, headings, levels };
  return asksNothing(parsed)
    ? refused(
        `"title" and "headings" are both "any" and no level asks for more: that is the rule turned off — remove it from "rules", or set it to "off"`,
      )
    : { kind: "options", options: parsed };
}

const MESSAGES: Readonly<Record<string, string>> = {
  capitalize:
    "{{where}}: capitalize «{{word}}» → «{{expected}}» — {{why}} (chicago-headline)",
  lowercase:
    "{{where}}: lowercase «{{word}}» → «{{expected}}» — {{why}} (chicago-headline)",
  sentenceFirst:
    "{{where}}: capitalize the first word, «{{word}}» → «{{expected}}» (sentence; not fixed: a product name written in lowercase looks the same)",
  noOptions: `tex/heading-case is on with no options, so it judged nothing: give it the styles the venue asks, e.g. ["error", {"title": "chicago-headline", "headings": "chicago-headline"}] (styles: ${quoted(CASE_STYLES)})`,
};

/** One finding reported where its word stands, with the fix when the judge is sure of it. */
function report(context: HeadingCaseContext, f: CaseFinding): void {
  const sc = context.sourceCode;
  const { fix } = f;
  context.report({
    loc: {
      start: sc.getLocFromIndex(f.at.start),
      end: sc.getLocFromIndex(f.at.end),
    },
    messageId: f.messageId,
    data: f.data,
    ...(fix === null
      ? {}
      : {
          fix: (fixer) =>
            fixer.replaceTextRange([fix.span.start, fix.span.end], fix.text),
        }),
  });
}

/**
 * A style value, as the schema checks it: a string. Which strings are styles is `parseOptions`'s to
 * say, so that the refusal can name them (see the header).
 */
const STYLE = { type: "string" } as const;

const META: HeadingCaseRule["meta"] = {
  type: "suggestion",
  fixable: "code",
  docs: {
    description:
      "the words of the paper's title and of its headings are in the capitalization the venue asks: chicago-headline or sentence",
    url: DOCS_URL,
  },
  schema: [
    {
      type: "object",
      properties: {
        title: STYLE,
        headings: STYLE,
        levels: {
          type: "object",
          properties: Object.fromEntries(
            HEADING_LEVELS.map((level) => [level, STYLE]),
          ),
          additionalProperties: false,
        },
      },
      required: ["title", "headings"],
      additionalProperties: false,
    },
  ],
  messages: MESSAGES,
};

/** The rule turned on with no options: said once, at the top of the file. */
function reportNoOptions(context: HeadingCaseContext): void {
  const start = context.sourceCode.getLocFromIndex(0);
  context.report({ loc: { start, end: start }, messageId: "noOptions" });
}

/** One file against the options the rule was given. */
function judgeFile(
  context: HeadingCaseContext,
  deps: HeadingCaseDeps,
  options: HeadingCaseOptions,
): void {
  const sc = context.sourceCode;
  const src = sc.raw ?? sc.text;
  judgeHeadingCase(deps.latex.headings(src), options, src).forEach((f) => {
    report(context, f);
  });
}

/** The rule: its options are parsed when ESLint loads it, and a refused one stops the run. */
export const headingCaseRule = (deps: HeadingCaseDeps): HeadingCaseRule => ({
  meta: META,
  create: (context) => {
    const asked = parseOptions(context.options);
    switch (asked.kind) {
      case "refused":
        throw new Error(asked.reason);
      case "none":
        return {
          root: () => {
            reportNoOptions(context);
          },
        };
      case "options":
        return {
          root: () => {
            judgeFile(context, deps, asked.options);
          },
        };
    }
  },
});
