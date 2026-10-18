/**
 * A directory's entries with what each one is, read without following a symbolic link — so a walk
 * that descends only into `dir` entries can neither loop on a link to an ancestor nor wander into a
 * tree outside through one. The reader of a study's folder (`src/study-folder.ts`) and the walk of its outputs (`filesUnder`, `src/study-modes.ts`) read with it.
 */
import type { AbsolutePath } from "../domain/paths.ts";

/**
 * One entry of a directory: a directory, a symbolic link (not followed), or a file — anything else on
 * disk (a socket, a FIFO) reads as a file: a name, never descended into.
 */
export interface DirEntry {
  readonly name: string;
  readonly kind: "file" | "dir" | "symlink";
}

/** The entries of `dir`; none when it does not exist or is not a directory. */
export type ListEntries = (dir: AbsolutePath) => readonly DirEntry[];
