/**
 * What a paper's LaTeX source says, in the paper's vocabulary — its document class, its sections,
 * the text a reader sees — as values. No parser here: the LaTeX adapter (`src/adapters/latex/`)
 * produces these, and the rules and `paperlint new` read them through the `LatexReader` port.
 */

/** A span of the source: `[start, end)` offsets. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Where something stands in the source, or that the parser gave it no position. */
export type Place =
  { readonly kind: "at"; readonly span: Span } | { readonly kind: "unplaced" };

/** Whitespace collapsed to single spaces and trimmed — how a title or a class name is compared. */
export const collapse = (s: string): string =>
  s.split(/\s+/u).filter(Boolean).join(" ");

/** A LaTeX document class and the options it is loaded with, in source order. */
export interface DocumentClass {
  readonly cls: string;
  readonly options: readonly string[];
}

/** A paper's `\documentclass`: none, one that names no class, or a class with its options. */
export type ClassLine =
  | { readonly kind: "missing" }
  | { readonly kind: "empty"; readonly place: Place }
  | ({ readonly kind: "class"; readonly place: Place } & DocumentClass);

/** The options of `want` that `got` does not carry — every one, in `want`'s order. */
export const missingOptions = (
  got: DocumentClass,
  want: DocumentClass,
): readonly string[] => want.options.filter((o) => !got.options.includes(o));

/**
 * The class a paper should have to satisfy a venue's `want`, or null when it already does. Another
 * class becomes `want`; the same class keeps the paper's options and gains the ones it lacks.
 */
export function venueClass(
  have: DocumentClass,
  want: DocumentClass,
): DocumentClass | null {
  if (have.cls !== want.cls) return want;
  const missing = missingOptions(have, want);
  return missing.length === 0
    ? null
    : { cls: have.cls, options: [...have.options, ...missing] };
}

/** A class as a `\documentclass` line, for a message and for the line `paperlint new` writes. */
export const documentClassLine = (d: DocumentClass): string =>
  `\\documentclass${d.options.length > 0 ? `[${d.options.join(",")}]` : ""}{${d.cls}}`;

/** One `\section` or `\section*`, its title's text with whitespace collapsed. */
export interface Heading {
  readonly title: string;
  readonly place: Place;
}

/** The document's sections in source order, where its back matter begins, and where it ends. */
export interface Outline {
  readonly sections: readonly Heading[];
  /** The first `\appendix` or bibliography, or null: sections from here on are not body. */
  readonly backMatter: number | null;
  /** Where `\end{document}` stands, or null when there is no document environment. */
  readonly end: number | null;
}

/** Text a reader sees, copied from one place: `text[i]` stands at source offset `at + i`. */
export interface Segment {
  readonly text: string;
  readonly at: number;
}

/** A run of rendered text: contiguous segments, never empty. */
export interface TextRun {
  readonly segments: readonly [Segment, ...Segment[]];
}

/** The run's text. */
export const runText = (run: TextRun): string =>
  run.segments.map((s) => s.text).join("");

/** The source offset of the `i`-th character of the text these segments make, or null outside it. */
function offsetIn(segments: readonly Segment[], i: number): number | null {
  const [s, ...rest] = segments;
  if (s === undefined || i < 0) return null;
  return i < s.text.length ? s.at + i : offsetIn(rest, i - s.text.length);
}

/**
 * The source span of `runText(run).slice(from, to)`: from its first character to past its last.
 * Null when the range is empty or reaches outside the run — never an invented position.
 */
export function spanIn(run: TextRun, from: number, to: number): Span | null {
  const start = offsetIn(run.segments, from);
  const last = to > from ? offsetIn(run.segments, to - 1) : null;
  return start === null || last === null ? null : { start, end: last + 1 };
}
