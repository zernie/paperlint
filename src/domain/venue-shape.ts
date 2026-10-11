/**
 * THE SHAPE OF A PAPER, as a reviewer sees it before reading a sentence: how many words stand before
 * the references, how many figures and tables, how long the abstract is, how many references. It is
 * counted on the TEXT OF THE FINISHED PDF (pdf.js's page texts, `pages_text` in the facts file), the
 * same way for the paper and for the venue's accepted papers it is compared with — so the two
 * numbers come from one counter, never from a figure someone else measured differently.
 *
 *   body_words      tokens holding a letter, from the first page to the references heading: the
 *                   title, the abstract, captions and table cells included; numbers and line
 *                   numbers not. The heading is the first «References»/«Bibliography» line followed
 *                   by an entry opening «[1]», else the last such line. None ⇒ null.
 *   figures         distinct numbers of captions «Figure N:» / «Fig. N.»: opening a line, or glued
 *                   to the text drawn inside the figure just before it. A caption set inside an
 *                   image is not text, and is missed.
 *   tables          distinct numbers of lines opening «TABLE IV» / «Table 2» (IEEEtran sets the
 *                   label on a line of its own, so no punctuation is required after it).
 *   abstract_words  tokens holding a letter after an «Abstract» heading (a line of its own, or
 *                   «Abstract—» run into the text) up to the first line reading «Index Terms»,
 *                   «Keywords», «CCS Concepts», «ACM Reference Format» or the introduction's heading,
 *                   on the first two pages. No heading, or no end there ⇒ null.
 *   references      the highest «[N]» opening a line after the references heading: the entry count
 *                   of a numbered bibliography. Author-year styles have none ⇒ null.
 *
 * A null is "not counted", and is said as such by whoever reads it; zero is a count.
 *
 * ── THE JUDGEMENT ───────────────────────────────────────────────────────────────────────────
 * Against the venue's measured papers, each measure is two-sided: outside the interquartile range
 * (below the lower quartile, above the upper), and for the abstract outside median ÷ factor …
 * median × factor (issue #170: «Report when the count exceeds factor × median», factor 1.5). A
 * quarter of the accepted papers lie past each quartile by construction, so a finding is a difference
 * to weigh, never a requirement — the rule that reads this warns and fixes nothing.
 */
import { isReferencesHeading } from "./body-pages.ts";

/** What the counter measures, in the order findings are reported. */
export const SHAPE_MEASURES = [
  "body_words",
  "figures",
  "tables",
  "abstract_words",
  "references",
] as const;
export type ShapeMeasure = (typeof SHAPE_MEASURES)[number];

/** One PDF's measures; null where the counter could not read one. */
export type Shape = Readonly<Record<ShapeMeasure, number | null>>;

/** A line with its spaces removed: what pdf.js's split small capitals («R EFERENCES») read as. */
const squeezed = (line: string): string =>
  line.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();

/** Tokens holding a letter. */
const wordsIn = (lines: readonly string[]): number =>
  lines.flatMap((l) => l.split(/\s+/u)).filter((t) => /\p{L}/u.test(t)).length;

const FIRST_ENTRY = /^\s*\[\s*1\s*\]/u;

/** The line the references start at: the heading followed by [1], else the last heading; -1. */
function referencesStart(lines: readonly string[]): number {
  const heads = lines.flatMap((l, i) => (isReferencesHeading(l) ? [i] : []));
  const next = (i: number): string =>
    lines.slice(i + 1).find((l) => l.trim() !== "") ?? "";
  return heads.find((i) => FIRST_ENTRY.test(next(i))) ?? heads.at(-1) ?? -1;
}

// At the start of a line, or glued to the text before it: pdf.js runs the words drawn INSIDE a
// figure (axis labels, legends) into its caption with no line break — «…CorrectionFig. 8: …», measured
// on MSR 2025 preprints, where the line-start form alone found 4 of 8 captions. A reference in a
// sentence has a space before it, and is never a caption.
const FIGURE = String.raw`(?:^\s*|(?<=\S))(?:Figure|Fig\.)\s*(\d+)\s*[:.|]`;
const TABLE = String.raw`^\s*(?:TABLE|Table)\s+([IVXL]+|\d+)(?![\p{L}\p{N}])`;

/** How many distinct labels the pattern (its source) captures across the lines. */
const distinctLabels = (lines: readonly string[], pattern: string): number =>
  new Set(
    lines.flatMap((l) =>
      [...l.matchAll(new RegExp(pattern, "gu"))].flatMap((m) =>
        m.slice(1, 2).map((label) => label.toUpperCase()),
      ),
    ),
  ).size;

const isAbstractHeading = (line: string): boolean =>
  squeezed(line) === "abstract" || /^\s*abstract\s*[—–\-:.]/iu.test(line);
const ABSTRACT_END =
  /^(?:indexterms|keywords|ccsconcepts|acmreferenceformat|(?:(?:1|i)\.?)?introduction$)/u;
const ABSTRACT_WORD = /^\s*a\s*b\s*s\s*t\s*r\s*a\s*c\s*t\s*[—–\-:.]*/iu;

