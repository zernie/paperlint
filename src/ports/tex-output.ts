/**
 * What paperlint reads from the files TeX writes beside a paper, shaped by what the record of a build
 * needs (`src/domain/sources-record.ts`) — not by the formats. The one implementation is
 * `src/adapters/tex-output/`; `src/cli.ts` wires it.
 *
 * What the build's `.aux`, `.blg` and `.bbl` hold about the bibliography is read by `src/latex-log.ts`,
 * which the build loop already reads them with.
 */
import type { BibtexError } from "../domain/sources-record.ts";
import type { Fls } from "../domain/tex-run.ts";

export interface TexOutput {
  /** An `.fls`'s text. */
  readonly fls: (text: string) => Fls;
  /** The errors a bibtex `.blg` reports, in order; warnings are not errors. */
  readonly blgErrors: (blg: string) => readonly BibtexError[];
}
