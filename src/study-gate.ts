/**
 * `paperlint studies gate <paper-dir> <id>` — may the study's run start? For a study decided before
 * its run (the default mode), only once its decision file exists and is committed as it stands: exit 0
 * with the commit and its date, else exit 1 saying why. A runner calls it first:
 *
 *   npx paperlint studies gate papers/my-paper P1-S03 && ./run.sh
 *
 * A blind study's run needs no decision (its outputs are sealed); an exploratory one has no gate. Both
 * exit 0 and say so. A study that declares no mode, or names no decision file, is refused.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { modeStudies, type BlindDeps } from "./blind-plaintext-rule.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import {
  decisionAsOutput,
  type Blind,
  type DecideFirst,
  type Exploratory,
} from "./domain/study-mode.ts";
import type { Study } from "./domain/study-registry.ts";
import type { Committed, GitHistory } from "./ports/git-history.ts";
import { refusal, refused, type SealRun } from "./sealed-studies.ts";

export interface GateDeps extends BlindDeps {
  readonly git: GitHistory;
}

/** What a decision's committed state means for the run. */
export const gateLine = (
  id: string,
  file: string,
  c: Committed,
  what = "the run",
): { readonly open: boolean; readonly line: string } => {
  switch (c.kind) {
    case "committed":
      return {
        open: true,
        line: `${id}: the decision ${file} is committed in ${c.commit} (${c.date}); ${what} may start.`,
      };
    case "changed":
      return {
        open: false,
        line: `${id}: the decision ${file} has changed since its last commit, ${c.commit}; ${what} waits for the decision as committed. Commit it, then run this again.`,
      };
    case "not-committed":
      return {
        open: false,
        line: `${id}: the decision ${file} is not committed; ${what} waits for it. Write the decision there, commit it, then run this again.`,
      };
    case "unknown":
      return {
        open: false,
        line: `${id}: git could not say whether the decision ${file} is committed: ${c.why}.`,
      };
  }
};

/** The gate of a decide-first study. */
const gateDecided = (
  paper: string,
  { id, folder }: Study,
  mode: DecideFirst,
  deps: GateDeps,
): SealRun => {
  const file = mode.decision.file;
  if (!/\S/u.test(file))
    return refused(
      refusal(
        `${id}: its plan names no decision file (\`mode.decision.file\`); the run cannot be gated on nothing.`,
      ),
    );
  const glob = decisionAsOutput(folder, mode);
  if (glob !== null)
    return refused(
      refusal(
        `${id}: its decision ${file} is matched by its output \`${glob}\`; a decision cannot be what its own run produces.`,
      ),
    );
  const g = gateLine(
    id,
    file,
    deps.git.committed(callerPath(paper), callerPath(join(paper, file))),
  );
  return g.open ? { ok: true, lines: [g.line] } : refused(refusal(g.line));
};

/** `studies gate`: 0 when the run may start, 1 with the reason when not. */
export function runGate(
  paper: string,
  shown: string,
  id: string,
  deps: GateDeps,
): SealRun {
  const s = modeStudies(paper, deps).find((m) => m.row.id === id);
  if (s === undefined)
    return refused(
      refusal(
        `${id} declares no mode in ${shown}: no row of ${shown}/${REPRO_DIR}/studies.json with this id names a plan.json that parses with \`mode\`. Lint the paper (\`npx paperlint lint\`) to see why.`,
      ),
    );
  return s.mode.kind === "decide_before_run"
    ? gateDecided(paper, s.row, s.mode, deps)
    : { ok: true, lines: [ungated(shown, id, s.mode)] };
}

/** What the gate says of a study whose run waits on nothing. */
const ungated = (
  shown: string,
  id: string,
  mode: Blind | Exploratory,
): string =>
  mode.kind === "blind"
    ? `${id} is blind: its run needs no decision. Seal its outputs as soon as they exist (\`npx paperlint studies seal ${shown} ${id}\`).`
    : `${id} is exploratory (${mode.reason}): it has no gate, and its results are reported as exploratory.`;
