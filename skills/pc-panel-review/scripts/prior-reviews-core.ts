/**
 * prior-reviews-core — whether the panel's prior-reviews seat must sit, and which points file it
 * reads. The answer comes from `priorReviewsOf`, the function `cycle/prior-reviews-answered` uses,
 * so the seat and the rule fire on the same papers: the last rejection with reviews before the open
 * attempt, walking back over attempts that brought no reviews (a withdrawal, a desk rejection).
 * No model, no network.
 */
import { join } from "node:path";
import { callerPath } from "#src/caller-path";
import type { Files } from "#src/ports/files";
import { readPaperSettings } from "#src/paper-settings";
import { priorReviewsOf } from "#src/prior-reviews-rule";

/** What the command prints, and its exit code. */
export interface SeatVerdict {
  readonly code: number;
  readonly line: string;
}

/** The seat's verdict for the paper in `dir`. */
export function seatVerdict(
  dir: string,
  deps: { readonly files: Files },
): SeatVerdict {
  // readPaperSettings, as the lint run reads the file: a file that does not parse, or cycles it cannot
  // hold, is an error here, never a "not required" (readCycles alone reads broken JSON as no cycles).
  const settings = readPaperSettings(deps.files, dir);
  if (!settings.ok)
    return { code: 2, line: `prior-reviews: ${settings.error.why}` };
  const cycles = settings.value?.cycles ?? null;
  const prior = cycles === null ? null : priorReviewsOf(cycles);
  if (prior === null)
    return {
      code: 0,
      line: "not required: no rejection with reviews before the open attempt",
    };
  const from = `reviews from ${prior.rejected.id}, answered by ${prior.open.id}`;
  return deps.files.isFile(callerPath(join(dir, prior.file)))
    ? { code: 0, line: `required: ${prior.file} (${from})` }
    : {
        code: 1,
        line: `required, and ${prior.file} is missing (${from}): write it first; cycle/prior-reviews-answered fails until it exists`,
      };
}

/** Where the command writes. */
export interface Output {
  readonly out: (s: string) => void;
  readonly err: (s: string) => void;
}

/** Run the command on `argv`; the exit code. */
export function main(
  argv: readonly string[],
  deps: { readonly files: Files },
  { out, err }: Output,
): number {
  const [arg] = argv;
  if (arg === undefined) {
    err("usage: node prior-reviews.js <paper-dir>\n");
    return 2;
  }
  const verdict = seatVerdict(callerPath(arg), deps);
  (verdict.code === 0 ? out : err)(`${verdict.line}\n`);
  return verdict.code;
}
