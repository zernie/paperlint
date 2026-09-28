/**
 * What paperlint needs from a LaTeX source, shaped by its rules and `paperlint new` — not by the
 * parser. The one implementation is `src/adapters/latex/` (unified-latex); `src/cli.ts` wires it.
 */
import type {
  ClassLine,
  DocumentClass,
  Outline,
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
   * A preset's `template` → the class it names: a whole `\documentclass[…]{…}` line, or a bare
   * class name (no option). Null for anything else.
   */
  readonly template: (text: string) => DocumentClass | null;
  /**
   * `src` with its `\documentclass` set to `want` — unless it already is `want`'s class with every
   * option `want` names (the author's own options stay), or it has none.
   */
  readonly withDocumentClass: (src: string, want: DocumentClass) => string;
}
