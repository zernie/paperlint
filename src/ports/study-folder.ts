/**
 * The reads a paper's study folders allow, shaped by what the study readers need: a row's folder is
 * entered or refused, a path inside it is located or read, the files under it are listed, and the
 * decision file's path is walked — none of it by following a symbolic link. The reader of every plan,
 * result file, output listing and decision (`src/study-folder.ts`) is this port's one implementation.
 */
import type { Located } from "../domain/study-registry.ts";

/** What reading a path inside a study's folder gave. */
export type FolderRead =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "absent" }
  | { readonly kind: "linked"; readonly link: string };

/** What a path in the paper is: `Located`, a directory, or something that is no regular file (a FIFO, a socket). */
export type PathEntry =
  Located | { readonly kind: "dir" } | { readonly kind: "other" };

/** Why a row's folder may not be entered: it is no one folder inside `repro/`, or it is a link. */
export type FolderRefusal = "not-a-folder" | "symbolic-link";

/** The reads a paper's study folders allow. */
export interface StudyFolder {
  /** Why `folder` may not be entered; null when it may. */
  readonly refusal: (folder: string) => FolderRefusal | null;
  /** What `path` in `folder` is; nothing is read. */
  readonly locate: (folder: string, path: string) => Located;
  /** The text of the file at `path` in `folder`. */
  readonly read: (folder: string, path: string) => FolderRead;
  /**
   * Every file under `folder`, relative to it and `/`-separated: a symbolic link is listed as a file
   * (git stores it as one) and never descended into; a FIFO or a socket is listed by name too (it is
   * never read). None for a folder that may not be entered.
   */
  readonly list: (folder: string) => readonly string[];
  /** What `path`, relative to the paper, is: a decision file is held to be a regular file. */
  readonly entryAt: (path: string) => PathEntry;
}
