/**
 * THE RULE THAT JUDGES THE CASE OF HEADINGS — `tex/heading-case`, over the titles of `\section`,
 * `\subsection`, `\subsubsection` and `\paragraph` (starred or not, and the optional short title).
 *
 *   tex/heading-case  off unless turned on  every word of a title is in the case the style asks:
 *                                           headline (ACM's), sentence (first word only), or off
 *
 * ── WHY IT IS AN OPTION AND NOT A DEFAULT ────────────────────────────────────────
 * Which style a venue asks is the venue's: ACM's proceedings instructions ask headline style, and
 * paperlint has not read IEEE's or ACL's author kits for it. So the rule is optional, like
 * `pdf/last-page-balance`: a venue preset turns it on in its `rules` with its style
 * (`presets/acm-sigconf.jsonc`), and a paper that extends one that does not may turn it on in its own
 * `paperlint.json`. Turned on with no style it says so, once, rather than passing as a rule that
 * checked nothing.
 *
 * ── ONE FILE AT A TIME ───────────────────────────────────────────────────────────
 * The rule reads the file ESLint hands it, like `paper/section-word`: it runs on `paper.tex` and on
 * every file `paper.tex` includes from its body (the `**` block of `src/cli.ts`), so a heading in
 * `sections/results.tex` is reported at that file and line, and `--fix` edits that file.
 *
 * What a word is asked is decided in `src/domain/heading-case.ts`.
 */
import { judgeHeadingCase, type CaseFinding } from "./domain/heading-case.ts";
import type { HeadingStyle } from "./domain/heading-case.ts";
import { fieldOf } from "./domain/record.ts";
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

const STYLES: readonly HeadingStyle[] = ["headline", "sentence", "off"];

/** The style the rule was given, or null when it was given none. */
function styleOf(options: readonly unknown[]): HeadingStyle | null {
  const style = fieldOf(options[0], "style");
  return STYLES.find((s) => s === style) ?? null;
}

const MESSAGES: Readonly<Record<string, string>> = {
  capitalize:
    "{{where}}: capitalize «{{word}}» → «{{expected}}» — {{why}} (headline style)",
  lowercase:
    "{{where}}: lowercase «{{word}}» → «{{expected}}» — {{why}} (headline style)",
  sentenceFirst:
    "{{where}}: capitalize the first word, «{{word}}» → «{{expected}}» (sentence style; not fixed: a product name written in lowercase looks the same)",
  noStyle:
    'tex/heading-case is on and names no style: set {"style": "headline"}, {"style": "sentence"} or {"style": "off"}',
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

const META: HeadingCaseRule["meta"] = {
  type: "suggestion",
  fixable: "code",
  docs: {
    description:
      "the words of a heading are in the capitalization the venue asks: headline style, or sentence style",
    url: ruleDocsUrl("heading-case"),
  },
  schema: [
    {
      type: "object",
      properties: { style: { enum: STYLES } },
      required: ["style"],
      additionalProperties: false,
    },
  ],
  messages: MESSAGES,
};

/** The rule turned on with no style: said once, at the top of the file. */
function reportNoStyle(context: HeadingCaseContext): void {
  const start = context.sourceCode.getLocFromIndex(0);
  context.report({ loc: { start, end: start }, messageId: "noStyle" });
}

/** One file against the style the rule was given. */
function judgeFile(context: HeadingCaseContext, deps: HeadingCaseDeps): void {
  const style = styleOf(context.options);
  if (style === null) {
    reportNoStyle(context);
    return;
  }
  const sc = context.sourceCode;
  const src = sc.raw ?? sc.text;
  judgeHeadingCase(deps.latex.headings(src), style, src).forEach((f) => {
    report(context, f);
  });
}

/** The rule: its schema takes `style`, and nothing else. */
export const headingCaseRule = (deps: HeadingCaseDeps): HeadingCaseRule => ({
  meta: META,
  create: (context) => ({
    root: () => {
      judgeFile(context, deps);
    },
  }),
});
