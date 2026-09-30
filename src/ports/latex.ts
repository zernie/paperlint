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
} from "../domain/tex-document.ts";

export interface LatexReader {
  /** The source's `\documentclass`, as one of its states. */
  readonly documentClass: (src: string) => ClassLine;
  /** Its sections, where the back matter begins, and where the document ends. */
  readonly outline: (src: string) => Outline;
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
}
