/**
 * `tex/ref-list-same-number` — one reference list that prints the same number twice for two
 * different labels: `Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}` printing
 * "II-A, II-A and II-B" (#447). It happens when a `\label` stands after a bold run-in heading
 * (`\textbf{Merged history.}\label{sec:rq2}`): the run-in steps no counter, so the label takes the
 * number of the last thing that did. Every label is defined once, so TeX warns about nothing.
 *
 * WHAT IT READS: the source alone, no build — `paper.tex` with its includes spliced (`readPaper`),
 * through the `LatexReader` port: `labels` says which step of which counter each label of the
 * running text takes its number from, `refLists` where two or more references share a sentence. Two
 * different keys of one list that take the number of the same step print the same number. A label
 * whose step is unknown (it stands in no paragraph that anchors it, or is defined twice) is never
 * judged: unknown is not the same. A finding in an included file is reported at its include.
 */
import type {
  PlacedLabel,
  RefList,
  Reference,
  Stepped,
} from "./domain/tex-document.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

const MESSAGES = {
  runIn:
    "{{first}} and {{second}} print the same number: {{key}} follows «{{title}}», which steps no counter, so it takes the number of {{what}}",
  sameStep:
    "{{first}} and {{second}} print the same number: both labels take the number of {{what}}",
};

/** A label that stands in a paragraph that anchors it, with the step whose number it records. */
interface Known {
  readonly label: PlacedLabel;
  readonly step: Stepped;
}

/** The labels whose step is known, by key; a key defined twice has none. */
const knownByKey = (
  labels: readonly PlacedLabel[],
): ReadonlyMap<string, Known> =>
  new Map(
    labels.flatMap((label) =>
      label.takes !== null &&
      labels.filter((o) => o.key === label.key).length === 1
        ? [[label.key, { label, step: label.takes }] as const]
        : [],
    ),
  );

/** Where a step stands, as a number two labels can share; unknown when the parser gave no place. */
const identity = (k: Known): number | null =>
  k.step.at.kind === "at" ? k.step.at.span.start : null;

/** A reference as it is written: `\ref{sec:check}`. */
const written = (r: Reference): string => `\\${r.macro}{${r.key}}`;

/** The finding for a reference that prints the number of an earlier one of another key. */
function finding(
  r: Reference,
  earlier: Reference,
  labels: readonly [PlacedLabel, PlacedLabel],
  step: Stepped,
): Located {
  const first = written(earlier);
  const second = written(r);
  const runIn = labels.find((l) => l.anchor.kind === "run-in");
  return runIn?.anchor.kind === "run-in"
    ? {
        messageId: "runIn",
        data: {
          first,
          second,
          key: runIn.key,
          title: runIn.anchor.title,
          what: step.what,
        },
        at: r.span,
      }
    : {
        messageId: "sameStep",
        data: { first, second, what: step.what },
        at: r.span,
      };
}

/**
 * The references that print what an earlier reference of the same list, with another key, printed —
 * one finding for each key's first reference in the list, at that reference. Pure.
 */
export const sameNumbers = (
  lists: readonly RefList[],
  labels: readonly PlacedLabel[],
): readonly Located[] => {
  const known = knownByKey(labels);
  return lists.flatMap((list) =>
    list.flatMap((r, i) => {
      const mine = known.get(r.key);
      const id = mine === undefined ? null : identity(mine);
      const before = list.slice(0, i);
      if (mine === undefined || id === null) return [];
      if (before.some((b) => b.key === r.key)) return [];
      const [hit] = before.flatMap((b) => {
        const theirs = known.get(b.key);
        return theirs !== undefined && identity(theirs) === id
          ? [{ earlier: b, theirs }]
          : [];
      });
      return hit === undefined
        ? []
        : [finding(r, hit.earlier, [mine.label, hit.theirs.label], mine.step)];
    }),
  );
};

export const refListSameNumberRule = (deps: ProseDeps): TexRuleModule => ({
  meta: {
    type: "problem",
    docs: {
      description:
        "one reference list (`Sections~\\ref{a}, \\ref{b}`) prints the same number twice for two different labels, as a label after a bold run-in heading does",
      url: ruleDocsUrl("ref-list-same-number"),
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
          sameNumbers(
            deps.latex.refLists(paper.text),
            deps.latex.labels(paper.text),
          ),
        );
      },
    };
  },
});
