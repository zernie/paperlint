/**
 * `paperlint studies gate <paper-dir> <id>` — may the study's run start? For a study decided before
 * its run (the default mode), only once its decision file exists and is committed as it stands: exit 0
 * with the commit and its date, else exit 1 saying why. A runner calls it first:
 *
 *   npx paperlint studies gate papers/my-paper P1-S03 && ./run.sh
 *
 * An exploratory study has no gate: it exits 0 and says so. A study that declares no mode, names no
 * decision file, or whose row names a folder that is not one inside `repro/`, is refused.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { isDirectory, modeStudies, type StudyDeps } from "./study-modes.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import { decisionAsOutput, type DecideFirst } from "./domain/study-mode.ts";
import { isFolderName, type Study } from "./domain/study-registry.ts";
import type { Committed, GitHistory } from "./ports/git-history.ts";
import { registryOf } from "./study-registry-rule.ts";
import {
  refusal,
  refused,
  type StudyRefusal,
  type StudyRun,
} from "./study-run.ts";

export interface GateDeps extends StudyDeps {
  readonly git: GitHistory;
}

/** The line of a committed state that holds the run back. */
const shutLine = (
  id: string,
  file: string,
  c: Exclude<Committed, { readonly kind: "committed" }>,
): string => {
  switch (c.kind) {
    case "changed":
      return `${id}: the decision ${file} has changed since its last commit, ${c.commit}; the run waits for the decision as committed. Commit it, then run this again.`;
    case "deleted":
      return `${id}: the decision ${file} is not in HEAD: it was deleted in ${c.commit}; the run waits for a decision that stands. Restore it, commit it, then run this again.`;
    case "not-committed":
      return `${id}: the decision ${file} is not committed; the run waits for it. Write the decision there, commit it, then run this again.`;
    case "unknown":
      return `${id}: git could not say whether the decision ${file} is committed: ${c.why}.`;
  }
};

/** What a decision's committed state means for the run. */
export const gateLine = (
  id: string,
  file: string,
  c: Committed,
): { readonly open: boolean; readonly line: string } =>
  c.kind === "committed"
    ? {
        open: true,
        line: `${id}: the decision ${file} is committed in ${c.commit} (${c.date}); the run may start.`,
      }
    : { open: false, line: shutLine(id, file, c) };

/**
 * Why the decision cannot gate the run though it is named: its own outputs match it, or it is a
 * directory (git answers for a directory with the last commit of anything under it); null when usable.
 */
const unusable = (
  paper: string,
  { id, folder }: Pick<Study, "id" | "folder">,
  mode: DecideFirst,
  deps: GateDeps,
): StudyRefusal | null => {
  const file = mode.decision.file;
  const glob = decisionAsOutput(folder, mode);
  if (glob !== null)
    return refusal(
      `${id}: its decision ${file} is matched by its output \`${glob}\`; a decision cannot be what its own run produces.`,
    );
  return isDirectory(join(paper, file), deps)
    ? refusal(
        `${id}: its decision ${file} is a directory, not a file; the run cannot be gated on it. Name the decision file in \`mode.decision.file\`.`,
      )
    : null;
};

/** The gate of a decide-first study. */
const gateDecided = (
  paper: string,
  { id, folder }: Study,
  mode: DecideFirst,
  deps: GateDeps,
): StudyRun => {
  const file = mode.decision.file;
  if (!/\S/u.test(file))
    return refused(
      refusal(
        `${id}: its plan names no decision file (\`mode.decision.file\`); the run cannot be gated on nothing.`,
      ),
    );
  const blocked = unusable(paper, { id, folder }, mode, deps);
  if (blocked !== null) return refused(blocked);
  const g = gateLine(
    id,
    file,
    deps.git.committed(callerPath(paper), callerPath(join(paper, file))),
  );
  return g.open ? { ok: true, lines: [g.line] } : refused(refusal(g.line));
};

/** The refusal when the row of `id` names a folder that is not one inside `repro/`; null when none does. */
const escapingRow = (
  paper: string,
  shown: string,
  id: string,
  deps: GateDeps,
): StudyRefusal | null => {
  const r = registryOf(paper, deps);
  const row = (r.kind === "read" ? r.registry.studies : []).find(
    (x) => x.id === id && !isFolderName(x.folder),
  );
  return row === undefined
    ? null
    : refusal(
        `${id}: its row names the folder \`${row.folder}\`, which is not one folder inside ${shown}/${REPRO_DIR}/; nothing is read through it. Give the row its own folder's name.`,
      );
};

/** `studies gate`: 0 when the run may start, 1 with the reason when not. */
export function runGate(
  paper: string,
  shown: string,
  id: string,
  deps: GateDeps,
): StudyRun {
  const escaping = escapingRow(paper, shown, id, deps);
  if (escaping !== null) return refused(escaping);
  const s = modeStudies(paper, deps).find((m) => m.row.id === id);
  if (s === undefined)
    return refused(
      refusal(
        `${id} declares no mode in ${shown}: no row of ${shown}/${REPRO_DIR}/studies.json with this id names a plan.json that parses with \`mode\`. Lint the paper (\`npx paperlint lint\`) to see why.`,
      ),
    );
  return s.mode.kind === "decide_before_run"
    ? gateDecided(paper, s.row, s.mode, deps)
    : {
        ok: true,
        lines: [
          `${id} is exploratory (${s.mode.reason}): it has no gate, and its results are reported as exploratory.`,
        ],
      };
}
