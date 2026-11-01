/**
 * WHAT A STUDY'S RUN SHOWED, AGAINST WHAT ITS PLAN V2 FIXED — `repro/study-result`
 * (docs/rules/repro/study-result.md, src/domain/study-gates.ts).
 *
 * A study whose plan is v2 writes its numbers to `result.json` beside the plan; the study's own
 * script produces the facts, this module judges them. For a study that is `done`:
 *
 *   we_lose_if     the number it names is in the file; when it crosses the threshold the file says
 *                  `"claim": "lost"` — a loss is written where the paper reads its numbers, never
 *                  left for a reader to work out — and it never says so of a claim that holds.
 *   second_check   each step's kappa is in `kappa`, and at least its `min_kappa`.
 *   self_test      `self_test` holds `passed` and `failed`, and `failed` is 0.
 *   funnel         `funnel` counts every declared reason.
 *   recall_audit   `recall_audit` gives the files a person read in full, the units found there, and
 *                  how many of them the extractor found; at least `n_files` files, and a recall
 *                  (extracted / units) of at least `min_recall`. The counts, not a recall the study
 *                  computed: the files are checked against the plan, and the share is computed here.
 *
 * A gate that is `"none"` asks nothing of the file. Pure.
 */
import {
  loses,
  thresholdText,
  RESULT_FILE,
  type Funnel,
  type RecallAudit,
  type RecallAuditPlan,
  type SecondCheck,
  type SelfTest,
  type WeLoseIf,
} from "./study-gates.ts";
import type { StudyPlan } from "./study-registry.ts";

/** The value a study's result says its claim has, when its number crossed `we_lose_if`. */
export const CLAIM_LOST = "lost";

/** What a person found reading the audited files in full, and how many of those units the extractor found. */
export interface RecallCounts {
  readonly files: number;
  readonly units_in_files: number;
  readonly extracted: number;
}

/** A study's `result.json`: its own numbers by name, and the five parts the gates read. */
export interface StudyResult {
  readonly claim?: typeof CLAIM_LOST | undefined;
  readonly kappa?: Readonly<Record<string, number>> | undefined;
  readonly self_test?:
    { readonly passed: number; readonly failed: number } | undefined;
  readonly funnel?: Readonly<Record<string, number>> | undefined;
  readonly recall_audit?: RecallCounts | undefined;
  readonly [key: string]: unknown;
}

/** A `result.json`'s text, parsed: the result, or why it is none. */
export type ParsedResult =
  | { readonly kind: "read"; readonly result: StudyResult }
  | { readonly kind: "unreadable"; readonly why: string };

/** What the study's folder holds of `result.json`. */
export type ResultState =
  | { readonly kind: "absent" }
  | { readonly kind: "linked"; readonly link: string }
  | ParsedResult;

/** A done study of a ready plan v2: its gates, and what its folder holds of its result. */
export interface ResultStudy {
  readonly id: string;
  readonly folder: string;
  /** null: an exploratory study, which has no claim to lose. */
  readonly we_lose_if: WeLoseIf | null;
  readonly second_check: SecondCheck;
  readonly self_test: SelfTest;
  readonly funnel: Funnel;
  readonly recall_audit: RecallAudit;
  readonly state: ResultState;
}

/** The gates a ready plan v2 declares, as the judge reads them. */
export type Gates = Pick<
  ResultStudy,
  "we_lose_if" | "second_check" | "self_test" | "funnel" | "recall_audit"
>;

/** Whether a gate is decided: neither absent (a plan v1) nor null (not decided yet). */
const decided = <T>(g: T | null | undefined): g is T =>
  g !== null && g !== undefined;

/**
 * The gates of plan `p`, when every one is decided; null for a plan v1 or a draft. An exploratory
 * plan, or one whose mode carries no `we_lose_if`, has no claim to lose.
 */
export const gatesOf = (p: StudyPlan): Gates | null => {
  const { second_check, self_test, funnel, recall_audit, mode } = p;
  if (
    !decided(second_check) ||
    !decided(self_test) ||
    !decided(funnel) ||
    !decided(recall_audit)
  )
    return null;
  const w = mode?.kind === "decide_before_run" ? mode.we_lose_if : null;
  return {
    we_lose_if: decided(w) ? w : null,
    second_check,
    self_test,
    funnel,
    recall_audit,
  };
};

