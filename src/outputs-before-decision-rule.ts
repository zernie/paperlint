/**
 * `repro/outputs-before-decision` — a study decided before its run shows that order in git's
 * history: every output entered history after the decision file did, and no output exists while the
 * decision is uncommitted. What is judged, and why, is `src/domain/decide-first.ts` and
 * docs/rules/repro/outputs-before-decision.md; this file finds the decide-first studies, lists their
 * folders, asks git through the `GitOrder` port, and reports.
 *
 * ── WHY A RULE MAY ASK GIT HERE ────────────────────────────────────────────────
 * `eslint-rules/` may not run git (eslint.config.mjs, `GIT_IN_A_RULE`): a pinned sha is deleted by a
 * squash or a gc, and a shallow CI checkout has none. This rule pins no sha. It asks the history the
 * checkout has for an ORDER, which a squash merge keeps when the decision was merged before the run
 * (the decide-first workflow), and it reports a shallow clone by name instead of judging it.
 *
 * Reported on `PIPELINE-STATUS.md`, first line, like the other `repro/` rules.
 */
import { basename, dirname, join } from "node:path";
import { filter, map, pipe } from "remeda";
import { callerPath } from "./caller-path.ts";
import { decisionEntry, modeStudies, type ModeStudy } from "./study-modes.ts";
import {
  judgeOrder,
  orderMessage,
  type DecideFirstStudy,
  type OrderFinding,
} from "./domain/decide-first.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import type { DecideFirst } from "./domain/study-mode.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { GitOrder } from "./ports/git-history.ts";
import type { StudyDeps } from "./study-deps.ts";
import { studyFolder } from "./study-folder.ts";
import { registryOf } from "./study-registry-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What the rule reads with: the registry's, and git's order. */
export interface OrderDeps extends StudyDeps {
  readonly git: GitOrder;
}

/** Every decide-first study of the paper folder `paper`, with its tree and its history's order. */
export const decideFirstStudies = (
  paper: string,
  deps: OrderDeps,
): readonly DecideFirstStudy[] => {
  const reader = studyFolder(paper, deps);
  return pipe(
    modeStudies(registryOf(paper, deps), reader, deps.codec),
    filter(isDecidedAndReady),
    map(({ row, plan, mode }): DecideFirstStudy => {
      const folder = join(paper, REPRO_DIR, row.folder);
      const decision = join(paper, mode.decision.file);
      const on = decisionEntry(reader, mode.decision.file);
      return {
        id: row.id,
        folder: row.folder,
        plan,
        mode,
        tree: reader.list(row.folder),
        facts:
          on.kind === "ok"
            ? deps.git.order(callerPath(folder), callerPath(decision))
            : on,
      };
    }),
  );
};

/** Only a ready plan decides: a draft may name no outputs, or an empty decision file. */
const isDecidedAndReady = (
  s: ModeStudy,
): s is ModeStudy & { readonly mode: DecideFirst } =>
  s.mode.kind === "decide_before_run" && s.empty.length === 0;

const PROBLEMS: readonly OrderFinding["problem"][] = [
  "decision-is-output",
  "decision-deleted",
  "decision-not-file",
  "decision-linked",
  "no-history",
  "shallow",
  "undecided-output",
  "output-before-decision",
];

const NAME = "repro/outputs-before-decision";

/** On `PIPELINE-STATUS.md`, every finding of every decide-first study of its paper, at its first line. */
const reportOn = (context: FolderRuleContext, deps: OrderDeps) => {
  if (basename(context.filename) !== STATUS_FILE) return {};
  return {
    root() {
      const at = context.sourceCode.getLocFromIndex(0);
      decideFirstStudies(dirname(context.filename), deps)
        .flatMap(judgeOrder)
        .forEach((f) => {
          context.report({
            loc: { start: at, end: at },
            messageId: f.problem,
            data: { text: orderMessage(f) },
          });
        });
    },
  };
};

/** The rule, reading the folder and git through `deps`. */
export const outputsBeforeDecisionRules = (
  deps: OrderDeps,
): Readonly<Record<"outputs-before-decision", FolderRuleModule>> => ({
  "outputs-before-decision": {
    meta: {
      type: "suggestion",
      docs: {
        description:
          "a study decided before its run shows it in git's history: every output entered history after its decision file, and none exists while the decision is uncommitted",
        url: rulePageUrl(NAME),
      },
      schema: [],
      messages: Object.fromEntries(PROBLEMS.map((p) => [p, "{{text}}"])),
    },
    create: (context) => reportOn(context, deps),
  },
});

/** Its level in paperlint's own config: an error. */
export const ORDER_RULE_LEVELS: Readonly<{
  "repro/outputs-before-decision": "error";
}> = { "repro/outputs-before-decision": "error" };
