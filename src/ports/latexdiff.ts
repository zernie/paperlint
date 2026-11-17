/**
 * What `paperlint versions diff` needs from a text differ, shaped by that command and not by the
 * tool: given the approved text and the current one, the document that shows the change and the
 * stretches of the approved text that are gone. The one implementation is `src/adapters/latexdiff/`
 * (the `latexdiff` program); `src/cli.ts` wires it.
 */
import type { AbsolutePath } from "../domain/paths.ts";
import type { Result } from "../domain/result.ts";

/** The comparison: the marked-up document, and the approved text's stretches the draft no longer has. */
export interface Removed {
  readonly diffTex: string;
  readonly removed: readonly string[];
}

export interface LatexDiff {
  /**
   * Compare the two texts, working in `dir` (the folder `approved.tex`, `current.tex` and `diff.tex` are
   * written to, so the author can open them). The error is one line saying why it could not.
   */
  readonly removedSince: (
    approved: string,
    current: string,
    dir: AbsolutePath,
  ) => Result<Removed, string>;
}
