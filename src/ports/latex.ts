/**
 * What paperlint needs from a LaTeX source, shaped by its rules and `paperlint new` — not by the
 * parser. The one implementation is `src/adapters/latex/` (unified-latex); `src/cli.ts` wires it.
 */
import type { Include } from "../domain/paper-source.ts";
import type { BibText, Bibliography } from "../domain/paper-sources.ts";
import type { AbsolutePath } from "../domain/paths.ts";
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

/** One source of a paper, as the bibliography is decided over it. */
export interface BibSource {
  readonly path: AbsolutePath;
  readonly text: string;
}

/** What deciding the bibliography asks of the disk. */
export interface BibDisk {
  /** The `.bib` named (relative to the paper directory, where bibtex runs), or null. */
  readonly bib: (name: string) => BibSource | null;
  /** Whether a file is committed — what a fresh checkout of the paper holds. */
  readonly committed: (p: AbsolutePath) => boolean;
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
  /** Every live `filecontents` block, in source order: not a commented-out one, not one in `\iffalse`. */
  readonly filecontents: (src: string) => readonly Filecontents[];
  /** A `.bib` file's text as bibtex reads it: its entries, an entry behind `%` included. */
  readonly bibText: (path: AbsolutePath, text: string) => BibText;
  /**
   * The bibliography of a paper whose sources are `sources` (the main file first), decided as TeX and
   * bibtex would from the committed bytes (`src/domain/paper-sources.ts`).
   */
  readonly bibliography: (
    sources: readonly BibSource[],
    disk: BibDisk,
  ) => Bibliography;
}
