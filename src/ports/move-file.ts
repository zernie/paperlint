/** Moving a file — the one thing `paperlint versions migrate` does that a write cannot. */
import type { AbsolutePath } from "../domain/paths.ts";

/** Move the file `from` to `to`, creating `to`'s directory; the file is the same bytes after. */
export type MoveFile = (from: AbsolutePath, to: AbsolutePath) => void;

/** Copy the file `from` to `to`, creating `to`'s directory; throws when there is nothing at `from`. */
export type CopyFile = (from: AbsolutePath, to: AbsolutePath) => void;
