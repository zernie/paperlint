/**
 * THE DECISION of the LaTeX build loop: given what the runs so far observed, what runs next.
 *
 * PURE. No disk, no process, no clock. The shell in `build.ts` runs a step, records what it saw
 * as an `Observation`, appends it to the history and asks again. Every branch of the loop is
 * therefore a row in a table test (`latex-loop.harness.mjs`), not a scenario that needs TeX.
 *
 * ── THE LOOP, in the order `nextStep` checks it ─────────────────────────────
 *   1. nothing ran yet                                  → latex
 *   2. the last run exited non-zero                     → fail, naming that step
 *   3. the last run was the FINAL latex pass            → done
 *   4. the aux names a bibliography, and bibtex has not
 *      yet run on exactly these citations + databases   → bibtex
 *   5. the last run changed a tracked file, or the log
 *      asked for a rerun                                → latex (fail once the cap is spent)
 *   6. otherwise the document has converged             → latex, FINAL
 *
 * 🔴 WHY A FINAL PASS AFTER CONVERGENCE. `paper-guards.tex`, shipped by this package, turns an
 * undefined `\ref` or `\cite` into a BUILD FAILURE — but only on a pass that defines
 * `\finalpass`, because on the first pass every reference is undefined by construction. Measured
 * on 2026-08-26 with the unconditional form: pass 1 fails, the `.aux` is never written, pass 2
 * fails the same way and no PDF ever appears. So the guards need to know which pass is the last,
 * and only the loop knows it. The price is one extra pdflatex run per build, paid for turning
 * "?? in the PDF" into a red build.
 *
 * 🔴 WHY A CAP. A document can rewrite its own inputs on every pass — `filecontents*` with
 * `[overwrite]`, a counter that moves a float which moves a label — and then the aux never
 * settles. Without a cap the loop runs forever; with a silent cap it stops and ships an
 * unconverged PDF with wrong cross-references. It stops, and it FAILS, naming the file that kept
 * changing.
 */

/** Files a pdflatex pass writes and the next pass reads. A change means the output is stale. */
export type Tracked = "aux" | "toc" | "out" | "bbl";
export const TRACKED: readonly Tracked[] = ["aux", "toc", "out", "bbl"];

/** Content digests of the tracked files; `null` = the file does not exist. */
export type Hashes = { readonly [K in Tracked]: string | null };

/** Log markers, as `latex-log.ts` reads them. Re-declared as a type so this module has no imports. */
export type LogMarker =
  | "rerun-requested"
  | "labels-changed"
  | "rerunfilecheck"
  | "undefined-references"
  | "undefined-citations";

const RERUN: readonly LogMarker[] = [
  "rerun-requested",
  "labels-changed",
  "rerunfilecheck",
];

/**
 * What bibtex would be run on. `none` — the aux names no `\bibdata`, so there is nothing for
 * bibtex to do. Two `needed` states are the same input exactly when every field is equal: the
 * citation set moved, a database was added, or a `.bib` file's content changed ⇒ bibtex again.
 */
export type BibInput =
  | { readonly kind: "none" }
  | {
      readonly kind: "needed";
      /** Sorted, unique cited keys. */
      readonly citations: readonly string[];
      readonly databases: readonly string[];
      readonly style: string | null;
      /** A digest over the content of every database file that exists; null when none was found. */
      readonly bibHash: string | null;
    };

export type Observation =
  | {
      readonly step: "latex";
      /** Whether this pass defined `\finalpass`. */
      readonly final: boolean;
      readonly exitCode: number;
      readonly before: Hashes;
      readonly after: Hashes;
      readonly markers: readonly LogMarker[];
      /** The bibliography input as the aux stood after this pass. */
      readonly bib: BibInput;
      /** The first error and its source context, from the log. Empty on success. */
      readonly errorLines: readonly string[];
    }
  | {
      readonly step: "bibtex";
      readonly exitCode: number;
      readonly before: Hashes;
      readonly after: Hashes;
      /** The input bibtex was run on. */
      readonly bib: BibInput;
      readonly errorLines: readonly string[];
    };

