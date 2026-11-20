/**
 * Every file under a folder — what the artifact rules ask of a paper's artifact folder, to judge its
 * top level and its promises' globs over the same list a committed `files` list gives.
 */
import type { AbsolutePath } from "../domain/paths.ts";

/**
 * The regular files under `dir`, at any depth, as paths relative to it (`/`-separated), sorted;
 * null when `dir` is not a directory.
 */
export type ListTree = (dir: AbsolutePath) => readonly string[] | null;