/** Words of the abstract on the first two pages, or null when its heading or its end is not there. */
function abstractWords(firstPages: readonly string[]): number | null {
  const head = firstPages.findIndex(isAbstractHeading);
  if (head < 0) return null;
  const rest = firstPages.slice(head + 1);
  const end = rest.findIndex((l) => ABSTRACT_END.test(squeezed(l)));
  if (end < 0) return null;
  return wordsIn(
    firstPages
      .slice(head, head + 1 + end)
      .map((l, i) => (i === 0 ? l.replace(ABSTRACT_WORD, "") : l)),
  );
}

/** The highest «[N]» opening a line, or null when none does. */
function lastEntry(lines: readonly string[]): number | null {
  const numbers = lines.flatMap((l) => {
    const m = /^\s*\[\s*(\d{1,4})\s*\]/u.exec(l);
    return m?.[1] === undefined ? [] : [Number(m[1])];
  });
  return numbers.length === 0 ? null : Math.max(...numbers);
}

const linesOf = (pages: readonly string[]): readonly string[] =>
  pages.flatMap((p) => p.split("\n"));

/** What a finished PDF's page texts measure. Pure. */
export function shapeOf(pages: readonly string[]): Shape {
  const lines = linesOf(pages);
  const start = referencesStart(lines);
  return {
    body_words: start < 0 ? null : wordsIn(lines.slice(0, start)),
    figures: distinctLabels(lines, FIGURE),
    tables: distinctLabels(lines, TABLE),
    abstract_words: abstractWords(linesOf(pages.slice(0, 2))),
    references: start < 0 ? null : lastEntry(lines.slice(start + 1)),
  };
}

// ── the venue's measured papers ─────────────────────────────────────────────────────────────

/** Five numbers and a count: how one measure spreads over the venue's papers. */
export interface Distribution {
  readonly n: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}

/**
 * The quartiles by linear interpolation between order statistics (Hyndman–Fan type 7: R's and
 * NumPy's default), or null for no values. Pure.
 */
export function distributionOf(values: readonly number[]): Distribution | null {
  const s = values.toSorted((a, b) => a - b);
  const at = (p: number): number => {
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    // The order statistic at `lo` and the next one (itself at the top): the list is sorted.
    const pair = s.slice(lo, lo + 2);
    const a = Math.min(...pair);
    const b = Math.max(...pair);
    return a + (h - lo) * (b - a);
  };
  return s.length === 0
    ? null
    : {
        n: s.length,
        min: at(0),
        q1: at(0.25),
        median: at(0.5),
        q3: at(0.75),
        max: at(1),
      };
}

/** One accepted paper, as the venue's preset records it. */
export interface ShapePaper {
  readonly paper: string;
  readonly url: string;
  readonly pages: number;
  readonly shape: Shape;
}

/** A venue preset's `shape`: what was measured, where it came from, and when. */
export interface VenueShape {
  readonly source: string;
  readonly url: string;
  /** The day the papers were measured, YYYY-MM-DD. */
  readonly measured: string;
  readonly papers: readonly ShapePaper[];
}

/** Fewer venue papers than this carry a measure, and it is not judged: quartiles of a handful say nothing. */
export const MIN_PAPERS = 8;
export const DEFAULT_ABSTRACT_FACTOR = 1.5;

export interface ShapeOptions {
  readonly measures: readonly ShapeMeasure[];
  readonly abstractFactor: number;
}

/** What the judgement finds, per measure. */
export type ShapeFinding =
  | {
      readonly kind: "outside";
      readonly measure: ShapeMeasure;
      readonly side: "below" | "above";
      readonly got: number;
      /** The value it is past. */
      readonly fence: number;
      /** `quartile`: the fence is a quartile; `factor`: the median divided or multiplied by the factor. */
      readonly bound: "quartile" | "factor";
      readonly dist: Distribution;
    }
  | { readonly kind: "unmeasured"; readonly measure: ShapeMeasure }
  | {
      readonly kind: "thin";
      readonly measure: ShapeMeasure;
      readonly n: number;
    };

/** The two fences: the quartiles, or the median divided and multiplied by `factor`. */
const fencesOf = (
  d: Distribution,
  factor: number | null,
): Readonly<Record<"below" | "above", number>> =>
  factor === null
    ? { below: d.q1, above: d.q3 }
    : { below: d.median / factor, above: d.median * factor };

/** One measure of the paper against the venue's papers. */
function judgeOne(
  measure: ShapeMeasure,
  got: number | null,
  venue: VenueShape,
  factor: number,
): readonly ShapeFinding[] {
  const values = venue.papers.flatMap((p) => p.shape[measure] ?? []);
  const dist = distributionOf(values);
  if (dist === null || dist.n < MIN_PAPERS)
    return [{ kind: "thin", measure, n: values.length }];
  if (got === null) return [{ kind: "unmeasured", measure }];
  const byFactor = measure === "abstract_words";
  const fences = fencesOf(dist, byFactor ? factor : null);
  const side =
    got < fences.below ? "below" : got > fences.above ? "above" : null;
  return side === null
    ? []
    : [
        {
          kind: "outside",
          measure,
          side,
          got,
          fence: fences[side],
          bound: byFactor ? "factor" : "quartile",
          dist,
        },
      ];
}

/** The paper's measures against the venue's, in `SHAPE_MEASURES` order. Pure. */
export function judgeShape(
  paper: Shape,
  venue: VenueShape,
  o: ShapeOptions,
): readonly ShapeFinding[] {
  return SHAPE_MEASURES.filter((m) => o.measures.includes(m)).flatMap((m) =>
    judgeOne(m, paper[m], venue, o.abstractFactor),
  );
}
