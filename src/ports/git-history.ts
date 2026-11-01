/**
 * What git says of a study's files — shaped by what the decide-first gate needs: whether a decision
 * file is committed as it stands, and in which commit (`studies gate`); and whether
 * each output entered history after the decision (`repro/outputs-before-decision`). The one
 * implementation is `src/adapters/git/`; `src/cli.ts` wires it.
 */
import type { OrderFacts } from "../domain/decide-first.ts";
import type { AbsolutePath } from "../domain/paths.ts";

export type {
  CommitAt,
  FirstCommit,
  Order,
  OrderFacts,
} from "../domain/decide-first.ts";

export type Committed =
  /** No commit has the file: untracked, ignored, only staged, or absent. */
  | { readonly kind: "not-committed" }
  /** Committed, and changed since (edited, staged, deleted): the commit is not what is on disk. */
  | { readonly kind: "changed"; readonly commit: string }
  /** Committed, then deleted in a later commit: it is not in HEAD, so there is nothing to gate on. */
  | { readonly kind: "deleted"; readonly commit: string }
  /** Committed as it stands: the last commit that touched it, and that commit's date. */
  | {
      readonly kind: "committed";
      readonly commit: string;
      readonly date: string;
    }
  /** git could not answer: not installed, not a repository. */
  | { readonly kind: "unknown"; readonly why: string };

export interface GitHistory {
  /** `file` (absolute, in the repository that holds `paper`), asked from the paper's folder. */
  readonly committed: (paper: AbsolutePath, file: AbsolutePath) => Committed;
}

/** A file as it stood at a commit: its text, not there, or why git could not say. */
export type FileAt =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unknown"; readonly why: string };

export interface GitOrder {
  /** The order of `decision`'s first commit against every file's under `studyDir` (a folder that exists). */
  readonly order: (
    studyDir: AbsolutePath,
    decision: AbsolutePath,
  ) => OrderFacts;
  /** `path` (relative to `studyDir`) as it stood at `commit`: what a plan's gates were at the first output. */
  readonly fileAt: (
    studyDir: AbsolutePath,
    commit: string,
    path: string,
  ) => FileAt;
}
