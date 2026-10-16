/**
 * `paper/study-mode-claim` (error) and `paper/study-mode-stated` (warn): what `paper.tex` says of its
 * studies' modes, against the registry, the plans and git's history. The judges are
 * `src/domain/study-claims.ts`; this file reads the paper, its `% study:` links, and each study's
 * standing, and reports. Two rules because ESLint sets the level per rule: an overclaim is an error,
 * an unlabelled exploratory number a warning.
 */
import { dirname } from "node:path";
import { modeStudies } from "./blind-plaintext-rule.ts";
import { judgeOrder, type OrderFinding } from "./domain/decide-first.ts";
import {
  judgeClaims,
  judgeLabels,
  type ClaimFinding,
  type StudyStanding,
} from "./domain/study-claims.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import {
  decideFirstStudies,
  type OrderDeps,
} from "./outputs-before-decision-rule.ts";
import { registryOf } from "./study-registry-rule.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import type { Located, TexRuleModule } from "./tex-venue-rules.ts";
import { rulePageUrl } from "./venue-rules.ts";

/** What the rules read with: the paper's prose, and the paper's studies. */
export interface StudyClaimDeps {
  readonly prose: ProseDeps;
  readonly studies: OrderDeps;
}

/** The order findings that mean the history does not show the decision first. */
const NOT_SHOWN: readonly OrderFinding["problem"][] = [
  "output-before-decision",
  "undecided-output",
  "decision-is-output",
];

/** A mode as the text's claims see it; a decide-first study's `shown` comes from its history. */
const standingOf = (mode: StudyMode, shown: boolean): StudyStanding => {
  switch (mode.kind) {
    case "decide_before_run":
      return { kind: "decided", shown };
    case "blind":
      return { kind: "blind" };
    case "exploratory":
      return { kind: "exploratory", reason: mode.reason };
  }
};

/**
 * Every registered study's standing, by id: its mode, and for a decide-first study whether its
 * history shows the decision first (a history that cannot be read is `repro/outputs-before-decision`'s
 * to report, and counts as shown here). A row whose plan declares no mode is `none`.
 */
export const standings = (
  paper: string,
  deps: OrderDeps,
): ReadonlyMap<string, StudyStanding> => {
  const r = registryOf(paper, deps);
  const modes = new Map(
    modeStudies(paper, deps).map((m) => [m.row.id, m.mode]),
  );
  const broken = new Set(
    decideFirstStudies(paper, deps)
      .filter((s) => judgeOrder(s).some((f) => NOT_SHOWN.includes(f.problem)))
      .map((s) => s.id),
  );
  return new Map(
    (r.kind === "read" ? r.registry.studies : []).map((s) => {
      const mode = modes.get(s.id);
      return [
        s.id,
        mode === undefined
          ? { kind: "none" }
          : standingOf(mode, !broken.has(s.id)),
      ] as const;
    }),
  );
};

const WHY: Readonly<
  Record<"exploratory" | "no-mode" | "order-not-shown", string>
> = {
  exploratory: "its plan declares it exploratory",
  "no-mode": "its plan declares no mode",
  "order-not-shown":
    "it is declared decided before its run, but its history does not show the decision first (see `repro/outputs-before-decision`)",
};

/** A claim finding as the rule reports it. */
const claimLocated = (f: ClaimFinding): Located =>
  f.problem === "unknown-study"
    ? {
        messageId: "unknownStudy",
        data: { id: f.id },
        at: { start: f.at, end: f.at },
      }
    : {
        messageId: "overclaim",
        data: { id: f.id, word: f.word, why: WHY[f.why] },
        at: f.at,
      };

/** A rule over `paper.tex` that judges its linked paragraphs with `judge`. */
const ruleOf = (
  meta: TexRuleModule["meta"],
  judge: (src: string, deps: StudyClaimDeps, dir: string) => readonly Located[],
  deps: StudyClaimDeps,
): TexRuleModule => ({
  meta,
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        const paper = readPaper(
          context.filename,
          sc.raw ?? sc.text,
          deps.prose,
        );
        reportInPaper(
          context,
          meta.messages,
          paper,
          judge(paper.text, deps, dirname(context.filename)),
        );
      },
    };
  },
});

/** The links of `src`, and — only when there is one — the studies' standings and the passages. */
const read = (src: string, deps: StudyClaimDeps, dir: string) => {
  const marks = deps.prose.latex.studyMarks(src);
  return marks.length === 0
    ? null
    : {
        marks,
        passages: deps.prose.latex.bodyProse(src),
        standings: standings(dir, deps.studies),
      };
};

const CLAIM_META: TexRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "a paragraph linked to a study (`% study: <id>`) calls it pre-registered, decided before its run, or blind only when its plan and history say so; every link names a registered study",
    url: rulePageUrl("paper/study-mode-claim"),
  },
  schema: [],
  messages: {
    overclaim:
      "This paragraph is linked to {{id}} and calls it «{{word}}», but {{why}}. What to do: say what the study is — exploratory, with its reason — or link the paragraph to the study that was decided first.",
    unknownStudy:
      "`% study: {{id}}` names no study in repro/studies.json. What to do: correct the id, or register the study (`npx paperlint studies new`).",
  },
};

const STATED_META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a paragraph that states a number from an exploratory study says that it is exploratory",
    url: rulePageUrl("paper/study-mode-stated"),
  },
  schema: [],
  messages: {
    unlabelled:
      "This paragraph states {{number}} from {{id}}, an exploratory study, and never says so. What to do: label the result exploratory in this paragraph — a reader must not take it for a tested prediction.",
  },
};

/** The two rules, reading the paper and its studies through `deps`. */
export const studyClaimRules = (
  deps: StudyClaimDeps,
): Readonly<
  Record<"study-mode-claim" | "study-mode-stated", TexRuleModule>
> => ({
  "study-mode-claim": ruleOf(
    CLAIM_META,
    (src, d, dir) => {
      const r = read(src, d, dir);
      return r === null
        ? []
        : judgeClaims(src, r.passages, r.marks, r.standings).map(claimLocated);
    },
    deps,
  ),
  "study-mode-stated": ruleOf(
    STATED_META,
    (src, d, dir) => {
      const r = read(src, d, dir);
      return r === null
        ? []
        : judgeLabels(src, r.passages, r.marks, r.standings).map((f) => ({
            messageId: "unlabelled",
            data: { id: f.id, number: f.number },
            at: f.at,
          }));
    },
    deps,
  ),
});

/** Their levels in paperlint's own config. */
export const STUDY_CLAIM_RULE_LEVELS: Readonly<{
  "paper/study-mode-claim": "error";
  "paper/study-mode-stated": "warn";
}> = { "paper/study-mode-claim": "error", "paper/study-mode-stated": "warn" };
