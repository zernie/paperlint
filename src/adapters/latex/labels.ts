/**
 * The `\label`s of a source's running text, each with what it takes its number from — for the rule
 * that a label after a bold run-in heading prints the ENCLOSING section's number (#447).
 *
 * TeX's `\label` records the number of the last `\refstepcounter`. A numbered heading, a caption and
 * a numbered environment step one; a bold phrase that opens a paragraph (`\textbf{RQ2.}`) does not,
 * and neither does a starred heading or a heading deeper than the class numbers (`secnumdepth`). So
 * the walk goes through the body's top-level nodes in order and keeps, for the paragraph it is in,
 * the last thing a label would take its number from, and the last numbered heading.
 *
 * Only the running text is read: a label inside an environment (a float, a list, an equation) takes
 * that environment's number or its own, and is not listed. What counts as a run-in heading is the
 * prose reader's own (`isRunInHeading`): a bold, italic, small-caps or underlined phrase ending in
 * `.` or `:` that opens a paragraph.
 */
import type {
  DocumentClass,
  EnclosingHeading,
  HeadingLevel,
  LabelAnchor,
  PlacedLabel,
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
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";
import { isRunInHeading, keepsOpening } from "./prose.ts";

/** Each heading's depth, as `\@startsection` compares it with `secnumdepth`. */
const DEPTHS: ReadonlyMap<string, readonly [HeadingLevel, number]> = new Map([
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
 * not at all, the rest (article, acmart, …) to `\subsubsection`. Read from the classes' own
 * `\setcounter{secnumdepth}` (IEEEtran.cls, llncs.cls, acmart.dtx, 2026-11-09).
 */
function classDepth(c: DocumentClass): number {
  const has = (o: string): boolean => c.options.includes(o);
  if (c.cls === "llncs") return 2;
  if (c.cls === "acmart") return has("acmcp") ? -1 : 3;
  if (c.cls !== "IEEEtran") return 3;
  return has("technote") || (has("compsoc") && has("conference")) ? 3 : 4;
}

/** What one `\setcounter` says of the depth: nothing (another counter), a number, or not a number. */
type DepthSet =
  | { readonly kind: "other" }
  | { readonly kind: "set"; readonly depth: number | null };

/** The value a `\setcounter{secnumdepth}{…}` sets: null when it is not a plain number (`\maxdimen`). */
function depthSet(m: Macro): DepthSet {
  const [counter = "", value = ""] = mandatory(m).map((a) =>
    textOf(a.content).trim(),
  );
  if (counter !== "secnumdepth") return { kind: "other" };
  const n = value === "" ? Number.NaN : Number(value);
  return { kind: "set", depth: Number.isInteger(n) ? n : null };
}

/**
 * How deep the source's headings are numbered: its last `\setcounter{secnumdepth}`, else its class's
 * default; null when it cannot be read (a value that is no plain number, no class line, or several
 * behind a switch).
 */
function secnumdepth(t: ParsedTex, nodes: readonly Node[]): number | null {
  const set = nodes
    .flatMap((n) =>
      n.type === "macro" && n.content === "setcounter" ? [depthSet(n)] : [],
    )
    .filter((d) => d.kind === "set")
    .at(-1);
  if (set !== undefined) return set.depth;
  const line = documentClassOf(t);
  return line.kind === "class" ? classDepth(line) : null;
}

/** Whether a heading macro is starred: unified-latex gives the star as its first argument. */
const isStarred = (m: Macro): boolean =>
  textOf(argumentsOf(m).at(0)?.content) === "*";

/** What the walk keeps between nodes: whether a paragraph is opening, its anchor, the section. */
interface Scan {
  readonly opening: boolean;
  readonly anchor: LabelAnchor;
  readonly enclosing: EnclosingHeading | null;
  readonly labels: readonly PlacedLabel[];
}

const NONE: LabelAnchor = { kind: "none" };
const NUMBERED: LabelAnchor = { kind: "numbered" };

/** A `\label` as one of the running text's, with the anchor and section it stands under. */
const placed = (
  m: Macro,
  anchor: LabelAnchor,
  enclosing: EnclosingHeading | null,
): readonly PlacedLabel[] =>
  inPlace(macroPlace(m), (span) => [
    {
      key: textOf(mandatory(m).at(0)?.content).trim(),
      span,
      anchor,
      enclosing,
    },
  ]);

const isLabel = (n: Node): n is Macro =>
  n.type === "macro" && n.content === "label";

/** The labels a node holds anywhere inside it (`\textbf{RQ2.\label{x}}`), comments pruned. */
const labelsInside = (n: Node): readonly Macro[] =>
  visited(n, isUnrendered).filter(isNode).filter(isLabel);

/** The title a heading or a run-in phrase shows, whitespace collapsed. */
const shown = (n: Node): string =>
  n.type === "macro"
    ? collapse(textOf(mandatory(n).at(-1)?.content))
    : collapse(textOf([n]));

/** One heading's step: a numbered one anchors and encloses what follows, any other is a run-in. */
function headingStep(
  s: Scan,
  m: Macro,
  [level, depth]: readonly [HeadingLevel, number],
  numberedTo: number | null,
): Scan {
  const numbered =
    !isStarred(m) && (numberedTo === null || depth <= numberedTo);
  return numbered
    ? {
        ...s,
        opening: true,
        anchor: NUMBERED,
        enclosing: { level, title: shown(m) },
      }
    : { ...s, opening: true, anchor: { kind: "run-in", title: shown(m) } };
}

/** A macro's step: a label is placed, a heading anchors, a command that steps a counter numbers. */
function macroStep(s: Scan, m: Macro, numberedTo: number | null): Scan | null {
  if (m.content === "label")
    return { ...s, labels: [...s.labels, ...placed(m, s.anchor, s.enclosing)] };
  const heading = DEPTHS.get(m.content);
  if (heading !== undefined) return headingStep(s, m, heading, numberedTo);
  return STEPS_COUNTER.has(m.content)
    ? { ...s, opening: false, anchor: NUMBERED }
    : null;
}

/** The walk's step over one top-level node. */
function step(t: ParsedTex, numberedTo: number | null, s: Scan, n: Node): Scan {
  if (n.type === "parbreak") return { ...s, opening: true, anchor: NONE };
  if (s.opening && isRunInHeading(t, n)) {
    const anchor: LabelAnchor = { kind: "run-in", title: shown(n) };
    const inside = labelsInside(n).flatMap((m) =>
      placed(m, anchor, s.enclosing),
    );
    return { ...s, opening: false, anchor, labels: [...s.labels, ...inside] };
  }
  const own = n.type === "macro" ? macroStep(s, n, numberedTo) : null;
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
  const preamble = visited(
    t.root,
    (v, parent) => isUnrendered(v, parent) || isDefinition(v),
  ).filter(isNode);
  const numberedTo = secnumdepth(t, preamble);
  const start: Scan = {
    opening: true,
    anchor: NONE,
    enclosing: null,
    labels: [],
  };
  return body
    .filter((n) => !isDefinition(n))
    .reduce((s, n) => step(t, numberedTo, s, n), start).labels;
}
