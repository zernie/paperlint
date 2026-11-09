/**
 * The `\label`s of a source's running text, each with what it takes its number from and the step
 * of the counter it records — for the rule that one reference list must not print a number twice
 * (#447), as it does when a label after a bold run-in heading takes the section's number.
 *
 * TeX's `\label` records the number of the last `\refstepcounter`. A numbered heading, a caption and
 * a numbered environment step one; a bold phrase that opens a paragraph (`\textbf{RQ2.}`) does not,
 * and neither does a starred heading or a heading deeper than the class numbers (`secnumdepth`). So
 * the walk goes through the body's top-level nodes in order and keeps, for the paragraph it is in,
 * the last thing a label would take its number from, and the last step of a counter (its start).
 *
 * Only the running text is placed: a label inside an environment (a float, a list, an equation) takes
 * that environment's number or its own, and is not listed. What counts as a run-in heading is the
 * prose reader's own (`isRunInHeading`): a bold, italic, small-caps or underlined phrase ending in
 * `.` or `:` that opens a paragraph.
 */
import type {
  DocumentClass,
  LabelAnchor,
  PlacedLabel,
  Stepped,
} from "../../domain/tex-document.ts";
import { documentClassOf } from "./document-class.ts";
import { isDefinition, isUnrendered } from "./hidden.ts";
import {
  argumentsOf,
  collapse,
  inPlace,
  isNode,
  macroPlace,
  mandatory,
  placeOf,
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";
import { isRunInHeading, keepsOpening } from "./prose.ts";

/**
 * Each heading's depth, as `\@startsection` compares it with `secnumdepth`. `\part` and `\chapter`
 * are the levels above `\section` (book and report: part -1, chapter 0): a numbered one steps a
 * counter of its own, so a label after it no longer takes the previous section's number. In a class
 * without `\chapter` the command is undefined and the source does not build.
 */
const DEPTHS: ReadonlyMap<string, readonly [string, number]> = new Map([
  ["part", ["part", -1]],
  ["chapter", ["chapter", 0]],
  ["section", ["section", 1]],
  ["subsection", ["subsection", 2]],
  ["subsubsection", ["subsubsection", 3]],
  ["paragraph", ["paragraph", 4]],
  ["subparagraph", ["subparagraph", 5]],
] as const);

/** Commands that step a counter where they stand, so a label right after takes their number. */
const STEPS_COUNTER: ReadonlySet<string> = new Set([
  "caption",
  "captionof",
  "refstepcounter",
  "item",
]);

/**
 * How deep a class numbers its headings when the source does not say: IEEEtran to `\paragraph`
 * except a technote or a compsoc conference paper, llncs to `\subsection`, acmart's `acmcp` format
 * not at all, book and report to `\subsection`, the rest (article, acmart, …) to `\subsubsection`.
 * Read from the classes' own `\setcounter{secnumdepth}` (IEEEtran.cls, llncs.cls, acmart.dtx,
 * 2026-11-09). TeX Live 2026 base: book.cls line 268 and report.cls line 262 are
 * `\setcounter{secnumdepth}{2}`, article.cls line 255 is `\setcounter{secnumdepth}{3}`.
 */
function classDepth(c: DocumentClass): number {
  const has = (o: string): boolean => c.options.includes(o);
  if (c.cls === "llncs" || c.cls === "book" || c.cls === "report") return 2;
  if (c.cls === "acmart") return has("acmcp") ? -1 : 3;
  if (c.cls !== "IEEEtran") return 3;
  return has("technote") || (has("compsoc") && has("conference")) ? 3 : 4;
}

/** One change of `secnumdepth` in the source: set to a value, or added to, a number or not (`\\maxdimen`, `\\value{x}`). */
type DepthOp =
  | { readonly kind: "set"; readonly to: number | null }
  | { readonly kind: "add"; readonly by: number | null };

/** The depth the walk holds: a number, null (no class line: headings are taken as numbered), or unknown. */
type Depth = number | null | "unknown";

/** A plain integer, or null for anything else (a macro, `\\value{x}`, an empty argument). */
const integerOf = (text: string): number | null => {
  const n = text === "" ? Number.NaN : Number(text);
  return Number.isInteger(n) ? n : null;
};

/** The `\setcounter` and `\addtocounter` changes of `secnumdepth` a node holds, in source order. */
const depthOps = (n: Node): readonly DepthOp[] =>
  visited(n, (v, parent) => isUnrendered(v, parent) || isDefinition(v))
    .filter(isNode)
    .flatMap((m): readonly DepthOp[] => {
      if (
        m.type !== "macro" ||
        (m.content !== "setcounter" && m.content !== "addtocounter")
      )
        return [];
      const [counter = "", value = ""] = mandatory(m).map((a) =>
        textOf(a.content).trim(),
      );
      if (counter !== "secnumdepth") return [];
      return m.content === "setcounter"
        ? [{ kind: "set", to: integerOf(value) }]
        : [{ kind: "add", by: integerOf(value) }];
    });

/** The depth after one change: a value that cannot be evaluated, or added to one that is not a number, is unknown. */
const applied = (depth: Depth, op: DepthOp): Depth => {
  if (op.kind === "set") return op.to ?? "unknown";
  return typeof depth === "number" && op.by !== null
    ? depth + op.by
    : "unknown";
};

/**
 * How deep the headings are numbered where the body starts: the class's default, changed by the
 * preamble's `\setcounter` and `\addtocounter` of `secnumdepth` in order; null when there is no
 * class line (several behind a switch), unknown after a change that cannot be evaluated. The body
 * changes it from there, in document order (`step`).
 */
function secnumdepth(t: ParsedTex, nodes: readonly Node[]): Depth {
  const line = documentClassOf(t);
  const start = line.kind === "class" ? classDepth(line) : null;
  return nodes.flatMap(depthOps).reduce<Depth>(applied, start);
}

/** Whether a heading macro is starred: unified-latex gives the star as its first argument. */
const isStarred = (m: Macro): boolean =>
  textOf(argumentsOf(m).at(0)?.content) === "*";

/** What the walk keeps between nodes: whether a paragraph is opening, its anchor, the last counter stepped. */
interface Scan {
  readonly opening: boolean;
  readonly anchor: LabelAnchor;
  readonly stepped: Stepped | null;
  readonly numberedTo: Depth;
  readonly labels: readonly PlacedLabel[];
}

const NONE: LabelAnchor = { kind: "none" };
const NUMBERED: LabelAnchor = { kind: "numbered" };

/** A step of a counter by `m`, named `what`, where the parser put it (or that it gave no position). */
const steppedBy = (m: Macro, what: string): Stepped => ({
  at: placeOf(m),
  what,
});

/**
 * A `\label` as one of the running text's, with its anchor and the step it takes its number from:
 * the last one in TeX's order when something in its paragraph anchors it, unknown when nothing does.
 */
const placed = (
  m: Macro,
  s: Scan,
  anchor: LabelAnchor,
): readonly PlacedLabel[] =>
  inPlace(macroPlace(m), (span) => [
    {
      key: textOf(mandatory(m).at(0)?.content).trim(),
      span,
      anchor,
      takes: anchor.kind === "none" ? null : s.stepped,
    },
  ]);

const isLabel = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "label";

/** Every `\label` key of the source, environments included, comments and macro definitions pruned. */
export const labelKeysOf = (t: ParsedTex): readonly string[] =>
  visited(t.root, (v, parent) => isUnrendered(v, parent) || isDefinition(v))
    .filter(isNode)
    .filter(isLabel)
    .map((m) => textOf(mandatory(m).at(0)?.content).trim());

/** The labels a node holds anywhere inside it (`\textbf{RQ2.\label{x}}`), comments pruned. */
const labelsInside = (n: Node): readonly Macro[] =>
  visited(n, isUnrendered).filter(isNode).filter(isLabel);

/** The title a heading or a run-in phrase shows, whitespace collapsed. */
const shown = (n: Node): string =>
  n.type === "macro"
    ? collapse(textOf(mandatory(n).at(-1)?.content))
    : collapse(textOf([n]));

/** The step after a counter the walk cannot model changed: unknown, so no label of it is judged. */
const UNKNOWN: Stepped = {
  at: { kind: "unplaced" },
  what: "a counter changed by a command the rule does not model",
};

/** The walk after a heading: numbered (its step), a run-in, or numbered at a depth that is unknown (an unknown step). */
function headingState(s: Scan, m: Macro, level: string, depth: number): Scan {
  const run: Scan = {
    ...s,
    opening: true,
    anchor: { kind: "run-in", title: shown(m) },
  };
  if (isStarred(m)) return run;
  const to = s.numberedTo;
  if (to === "unknown")
    return { ...s, opening: true, anchor: NUMBERED, stepped: UNKNOWN };
  return to === null || depth <= to
    ? {
        ...s,
        opening: true,
        anchor: NUMBERED,
        stepped: steppedBy(m, `\\${level} «${shown(m)}»`),
      }
    : run;
}

/** One heading's step: a numbered one anchors and encloses what follows, any other is a run-in. */
function headingStep(
  s: Scan,
  m: Macro,
  [level, depth]: readonly [string, number],
): Scan {
  const next = headingState(s, m, level, depth);
  // A label in the title (`\section{A\label{a}}`) takes the step the heading itself makes.
  const inside = labelsInside(m).flatMap((l) => placed(l, next, next.anchor));
  return { ...next, labels: [...s.labels, ...inside] };
}

/** A macro's step: a label is placed, a heading anchors, a command that steps a counter numbers. */
function macroStep(s: Scan, m: Macro): Scan | null {
  if (m.content === "label")
    return { ...s, labels: [...s.labels, ...placed(m, s, s.anchor)] };
  const heading = DEPTHS.get(m.content);
  if (heading !== undefined) return headingStep(s, m, heading);
  return STEPS_COUNTER.has(m.content)
    ? {
        ...s,
        opening: false,
        anchor: NUMBERED,
        stepped: steppedBy(m, `\\${m.content}`),
      }
    : null;
}

/** The walk with the depth changes a node holds applied: the last one wins from here on. */
const withDepth = (s: Scan, n: Node): Scan =>
  depthOps(n).reduce<Scan>(
    (w, op) => ({ ...w, numberedTo: applied(w.numberedTo, op) }),
    s,
  );

/** Commands that reset or step a counter in a way the walk does not model: `\appendix` restarts the section counter in letters. */
const UNMODELLED: ReadonlySet<string> = new Set([
  "appendix",
  "appendices",
  "stepcounter",
  "setcounter",
  "addtocounter",
]);

/** Whether a node is a command (or the `appendices` environment) that changes a counter the walk cannot follow. */
const changesCounter = (v: Node): boolean =>
  v.type === "environment"
    ? v.env === "appendices"
    : v.type === "macro" &&
      UNMODELLED.has(v.content) &&
      !(
        (v.content === "setcounter" || v.content === "addtocounter") &&
        textOf(mandatory(v).at(0)?.content).trim() === "secnumdepth"
      );

/**
 * Whether a node changes a counter the walk cannot model: one of those commands, anywhere inside it,
 * or a `\refstepcounter` inside something else (a group hides which step a label after it takes).
 */
const hidesStep = (n: Node): boolean =>
  visited(n, (v, parent) => isUnrendered(v, parent) || isDefinition(v))
    .filter(isNode)
    .some(
      (v) =>
        changesCounter(v) ||
        (v !== n && v.type === "macro" && v.content === "refstepcounter"),
    );

/** The walk's step over one top-level node: what it does, then what its counter commands make unknown. */
function step(t: ParsedTex, before: Scan, n: Node): Scan {
  const after = stepOnce(t, before, n);
  return hidesStep(n) ? { ...after, stepped: UNKNOWN } : after;
}

function stepOnce(t: ParsedTex, before: Scan, n: Node): Scan {
  const s = withDepth(before, n);
  if (n.type === "parbreak") return { ...s, opening: true, anchor: NONE };
  if (s.opening && isRunInHeading(t, n)) {
    const anchor: LabelAnchor = { kind: "run-in", title: shown(n) };
    const inside = labelsInside(n).flatMap((m) => placed(m, s, anchor));
    return { ...s, opening: false, anchor, labels: [...s.labels, ...inside] };
  }
  const own = n.type === "macro" ? macroStep(s, n) : null;
  if (own !== null) return own;
  if (keepsOpening(n)) return s;
  if (n.type === "environment" || n.type === "mathenv")
    return { ...s, opening: false, anchor: NONE };
  return { ...s, opening: false };
}

const isDocument = (n: Node): boolean =>
  n.type === "environment" && n.env === "document";

/**
 * Every `\label` of the body's running text, in document order: the `document` environment's
 * top-level nodes, or the whole source when it has none (a fragment). A comment and a macro
 * definition are no part of it.
 */
export function labelsOf(t: ParsedTex): readonly PlacedLabel[] {
  const doc = t.root.content.find(isDocument);
  const body =
    doc !== undefined && doc.type === "environment"
      ? doc.content
      : t.root.content;
  // What the preamble sets; a fragment has none, its changes come in the body's order.
  const preamble =
    doc === undefined ? [] : t.root.content.filter((n) => n !== doc);
  const start: Scan = {
    opening: true,
    anchor: NONE,
    stepped: null,
    numberedTo: secnumdepth(t, preamble),
    labels: [],
  };
  return body
    .filter((n) => !isDefinition(n))
    .reduce((s, n) => step(t, s, n), start).labels;
}
