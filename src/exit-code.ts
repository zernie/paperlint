/**
 * The exit-code contract of `skills/render-paper/extract-pdf-facts.mjs`, as a total function. CI
 * steps branch on these codes, so the mapping lives in one table instead of in five `process.exit`
 * calls, and `--strict` changes exactly the rows it names.
 *
 *   0  facts written — or, without `--strict`, not taken and said so (a local run may lack banal)
 *   1  no such path; or, with `--strict`, the facts could not be taken (unreadable PDF, no geometry)
 *   2  usage
 *   3  the paper declares an artifact that is not built
 */
export type ShimOutcome =
  | "written"
  /** Measured, but banal gave no geometry (not found, no perl, failed). */
  | "no-geometry"
  /** pdf.js could not read the PDF. */
  | "unreadable"
  | "no-such-path"
  | "no-artifact"
  | "usage";

export interface ShimMode {
  /** CI: a missing tool is an ENVIRONMENT error, and a skipped step must not look like a passed one. */
  readonly strict: boolean;
}

export type ExitCode = 0 | 1 | 2 | 3;

const CODES: { readonly [K in ShimOutcome]: (m: ShimMode) => ExitCode } = {
  written: () => 0,
  "no-geometry": (m) => (m.strict ? 1 : 0),
  unreadable: (m) => (m.strict ? 1 : 0),
  "no-such-path": () => 1,
  "no-artifact": () => 3,
  usage: () => 2,
};

export const exitCodeFor = (o: ShimOutcome, m: ShimMode): ExitCode =>
  CODES[o](m);
