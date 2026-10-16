/**
 * What paperlint needs from a LaTeX source, shaped by its rules and `paperlint new` — not by the
 * parser. The one implementation is `src/adapters/latex/` (unified-latex); `src/cli.ts` wires it.
 */
import type { Include } from "../domain/paper-source.ts";
import type {
  ClassLine,
  DocumentClass,
  Emphasis,
  LayoutOverride,
  Outline,
  Passage,
  Span,
  TextRun,
  TitledHeading,
} from "../domain/tex-document.ts";

/** A `filecontents` block of a source: the file it writes, `[overwrite]`/`[force]` or not, where it is. */
export interface Filecontents {
  readonly writes: string;
  readonly overwrite: boolean;
  /** The whole environment, `\begin` to `\end`. */
  readonly span: Span;
  /** What it writes: from the line after `\begin{…}{…}` to `\end`. */
  readonly body: Span;
}

export interface LatexReader {
  /** The source's `\documentclass`, as one of its states. */
  readonly documentClass: (src: string) => ClassLine;
  /** Its sections, where the back matter begins, and where the document ends. */
  readonly outline: (src: string) => Outline;
  /**
   * Its `\title` and the titles of its `\section`, `\subsection`, `\subsubsection`, `\paragraph`
   * and `\subparagraph` (starred or not, and each optional short title), each as the text the case
   * judge reads: in document order.
   */
  readonly headings: (src: string) => readonly TitledHeading[];
  /** The text a reader sees: prose, the author block, footnotes — not comments, keys, math, code. */
  readonly renderedRuns: (src: string) => readonly TextRun[];
  /**
   * The body's prose, as passages a sentence cannot cross: from the start of the document (the
   * abstract included) to the appendix or the bibliography, without headings, captions, floats,
   * code or the title block. Citations, links and cross-references stay in place as marks.
   */
  readonly bodyProse: (src: string) => readonly Passage[];
  /**
   * The phrases set in bold, italics or underline inside that same prose, in document order — never
   * a heading, a run-in heading (`\textbf{Threats.} …`), a caption, a float or a table.
   */
  readonly bodyEmphasis: (src: string) => readonly Emphasis[];
  /** Every `\input`, `\include` and `\subfile`, in source order: the path as written, where it stands. */
  readonly includes: (src: string) => readonly Include[];
  /** The span of the `document` environment's body, or null when the source has none. */
  readonly documentBody: (src: string) => Span | null;
  /**
   * A preset's `template` → the class it names: a whole `\documentclass[…]{…}` line, or a bare
   * class name (no option). Null for anything else.
   */
  readonly template: (text: string) => DocumentClass | null;
  /**
   * `src` with its `\documentclass` set to `want` — unless it already is `want`'s class with every
   * option `want` names (the author's own options stay), or it has none.
   */
  readonly withDocumentClass: (src: string, want: DocumentClass) => string;
  /** Every command that changes the page layout the class sets: margins, text block, line spacing. */
  readonly layoutOverrides: (src: string) => readonly LayoutOverride[];
  /**
   * Every live `filecontents` block of `src`, in source order, where each stands: a lookup of the text
   * that wrote a `.bib`, never a decision of what TeX wrote (that is `_build/sources.json`). `jobname`
   * is what `\jobname` names in a block's file name.
   */
  readonly filecontents: (
    src: string,
    jobname: string,
  ) => readonly Filecontents[];
}
