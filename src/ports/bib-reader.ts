/**
 * THE BIBTEX READER — the one way paperlint reads a `.bib` database. Every consumer (`recordedBibliography`,
 * `bib/reachable-entry`, the build's reference check, `extract-ref-facts`, `bib-authors`) reads
 * through it; the adapter is `src/adapters/bibtex/`.
 *
 * A database is read as bibtex reads it in its place among the paper's: `inherited` is the `@string`s
 * the databases before it left in force (the previous one's `strings`), none for a database read alone.
 */
import type { BibStrings, BibText } from "../domain/paper-sources.ts";
import type { AbsolutePath } from "../domain/paths.ts";
import type { Span } from "../domain/tex-document.ts";

export interface BibReader {
  /** The database in `body` of `text`, the text of the file at `path`: a block in a `.tex`. */
  readonly read: (
    path: AbsolutePath,
    text: string,
    body: Span,
    inherited?: BibStrings,
  ) => BibText;
  /** A whole `.bib` file. */
  readonly readFile: (
    path: AbsolutePath,
    text: string,
    inherited?: BibStrings,
  ) => BibText;
}
