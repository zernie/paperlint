/**
 * THE DECISION of the LaTeX build loop: given what the runs so far observed, what runs next.
 *
 * PURE. No disk, no process, no clock. The shell in `build.ts` runs a step, records what it saw
 * as an `Observation`, appends it to the history and asks `nextStep(summarize(history))` again.
 * Both halves are table tests (`latex-loop.harness.mjs`), not scenarios that need TeX.
 *
 * ── THE LOOP: `summarize` reduces the history to a `State`, and `nextStep` asks four questions ──
 *   1. did the last program fail?                          → fail, with its error lines
 *   2. did the citations, a .bib or the style change since
 *      bibtex last ran?                                    → bibtex
 *   3. did the last pass change a tracked file, or did the
 *      log ask for a rerun?                                → latex (fail after MAX_PASSES)
 *   4. otherwise                                           → one FINAL latex pass, then done
 *
 * 🔴 WHY A FINAL PASS AFTER CONVERGENCE. `paper-guards.tex`, shipped by this package, turns an
 * undefined `\ref` or `\cite` into a BUILD FAILURE — but only on a pass that defines
 * `\finalpass`, because on the first pass every reference is undefined by construction. Measured
 * on 2026-08-26 with the unconditional form: pass 1 fails, the `.aux` is never written, pass 2
 * fails the same way and no PDF ever appears. So the guards need to know which pass is the last,
 * and only the loop knows it. The price is one extra pdflatex run per build, paid for turning
 * "?? in the PDF" into a red build.
 *
 * 🔴 WHY A CAP. A document can keep changing its own aux on every pass — the textbook case is a
 * page reference whose own wording moves its target to the other page, and back — and the aux never
 * settles. Without a cap the loop runs forever; with a silent cap it stops and ships an
 * unconverged PDF with wrong cross-references. It stops, and it FAILS, naming the file that kept
 * changing.
 *
 * ⚠️ `filecontents` with `[overwrite]` is NOT such a case, though this comment said so until
 * 2026-09-24. The environment body is verbatim, so every pass writes the same bytes, and the loop
 * compares CONTENT digests, not modification times. Measured with `rpp build` on TeX Live 2026: a
 * real acmart paper embedding its `refs.bib` that way converged in 3 pdflatex passes, and an
 * `article` with an overwritten `\input` file carrying `\label`/`\ref`, a `\tableofcontents` and
 * an overwritten `.bib` converged in 4.
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

export type FailCause =
  | { readonly kind: "exit"; readonly code: number }
  | { readonly kind: "no-convergence"; readonly unsettled: readonly string[] };

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

/** The history, reduced to the four questions `nextStep` asks. */
export type State = {
  readonly failed: {
    readonly step: "latex" | "bibtex";
    readonly cause: FailCause;
    readonly lines: readonly string[];
  } | null;
  /** Citations, databases, style or `.bib` content changed since bibtex last ran. */
  readonly bibOutdated: boolean;
  /** Tracked files the last pass changed (`paper.aux`), or the rerun markers its log printed. */
  readonly unsettled: readonly string[];
  /** Non-final pdflatex passes so far. */
  readonly latexPasses: number;
  readonly finalDone: boolean;
  /** Undefined-reference summaries in the log of the final pass. */
  readonly warnings: readonly LogMarker[];
};

export function nextStep(s: State): Step {
  if (s.failed) return { kind: "fail", ...s.failed };
  if (s.finalDone) return { kind: "done", warnings: s.warnings };
  if (s.bibOutdated) return { kind: "bibtex" };
  if (s.unsettled.length === 0) return { kind: "latex", final: true };
  if (s.latexPasses < MAX_PASSES) return { kind: "latex", final: false };
  return noConvergence(s.unsettled);
}

const noConvergence = (unsettled: readonly string[]): Step => ({
  kind: "fail",
  step: "latex",
  cause: { kind: "no-convergence", unsettled },
  lines: [
    `the build does not converge: after ${MAX_PASSES} pdflatex passes, the last one still changed or asked to rerun: ${unsettled.join(", ")}.`,
    `A document whose aux keeps changing on every pass never settles; stopping here instead of`,
    `shipping a PDF with stale cross-references.`,
  ],
});

/** The tracked files whose digest differs between two snapshots. */
export function changedFiles(before: Hashes, after: Hashes): Tracked[] {
  return TRACKED.filter((f) => before[f] !== after[f]);
}

const sameBib = (a: BibInput, b: BibInput): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * What the last run left unsettled. Walking back: a run that changed a tracked file answers with
 * those files; a latex pass that changed none answers with the rerun markers in its log. A bibtex
 * run that left the `.bbl` byte-identical changes nothing, so the pass before it answers.
 */
function unsettledBy(history: readonly Observation[]): string[] {
  if (history.length === 0) return ["paper.aux"]; // no pass has written it yet
  for (const o of history.toReversed()) {
    const files = changedFiles(o.before, o.after);
    if (files.length > 0) return files.map((f) => `paper.${f}`);
    if (o.step === "latex") return o.markers.filter((m) => RERUN.includes(m));
  }
  return [];
}

export function summarize(history: readonly Observation[]): State {
  const last = history.at(-1);
  const latexRuns = history.filter((o) => o.step === "latex");
  const lastLatex = latexRuns.at(-1);
  const lastBibtex = history.filter((o) => o.step === "bibtex").at(-1);
  return {
    failed:
      last && last.exitCode !== 0
        ? {
            step: last.step,
            cause: { kind: "exit", code: last.exitCode },
            lines: last.errorLines,
          }
        : null,
    bibOutdated:
      lastLatex?.bib.kind === "needed" &&
      !(lastBibtex && sameBib(lastBibtex.bib, lastLatex.bib)),
    unsettled: unsettledBy(history),
    latexPasses: latexRuns.filter((o) => !o.final).length,
    finalDone: last?.step === "latex" && last.final,
    warnings:
      last?.step === "latex"
        ? last.markers.filter(
            (m) => m === "undefined-references" || m === "undefined-citations",
          )
        : [],
  };
}
