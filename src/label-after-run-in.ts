/**
 * `tex/label-after-run-in` — a `\label` placed after a bold run-in heading (`\textbf{RQ2.}`), or
 * after a heading that steps no counter, takes the ENCLOSING section's number: `\ref` then prints
 * that number, and a list of references reads "Sections V-A, V-A and V-B" (#447). Every label is
 * defined once, so TeX warns about nothing.
 *
 * WHAT IT READS: the source alone, no build — `paper.tex` with its includes spliced (`readPaper`),
 * through the `LatexReader` port, whose `labels` says what each label of the running text takes
 * its number from. A finding in an included file is reported at its include, the file named.
 */
import type { EnclosingHeading, PlacedLabel } from "./domain/tex-document.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

const MESSAGES = {
  runIn:
    "\\label{{{key}}} follows «{{heading}}», which steps no counter, so \\ref{{{key}}} prints {{prints}}. Put the label on a numbered heading, a caption or a numbered environment, or refer to this place in words",
};

/** What a reference to a run-in's label prints: the enclosing heading's number. */
const prints = (h: EnclosingHeading | null): string =>
  h === null
    ? "the number of whatever was numbered last before it"
    : `the number of the enclosing \\${h.level} «${h.title}»`;

/** The labels that take a run-in's place, as findings at each label. Pure. */
export const strayLabels = (
  labels: readonly PlacedLabel[],
): readonly Located[] =>
  labels.flatMap((l) =>
    l.anchor.kind === "run-in"
      ? [
          {
            messageId: "runIn",
            data: {
              key: l.key,
              heading: l.anchor.title,
              prints: prints(l.enclosing),
            },
            at: l.span,
          },
        ]
      : [],
  );

export const labelAfterRunInRule = (deps: ProseDeps): TexRuleModule => ({
  meta: {
    type: "problem",
    docs: {
      description:
        "a \\label after a bold run-in heading (`\\textbf{RQ2.}`) or an unnumbered heading takes the enclosing section's number, so \\ref prints that number",
      url: ruleDocsUrl("label-after-run-in"),
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
        reportInPaper(
          context,
          MESSAGES,
          paper,
          strayLabels(deps.latex.labels(paper.text)),
        );
      },
    };
  },
});
