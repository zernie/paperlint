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

/** One `\documentclass` line: one that names no class, or a class with its options. */
export type ClassCandidate =
  | { readonly kind: "empty"; readonly place: Place }
  | ({ readonly kind: "class"; readonly place: Place } & DocumentClass);

/**
 * A paper's `\documentclass`: none, exactly one, or several — a source that picks its class behind
 * a TeX switch (`\if\venue1 \documentclass{article} \fi …`). Which branch builds is not
 * evaluated, so several lines are candidates, in source order, and none of them is THE class.
 */
export type ClassLine =
  | { readonly kind: "missing" }
  | ClassCandidate
  | {
      readonly kind: "ambiguous";
      readonly candidates: readonly [
        ClassCandidate,
        ClassCandidate,
        ...ClassCandidate[],
      ];
    };

/** The options of `want` that `got` does not carry — every one, in `want`'s order. */
export const missingOptions = (
  got: DocumentClass,
  want: DocumentClass,
): readonly string[] => want.options.filter((o) => !got.options.includes(o));

/** What a paper's class line needs to satisfy a venue: nothing, options added, or the venue's line. */
export type ClassChange =
  | { readonly kind: "keep" }
  | { readonly kind: "add"; readonly options: readonly string[] }
  | { readonly kind: "replace"; readonly by: DocumentClass };

/**
 * What a paper's class must change to satisfy a venue's `want`: another class is replaced by `want`;
 * the same class keeps its options and gains the ones it lacks, in `want`'s order. This decides WHAT
 * changes; writing it into a source is the LaTeX adapter's.
 */
export function venueClass(
  have: DocumentClass,
  want: DocumentClass,
): ClassChange {
  if (have.cls !== want.cls) return { kind: "replace", by: want };
  const missing = missingOptions(have, want);
  return missing.length === 0
    ? { kind: "keep" }
    : { kind: "add", options: missing };
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

/** What a mark in prose says about where a claim comes from: a work outside the paper, or a place in it. */
export type Owner = "citation" | "reference";

/**
 * One piece of body prose, in source order: text a reader sees, a mark the markup leaves in the
 * sentence (a `\cite`, a link, a `\ref`), or math, with its source.
 */
export type ProsePiece =
  | { readonly kind: "text"; readonly segment: Segment }
  | { readonly kind: "owner"; readonly owner: Owner; readonly span: Span }
  | { readonly kind: "math"; readonly tex: string; readonly span: Span };

/** A stretch of body prose no sentence crosses — a paragraph, a list item, a footnote. Never empty. */
export interface Passage {
  readonly pieces: readonly [ProsePiece, ...ProsePiece[]];
}

/** How an emphasised phrase is set: bold, italic (or `\emph`), or underlined. */
export type EmphasisStyle = "bold" | "italic" | "underline";

/**
 * Where an emphasised phrase stands: opening its paragraph or list item — a label, set like a run-in
 * heading even without the full stop (`\item \textbf{A corpus of questions}: …`) — or inside the
 * running text, after other words of its sentence.
 */
export type EmphasisPlace = "opening" | "inline";

/**
 * A phrase set in bold, italics or underline inside the body's running prose — not a heading, a
 * run-in heading, a caption, a float or a table, which are never prose (`LatexReader.bodyProse`).
 * `text` is what it typesets, marks and math left out.
 */
export interface Emphasis {
  readonly style: EmphasisStyle;
  readonly place: EmphasisPlace;
  readonly text: string;
  readonly span: Span;
}

/**
 * A command that changes the page layout a venue's template sets: the text block, the margins,
 * the line spacing, or space pulled back with a negative skip. `command` is how a message names it
 * (`\setlength{\textheight}`, `\vspace{-2mm}`).
 */
export interface LayoutOverride {
  readonly command: string;
  readonly place: Place;
}
