/**
 * Every way getting a measurement from banal can fail, as ONE union — and `describe`, the only
 * place a sentence about it is written. Callers branch on `kind`; nobody parses a message.
 */
import type { BanalMissing } from "./locate.ts";

export type { BanalMissing } from "./locate.ts";

export type BanalFailure =
  | { readonly kind: "perl-missing" }
  | { readonly kind: "banal-missing"; readonly missing: BanalMissing }
  | {
      readonly kind: "process-failed";
      readonly status: number;
      readonly stderrHead: string;
    }
  | {
      readonly kind: "signalled";
      readonly signal: string;
      readonly stderrHead: string;
    }
  | { readonly kind: "spawn-failed"; readonly message: string }
  | { readonly kind: "timed-out"; readonly afterMs: number }
  | { readonly kind: "no-json"; readonly head: string }
  /** banal's own `{"error": true}` — printed with exit 0 for an input it could not read. */
  | { readonly kind: "banal-error"; readonly stderrHead: string }
  | { readonly kind: "unexpected-shape"; readonly issues: readonly string[] }
  | { readonly kind: "probe-rejected"; readonly got: unknown }
  | {
      readonly kind: "download-failed";
      readonly url: string;
      readonly detail: string;
    }
  | {
      readonly kind: "sha-mismatch";
      readonly url: string;
      readonly expected: string;
      readonly got: string;
    }
  /** The installed file is there, and is not the pin. */
  | { readonly kind: "not-pinned"; readonly path: string }
  /** The installed, pinned banal did not measure the probe page. */
  | {
      readonly kind: "does-not-run";
      readonly path: string;
      readonly why: BanalFailure;
    };

export const PERL_MISSING =
  "perl is not installed — banal, the page-geometry script HotCRP runs, is a Perl program. " +
  "Install perl (Debian/Ubuntu: apt-get install perl; macOS ships it) and run `npx rpp toolchain`";

function missing(m: BanalMissing): string {
  return m.kind === "explicit-not-found"
    ? `banal not found: $BANAL names ${m.path}, which does not exist`
    : `banal not found: ${m.installed} — \`npx rpp toolchain\` installs it`;
}

/** What `describe` returns: the first line says what happened, any further lines are detail. */
export type Lines = readonly [string, ...string[]];

type Kind = BanalFailure["kind"];
/** One sentence-writer per variant. A mapped type over `kind`, so a new variant without one is a compile error. */
type Describers = {
  readonly [K in Kind]: (f: Extract<BanalFailure, { kind: K }>) => Lines;
};

const orNone = (s: string): string => s || "no output";

const DESCRIBE: Describers = {
  "perl-missing": () => [PERL_MISSING],
  "banal-missing": (f) => [missing(f.missing)],
  "process-failed": (f) => [
    `banal failed (exit ${String(f.status)}): ${orNone(f.stderrHead)}`,
  ],
  signalled: (f) => [`banal failed (${f.signal}): ${orNone(f.stderrHead)}`],
  "spawn-failed": (f) => [`banal failed: ${f.message}`],
  "timed-out": (f) => [`banal failed: no answer after ${String(f.afterMs)} ms`],
  "no-json": (f) => [`banal printed no JSON: ${f.head || "nothing"}`],
  "banal-error": (f) => [
    `banal could not read the banal input XML: ${f.stderrHead}`,
  ],
  "unexpected-shape": (f) => [
    `banal printed JSON that is not a measurement: ${f.issues.join("; ")}`,
  ],
  "probe-rejected": (f) => [
    `banal ran on a one-page probe but measured nothing: ${JSON.stringify(f.got)}`,
  ],
  "download-failed": (f) => [
    `could not download banal from ${f.url}: ${f.detail}`,
  ],
  "sha-mismatch": (f) => [
    `banal from ${f.url} does not have the pinned sha256 — refusing to install it`,
    `expected ${f.expected}`,
    `got      ${f.got}`,
  ],
  "not-pinned": (f) => [
    `banal in ${f.path} is not the pinned one (sha256 differs)`,
  ],
  "does-not-run": (f) => [
    `banal in ${f.path} does not run: ${describeLine(f.why)}`,
  ],
};

/**
 * What to tell a person. Most failures are one line; a sha256 mismatch shows both hashes.
 *
 * The one assertion below narrows the table's entry for `f.kind` to a function of `f`: the mapped
 * type already pairs each kind with its own variant, and TypeScript cannot correlate the index with
 * the argument on its own.
 */
export function describe(f: BanalFailure): Lines {
  const write = DESCRIBE[f.kind] as (f: BanalFailure) => Lines;
  return write(f);
}

/** `describe` as one line, for a caller that has a single line to fill. */
export function describeLine(f: BanalFailure): string {
  return describe(f).join("; ");
}