/** Why another pass is needed: a tracked file changed, or the log asked for it. */
export type RerunReason =
  | { readonly kind: "changed"; readonly files: readonly Tracked[] }
  | { readonly kind: "marker"; readonly markers: readonly LogMarker[] };

export type FailCause =
  | { readonly kind: "exit"; readonly code: number }
  | { readonly kind: "no-convergence"; readonly reason: RerunReason };

export type Step =
  | { readonly kind: "latex"; readonly final: boolean }
  | { readonly kind: "bibtex" }
  | {
      readonly kind: "done";
      /** Undefined-reference summaries still in the final log — a converged doc with a bad key. */
      readonly warnings: readonly LogMarker[];
    }
  | {
      readonly kind: "fail";
      readonly step: "latex" | "bibtex";
      readonly cause: FailCause;
      /** What to show the human: the log excerpt, or the non-convergence explanation. */
      readonly lines: readonly string[];
    };

/** Non-final pdflatex passes allowed before the build is declared non-converging. */
export const MAX_PASSES = 5;

/** The tracked files whose digest differs between two snapshots. */
export function changedFiles(before: Hashes, after: Hashes): Tracked[] {
  return TRACKED.filter((f) => before[f] !== after[f]);
}

const sameBib = (a: BibInput, b: BibInput): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Why the last run leaves the document stale, or null when it does not.
 *
 * After a latex pass: any tracked file it changed, else any rerun marker in its log. After a
 * bibtex run: a changed `.bbl` (the next pass must read it). An unchanged `.bbl` changes
 * nothing, and the verdict of the latex pass before it stands.
 */
export function rerunReason(
  history: readonly Observation[],
): RerunReason | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const o = history[i];
    if (!o) break;
    const files = changedFiles(o.before, o.after);
    if (files.length > 0) return { kind: "changed", files };
    if (o.step === "latex") {
      const markers = o.markers.filter((m) => RERUN.includes(m));
      return markers.length > 0 ? { kind: "marker", markers } : null;
    }
  }
  return null;
}

export function describeReason(reason: RerunReason): string {
  return reason.kind === "changed"
    ? `paper.${reason.files.join(", paper.")} still changes on every pass`
    : `the log still asks for a rerun (${reason.markers.join(", ")})`;
}

export function nextStep(history: readonly Observation[]): Step {
  const last = history.at(-1);
  if (!last) return { kind: "latex", final: false };

  if (last.exitCode !== 0)
    return {
      kind: "fail",
      step: last.step,
      cause: { kind: "exit", code: last.exitCode },
      lines: last.errorLines,
    };

  if (last.step === "latex" && last.final)
    return {
      kind: "done",
      warnings: last.markers.filter(
        (m) => m === "undefined-references" || m === "undefined-citations",
      ),
    };

  const latexRuns = history.filter((o) => o.step === "latex");
  const lastLatex = latexRuns.at(-1);
  const lastBibtex = history.filter((o) => o.step === "bibtex").at(-1);
  if (
    lastLatex &&
    lastLatex.bib.kind === "needed" &&
    (!lastBibtex || !sameBib(lastBibtex.bib, lastLatex.bib))
  )
    return { kind: "bibtex" };

  const reason = rerunReason(history);
  if (reason) {
    if (latexRuns.length >= MAX_PASSES)
      return {
        kind: "fail",
        step: "latex",
        cause: { kind: "no-convergence", reason },
        lines: [
          `the build does not converge: after ${MAX_PASSES} pdflatex passes ${describeReason(reason)}.`,
          `A document that rewrites its own inputs on every pass (filecontents* with [overwrite], a`,
          `float that moves the label it depends on) never settles; stopping here instead of shipping`,
          `a PDF with stale cross-references.`,
        ],
      };
    return { kind: "latex", final: false };
  }
  return { kind: "latex", final: true };
}
