/**
 * Every way getting a measurement from banal can fail, as ONE union — and `describe`, the only
 * place a sentence about it is written. Callers branch on `kind`; nobody parses a message.
 */
import { assertNever } from "../result.ts";

/** Why there is no banal to run. */
export type BanalMissing =
  /** `$BANAL` names a file that is not there. An explicit choice: no fallback to another banal. */
  | { readonly kind: "explicit-not-found"; readonly path: string }
  /** Nothing named, nothing vendored, and `rpp toolchain` has not installed it (here). */
  | { readonly kind: "not-installed"; readonly installed: string };

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
    };

export const PERL_MISSING =
  "perl is not installed — banal, the page-geometry script HotCRP runs, is a Perl program. " +
  "Install perl (Debian/Ubuntu: apt-get install perl; macOS ships it) and run `npx rpp toolchain`";

function missing(m: BanalMissing): string {
  return m.kind === "explicit-not-found"
    ? `banal not found: $BANAL names ${m.path}, which does not exist`
    : `banal not found: ${m.installed} — \`npx rpp toolchain\` installs it`;
}

/**
 * What to tell a person: the first line says what happened, any further lines are detail. Most
 * failures are one line; a sha256 mismatch shows both hashes.
 */
export function describe(f: BanalFailure): readonly [string, ...string[]] {
  switch (f.kind) {
    case "perl-missing":
      return [PERL_MISSING];
    case "banal-missing":
      return [missing(f.missing)];
    case "process-failed":
      return [
        `banal failed (exit ${String(f.status)}): ${f.stderrHead || "no output"}`,
      ];
    case "signalled":
      return [`banal failed (${f.signal}): ${f.stderrHead || "no output"}`];
    case "spawn-failed":
      return [`banal failed: ${f.message}`];
    case "timed-out":
      return [`banal failed: no answer after ${String(f.afterMs)} ms`];
    case "no-json":
      return [`banal printed no JSON: ${f.head || "nothing"}`];
    case "banal-error":
      return [`banal could not read the banal input XML: ${f.stderrHead}`];
    case "unexpected-shape":
      return [
        `banal printed JSON that is not a measurement: ${f.issues.join("; ")}`,
      ];
    case "probe-rejected":
      return [
        `banal ran on a one-page probe but measured nothing: ${JSON.stringify(f.got)}`,
      ];
    case "download-failed":
      return [`could not download banal from ${f.url}: ${f.detail}`];
    case "sha-mismatch":
      return [
        `banal from ${f.url} does not have the pinned sha256 — refusing to install it`,
        `expected ${f.expected}`,
        `got      ${f.got}`,
      ];
    default:
      return assertNever(f);
  }
}

/** `describe` as one line, for a caller that has a single line to fill. */
export const describeLine = (f: BanalFailure): string => describe(f).join("; ");
