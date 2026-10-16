/**
 * What git says of one file: whether it is committed as it stands, and in which commit — shaped by
 * what `paperlint studies unseal` needs to gate on a recorded decision. The one implementation is
 * `src/adapters/git/`; `src/cli.ts` wires it.
 */
import type { AbsolutePath } from "../domain/paths.ts";

export type Committed =
  /** No commit has the file: untracked, ignored, only staged, or absent. */
  | { readonly kind: "not-committed" }
  /** Committed, and changed since (edited, staged, deleted): the commit is not what is on disk. */
  | { readonly kind: "changed"; readonly commit: string }
  /** Committed as it stands: the last commit that touched it, and that commit's date. */
  | {
      readonly kind: "committed";
      readonly commit: string;
      readonly date: string;
    }
  /** git could not answer: not installed, not a repository. */
  | { readonly kind: "unknown"; readonly why: string };

export interface GitHistory {
  readonly committed: (file: AbsolutePath) => Committed;
}
