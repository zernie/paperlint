/** Paths as the domain holds them. */
import { isAbsolute, join } from "node:path";
import type { Opaque } from "ts-essentials";

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
