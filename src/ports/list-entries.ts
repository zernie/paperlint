/**
 * A directory's entries with what each one is, read without following a symbolic link — so a walk
 * that descends only into `dir` entries can neither loop on a link to an ancestor nor wander into a
 * tree outside through one. The reader of a study's folder
 * (`src/study-folder.ts`), outputs listing included (`StudyFolder.list`), reads with it.
 */
import type { AbsolutePath } from "../domain/paths.ts";

/**
 * One entry of a directory: a regular file, a directory, a symbolic link (not followed), or `other` —
 * anything that is none of those (a FIFO, a socket, a device). An `other` entry is a name and nothing
 * more: it is never read (opening a FIFO blocks) and never descended into, and an outputs listing
 * still names it.
 */
export interface DirEntry {
  readonly name: string;
  readonly kind: "file" | "dir" | "symlink" | "other";
}

/** The entries of `dir`; none when it does not exist or is not a directory. */
export type ListEntries = (dir: AbsolutePath) => readonly DirEntry[];
