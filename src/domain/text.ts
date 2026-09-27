/** Text shapes every layer speaks: a message of one or more lines, and the line a failure shows. */

/** A message: the first line says what happened, any further lines are detail. Never empty. */
export type Lines = readonly [string, ...string[]];

/** The first non-blank line of a stream — what a failure shows. */
export const firstLine = (s: string): string =>
  s
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";

/**
 * What a process printed on one stream, as text. Node types `spawnSync(…, { encoding })`'s
 * `stdout`/`stderr` as `string`, but both are `undefined` when the spawn itself failed (measured:
 * `spawnSync("no-such-program", [], { encoding: "utf8" }).stdout` is `undefined`). The parameter
 * takes the stream as it really arrives, so the fallback guards a real case instead of reading
 * as dead code against a type that lies.
 */
export const printed = (stream: string | null | undefined): string =>
  stream ?? "";
