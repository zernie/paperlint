/** Text shapes every layer speaks: a message of one or more lines, and the line a failure shows. */

/** A message: the first line says what happened, any further lines are detail. Never empty. */
export type Lines = readonly [string, ...string[]];

/** The first non-blank line of a stream — what a failure shows. */
export const firstLine = (s: string): string =>
  s
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
