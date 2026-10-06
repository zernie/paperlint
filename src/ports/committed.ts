/**
 * Whether a file is committed — part of what a fresh checkout of the paper holds, as opposed to a
 * build product or a file only this machine has. Shaped by the bibliography decision
 * (`src/domain/paper-sources.ts`): a `.bib` beside a `filecontents` block counts against the block
 * only when it is committed. The one implementation asks git (`src/adapters/git/`).
 */
import type { AbsolutePath } from "../domain/paths.ts";

export interface CommittedFiles {
  /** True for a committed file, and for any file when there is no fresher state to compare with. */
  readonly isCommitted: (p: AbsolutePath) => boolean;
}
