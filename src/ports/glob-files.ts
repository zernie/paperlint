/**
 * The files under a folder that a glob matches — what `artifact/contents` asks of a paper's artifact
 * folder: its top-level names (`*`) and each promise's glob.
 */
import type { AbsolutePath } from "../domain/paths.ts";

/**
 * The regular files under `dir` whose path relative to it matches `pattern`, as those relative
 * paths, sorted; null when `dir` is not a directory.
 */
export type GlobFiles = (
  dir: AbsolutePath,
  pattern: string,
) => readonly string[] | null;