/** One defect of a study's result. */
export type ResultFinding =
  | { readonly problem: "no-result-file"; readonly id: string }
  | {
      readonly problem: "result-linked";
      readonly id: string;
      readonly link: string;
    }
  | {
      readonly problem: "result-unreadable";
      readonly id: string;
      readonly why: string;
    }
  | { readonly problem: "no-number"; readonly id: string; readonly key: string }
  | {
      readonly problem: "claim-lost";
      readonly id: string;
      readonly key: string;
      readonly value: number;
      readonly threshold: string;
    }
  | {
      readonly problem: "claim-holds";
      readonly id: string;
      readonly key: string;
      readonly value: number;
      readonly threshold: string;
    }
  | {
      readonly problem: "kappa";
      readonly id: string;
      readonly step: string;
      readonly min: number;
      readonly got: number | null;
    }
  | {
      readonly problem: "self-test";
      readonly id: string;
      readonly failed: number | null;
    }
  | {
      readonly problem: "funnel";
      readonly id: string;
      readonly missing: readonly string[];
    }
  | { readonly problem: "no-recall-audit"; readonly id: string }
  | {
      readonly problem: "recall-sample";
      readonly id: string;
      readonly files: number;
      readonly min_files: number;
    }
  | {
      readonly problem: "recall";
      readonly id: string;
      readonly extracted: number;
      readonly units: number;
      readonly min: number;
    };

/** What `we_lose_if` asks of `r`: the number, and a loss said in so many words. */
const claimFindings = (
  id: string,
  w: WeLoseIf,
  r: StudyResult,
): readonly ResultFinding[] => {
  const value = r[w.result];
  if (typeof value !== "number")
    return [{ problem: "no-number", id, key: w.result }];
  const lost = loses(w, value);
  const said = r.claim === CLAIM_LOST;
  if (lost === said) return [];
  const at = { id, key: w.result, value, threshold: thresholdText(w) };
  return [
    lost ? { problem: "claim-lost", ...at } : { problem: "claim-holds", ...at },
  ];
};

/** What `second_check` asks of `r`: each step's kappa, at least its least. */
const kappaFindings = (
  id: string,
  c: SecondCheck,
  r: StudyResult,
): readonly ResultFinding[] =>
  c === "none"
    ? []
    : c.flatMap((s): readonly ResultFinding[] => {
        const got = r.kappa?.[s.step] ?? null;
        return got !== null && got >= s.min_kappa
          ? []
          : [{ problem: "kappa", id, step: s.step, min: s.min_kappa, got }];
      });

/** What `self_test` asks of `r`: its counts, none failed. */
const selfTestFindings = (
  id: string,
  t: SelfTest,
  r: StudyResult,
): readonly ResultFinding[] => {
  if (t === "none") return [];
  const failed = r.self_test?.failed ?? null;
  return failed === 0 ? [] : [{ problem: "self-test", id, failed }];
};

/** What `funnel` asks of `r`: a count for every reason. */
const funnelFindings = (
  id: string,
  f: Funnel,
  r: StudyResult,
): readonly ResultFinding[] => {
  if (f === "none") return [];
  const missing = f.filter((reason) => r.funnel?.[reason] === undefined);
  return missing.length === 0 ? [] : [{ problem: "funnel", id, missing }];
};

/** The audit's file count against the plan's: too few files is a finding. */
const sampleFindings = (
  id: string,
  a: RecallAuditPlan,
  c: RecallCounts,
): readonly ResultFinding[] =>
  c.files < a.n_files
    ? [{ problem: "recall-sample", id, files: c.files, min_files: a.n_files }]
    : [];

/** The recall the counts give, against the plan's least. */
const shareFindings = (
  id: string,
  a: RecallAuditPlan,
  c: RecallCounts,
): readonly ResultFinding[] =>
  c.extracted / c.units_in_files < a.min_recall
    ? [
        {
          problem: "recall",
          id,
          extracted: c.extracted,
          units: c.units_in_files,
          min: a.min_recall,
        },
      ]
    : [];

/** What `recall_audit` asks of `r`: the counts, on enough files, with a recall at least its least. */
const recallFindings = (
  id: string,
  a: RecallAudit,
  r: StudyResult,
): readonly ResultFinding[] => {
  if (a === "none") return [];
  const c = r.recall_audit;
  if (c === undefined) return [{ problem: "no-recall-audit", id }];
  return [...sampleFindings(id, a, c), ...shareFindings(id, a, c)];
};

/** Every defect of one study's result, in the order of its gates. */
export const judgeResult = (s: ResultStudy): readonly ResultFinding[] => {
  const st = s.state;
  switch (st.kind) {
    case "absent":
      return [{ problem: "no-result-file", id: s.id }];
    case "linked":
      return [{ problem: "result-linked", id: s.id, link: st.link }];
    case "unreadable":
      return [{ problem: "result-unreadable", id: s.id, why: st.why }];
    case "read":
      return [
        ...(s.we_lose_if === null
          ? []
          : claimFindings(s.id, s.we_lose_if, st.result)),
        ...kappaFindings(s.id, s.second_check, st.result),
        ...selfTestFindings(s.id, s.self_test, st.result),
        ...funnelFindings(s.id, s.funnel, st.result),
        ...recallFindings(s.id, s.recall_audit, st.result),
      ];
  }
};

