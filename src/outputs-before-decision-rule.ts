/**
 * `repro/outputs-before-decision` — a study decided before its run shows that order in git's
 * history: every output entered history after the decision file did, and no output exists while the
 * decision is uncommitted. What is judged, and why, is `src/domain/decide-first.ts` and
 * docs/rules/repro/outputs-before-decision.md; this file finds the decide-first studies, lists their
 * folders, asks git through the `GitOrder` port, and reports.
 *
 * ── ONE QUESTION TO GIT PER PAPER ──────────────────────────────────────────────
 * The rule collects every decide-first study of the paper and its decision files FIRST, then asks git
 * once (`GitOrder.paper`: a handful of processes whatever the number of studies) and reads each
 * study's facts from that answer. It asked per study before: ~110 `--full-history` walks of the whole
 * repository, 50 s of a 70 s lint on a paper with about 115 studies. The findings are unchanged; why
 * they are, and what is asked, is in `src/adapters/git/index.ts`.
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
  firstOutputAfter,
  judgeOrder,
  orderMessage,
  type DecideFirstStudy,
  type GateHistory,
  type OrderFinding,
  type PlanThen,
} from "./domain/decide-first.ts";
import type { PlanGates } from "./domain/study-gates.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import type { DecideFirst } from "./domain/study-mode.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { GitOrder } from "./ports/git-history.ts";
import type { StudyDeps } from "./ports/study-deps.ts";
import { studyFolder } from "./study-folder.ts";
import { registryOf } from "./study-registry-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What the rule reads with: the registry's, and git's order. */
export interface OrderDeps extends StudyDeps {
  readonly git: GitOrder;
}

/**
 * Every decide-first study of the paper folder `paper`, with its tree and its history's order. Git is
 * asked ONCE for the whole paper (`GitOrder.paper`), after the studies and their decision files are
 * known, and each study reads its facts from that one answer.
 */
export const decideFirstStudies = (
  paper: string,
  deps: OrderDeps,
): readonly DecideFirstStudy[] => {
  const reader = studyFolder(paper, deps);
  const ready = readyStudies(paper, reader, deps);
  const history = deps.git.paper(
    callerPath(paper),
    ready.filter((r) => r.on.kind === "ok").map((r) => callerPath(r.decision)),
  );
  return ready.map(({ row, plan, mode, gates, folder, decision, on }) => {
    const study: DecideFirstStudy = {
      id: row.id,
      folder: row.folder,
      plan,
      mode,
      tree: reader.list(row.folder),
      facts:
        on.kind === "ok"
          ? history.order(callerPath(folder), callerPath(decision))
          : on,
    };
    return {
      ...study,
      gates: gateHistory(study, { now: gates, folder }, deps),
    };
  });
};

/** The decide-first studies with a ready plan, with the folder and decision file each names, before git is asked. */
const readyStudies = (
  paper: string,
  reader: ReturnType<typeof studyFolder>,
  deps: OrderDeps,
) =>
  pipe(
    modeStudies(registryOf(paper, deps), reader, deps.codec),
    filter(isDecidedAndReady),
    map(({ row, plan, mode, gates }) => ({
      row,
      plan,
      mode,
      gates,
      folder: join(paper, REPRO_DIR, row.folder),
      decision: join(paper, mode.decision.file),
      on: decisionEntry(reader, mode.decision.file),
    })),
  );

/**
 * The gates of a plan v2 now, and the plan at the study's first result after its decision (a
 * self-check in `mode.checks` is never it): none for a plan v1, a history not read, or a study with
 * no such result yet.
 */
const gateHistory = (
  s: DecideFirstStudy,
  from: { readonly now: PlanGates | null; readonly folder: string },
  deps: OrderDeps,
): GateHistory | undefined => {
  if (from.now === null || s.facts.kind !== "read") return undefined;
  const output = firstOutputAfter(s, s.facts.files);
  if (output === null) return undefined;
  const at = deps.git.fileAt(callerPath(from.folder), output.commit, s.plan);
  return { now: from.now, output, then: planThen(at, deps) };
};

/**
 * What the plan held at that commit, by gates — read for its gates alone: a plan v2 whose gates parse
 * there fixed them, even when another of its fields failed the schema at that commit (HEAD's plan is
 * `repro/study-registered`'s to judge, and this rule's question is only whether the gates came first).
 */
const planThen = (
  at: ReturnType<OrderDeps["git"]["fileAt"]>,
  deps: OrderDeps,
): PlanThen => {
  if (at.kind === "unknown") return at;
  if (at.kind === "absent") return { kind: "no-gates", why: "absent" };
  const declared = deps.codec.parseGates(at.text);
  return declared.kind === "gates"
    ? declared
    : { kind: "no-gates", why: declared.kind };
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
  "gates-changed",
  "gates-not-fixed",
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
