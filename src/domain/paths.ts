/** Paths as the domain holds them. */
import { isAbsolute, join, posix } from "node:path";
import type { Opaque } from "ts-essentials";
import { err, ok, type Result } from "./result.ts";

/**
 * An absolute path. Minted by `absolutePath` (a checked string) or `joinPath` (an absolute base and
 * segments) only, so nothing holding one has to ask whether it is relative.
 */
export type AbsolutePath = Opaque<string, "AbsolutePath">;

// The brand's one owner: the predicate IS the check, so no assertion is needed to mint the type.
const isAbsolutePath = (p: string): p is AbsolutePath => isAbsolute(p);

/** A path the caller holds as text, checked where it becomes a value. A relative one throws. */
export function absolutePath(p: string): AbsolutePath {
  if (!isAbsolutePath(p)) throw new Error(`not an absolute path: ${p}`);
  return p;
}

/** `segments` under `base`: absolute because `base` is. */
export const joinPath = (
  base: AbsolutePath,
  ...segments: string[]
): AbsolutePath => absolutePath(join(base, ...segments));

/**
 * A file of a paper, by its path relative to the paper folder, in one spelling: posix-normalized, no
 * leading `./`, never absolute, never out of the folder (`..`), never the folder itself. Two
 * spellings of one file (`./versions/a.tex`, `versions/a.tex`) are then one value, so comparing,
 * grouping and checking paths is comparing strings.
 */
export type PaperPath = Opaque<string, "PaperPath">;

// The brand's one owner, as for AbsolutePath: the predicate is the check.
const isPaperPath = (p: string): p is PaperPath =>
  p !== "." &&
  p !== ".." &&
  !p.startsWith("../") &&
  !isAbsolute(p) &&
  !p.includes("\\") &&
  posix.normalize(p) === p;

/** A path as a paper's record spells it, normalized; or why it names no file inside the paper. */
export function paperPath(raw: string): Result<PaperPath, string> {
  const p = posix.normalize(raw);
  return isPaperPath(p)
    ? ok(p)
    : err(`\`${raw}\` is not a path inside the paper folder`);
}

/** A path the code composes from parts it already holds (`versions/<key>`); one that is not throws. */
export function asPaperPath(p: string): PaperPath {
  if (!isPaperPath(p))
    throw new Error(`not a path inside the paper folder: ${p}`);
  return p;
}