const RULE = "repro/study-result";
const tick = (s: string): string => `\`${s}\``;

/** Each finding by its problem. */
type FindingOf = { readonly [F in ResultFinding as F["problem"]]: F };
type Problem = keyof FindingOf;

/** The text of each finding: what is wrong, and what to do. */
const HEADS: { readonly [P in Problem]: (f: FindingOf[P]) => string } = {
  "no-result-file": (f) =>
    `${tick(f.id)} is \`done\` and its plan is v2, but its folder has no ${tick(RESULT_FILE)}. What to do: have the study's script write its numbers there — the one its \`we_lose_if\` names, \`kappa\`, \`self_test\` and \`funnel\` as its plan declares them.`,
  "result-linked": (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} passes through the symbolic link ${tick(f.link)}; nothing is read through a link. What to do: write the file itself in the study's folder.`,
  "result-unreadable": (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} is not a study result: ${f.why}. What to do: give it the shape on the rule's page.`,
  "no-number": (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} has no number ${tick(f.key)}, the one its plan's \`we_lose_if\` names. What to do: write it there, or correct \`we_lose_if.result\` — before the run, never after.`,
  "claim-lost": (f) =>
    `${tick(f.id)}'s claim LOST: its ${tick(f.key)} is ${String(f.value)}, ${f.threshold}, the threshold its plan fixed before the run. What to do: report the loss in the paper, and say so in ${tick(RESULT_FILE)} with \`"claim": "${CLAIM_LOST}"\`; the threshold is not moved after the run.`,
  "claim-holds": (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} says \`"claim": "${CLAIM_LOST}"\`, but its ${tick(f.key)} is ${String(f.value)}, not ${f.threshold}: by its plan the claim holds. What to do: remove \`claim\`, or correct the number.`,
  kappa: (f) =>
    f.got === null
      ? `The ${tick(RESULT_FILE)} of ${tick(f.id)} has no kappa for the step ${tick(f.step)} its plan's \`second_check\` declares. What to do: write it in \`kappa.${f.step}\`.`
      : `${tick(f.id)}: the two raters of the step ${tick(f.step)} agree with kappa ${String(f.got)}, below the ${String(f.min)} its plan fixed before labelling. What to do: the labels of that step do not carry a number — revise the codebook and label again, or report the step as unreliable; the threshold is not lowered after the fact.`,
  "self-test": (f) =>
    f.failed === null
      ? `The ${tick(RESULT_FILE)} of ${tick(f.id)} has no \`self_test\` counts, and its plan declares a self-test. What to do: write \`"self_test": { "passed": n, "failed": n }\` from the run on the known answers.`
      : `${tick(f.id)}: ${String(f.failed)} self-test case(s) failed — a check that misses a known answer counts nothing. What to do: fix the check or leave it out of the count, and run the self-test again.`,
  funnel: (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} counts no drop for ${f.missing.map(tick).join(", ")}, declared in its plan's \`funnel\`. What to do: write each in \`funnel\`, 0 when none was dropped for it.`,
  "no-recall-audit": (f) =>
    `The ${tick(RESULT_FILE)} of ${tick(f.id)} has no \`recall_audit\` counts, and its plan declares a recall audit. What to do: have a person read the sampled files in full and write \`"recall_audit": { "files": n, "units_in_files": n, "extracted": n }\`.`,
  "recall-sample": (f) =>
    `${tick(f.id)}: its recall audit read ${String(f.files)} file(s) in full, fewer than the ${String(f.min_files)} its plan fixed. What to do: audit the remaining files of the sample before the recall is reported.`,
  recall: (f) =>
    `${tick(f.id)}: the extractor found ${String(f.extracted)} of the ${String(f.units)} units a person found reading the audited files in full, a recall of ${(f.extracted / f.units).toFixed(3)}, below the ${String(f.min)} its plan fixed before the run — the extractor misses too much. What to do: report the recall as a limit of the number, or fix the extractor and audit again; the bar is not lowered after the fact.`,
};

const headOf = <P extends Problem>(p: P, f: FindingOf[P]): string =>
  HEADS[p](f);

/** The one text a finding is reported with. */
export const resultMessage = (f: ResultFinding): string =>
  `${headOf(f.problem, f)}\nRule ${RULE}: https://github.com/zernie/paperlint/blob/main/docs/rules/${RULE}.md`;

/** Every problem the rule reports, each its own message id. */
export const RESULT_PROBLEMS: readonly Problem[] = [
  "no-result-file",
  "result-linked",
  "result-unreadable",
  "no-number",
  "claim-lost",
  "claim-holds",
  "kappa",
  "self-test",
  "funnel",
  "no-recall-audit",
  "recall-sample",
  "recall",
];
