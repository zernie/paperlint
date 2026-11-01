/**
 * What `repro/study-result` decides from a done study's plan v2 and its `result.json`
 * (`src/domain/study-result.ts`). Both halves: a result that shows every gate is silent, and so is a
 * lost claim said in so many words; each missing or failed gate is reported once, with a text that
 * stands alone.
 */
import { describe, expect, it } from "vitest";
import { PLAN_V2 } from "./study-gates.ts";
import type { StudyPlan } from "./study-registry.ts";
import {
  gatesOf,
  judgeResult,
  resultMessage,
  RESULT_PROBLEMS,
  type ResultFinding,
  type ResultState,
  type ResultStudy,
  type StudyResult,
} from "./study-result.ts";

const GOOD: StudyResult = {
  pass_rate: 0.7,
  kappa: { pass: 0.71, fits: 0.6 },
  self_test: { passed: 12, failed: 0 },
  funnel: { "timed out": 2, "clone failed": 0 },
  recall_audit: { files: 50, units_in_files: 95, extracted: 63 },
};

const study = (
  state: ResultState,
  over: Partial<ResultStudy> = {},
): ResultStudy => ({
  id: "P1-S01",
  folder: "P1-S01-x",
  we_lose_if: { result: "pass_rate", below: 0.5 },
  second_check: [
    { step: "pass", min_kappa: 0.6 },
    { step: "fits", min_kappa: 0.6 },
  ],
  self_test: { made_by: "selftest.mjs" },
  funnel: ["timed out", "clone failed"],
  recall_audit: { n_files: 50, min_recall: 0.6 },
  state,
  ...over,
});

const read = (result: StudyResult): ResultState => ({ kind: "read", result });
const judge = (result: StudyResult, over: Partial<ResultStudy> = {}) =>
  judgeResult(study(read(result), over));

describe("silent", () => {
  it("on a result that shows every gate, kappa exactly at its bar", () => {
    expect(judge(GOOD)).toEqual([]);
  });

  it("on a lost claim the result says is lost, and on every gate none", () => {
    expect(judge({ ...GOOD, pass_rate: 0.4, claim: "lost" })).toEqual([]);
    expect(
      judge(
        {},
        {
          we_lose_if: null,
          second_check: "none",
          self_test: "none",
          funnel: "none",
          recall_audit: "none",
        },
      ),
    ).toEqual([]);
  });

  it("above: a claim loses only past its threshold", () => {
    const over = { we_lose_if: { result: "fp_rate", above: 0.1 } };
    expect(judge({ ...GOOD, fp_rate: 0.1 }, over)).toEqual([]);
    expect(
      judge({ ...GOOD, fp_rate: 0.2 }, over).map((f) => f.problem),
    ).toEqual(["claim-lost"]);
  });
});

describe("reported", () => {
  it("the file absent, reached through a link, or unreadable", () => {
    expect(
      [
        study({ kind: "absent" }),
        study({ kind: "linked", link: "data" }),
        study({ kind: "unreadable", why: "not JSON" }),
      ].flatMap(judgeResult),
    ).toEqual([
      { problem: "no-result-file", id: "P1-S01" },
      { problem: "result-linked", id: "P1-S01", link: "data" },
      { problem: "result-unreadable", id: "P1-S01", why: "not JSON" },
    ]);
  });

  it("the claim's number missing, lost unsaid, or said lost while it holds", () => {
    expect(judge({ ...GOOD, pass_rate: undefined })).toEqual([
      { problem: "no-number", id: "P1-S01", key: "pass_rate" },
    ]);
    expect(judge({ ...GOOD, pass_rate: 0.4 })).toEqual([
      {
        problem: "claim-lost",
        id: "P1-S01",
        key: "pass_rate",
        value: 0.4,
        threshold: "below 0.5",
      },
    ]);
    expect(judge({ ...GOOD, claim: "lost" })).toEqual([
      {
        problem: "claim-holds",
        id: "P1-S01",
        key: "pass_rate",
        value: 0.7,
        threshold: "below 0.5",
      },
    ]);
  });

  it("a kappa missing or below its bar; a self-test missing or failed; a funnel reason uncounted", () => {
    expect(
      judge({
        pass_rate: 0.7,
        kappa: { pass: 0.59 },
        funnel: { "timed out": 1 },
        recall_audit: GOOD.recall_audit,
      }),
    ).toEqual([
      { problem: "kappa", id: "P1-S01", step: "pass", min: 0.6, got: 0.59 },
      { problem: "kappa", id: "P1-S01", step: "fits", min: 0.6, got: null },
      { problem: "self-test", id: "P1-S01", failed: null },
      { problem: "funnel", id: "P1-S01", missing: ["clone failed"] },
    ]);
    expect(judge({ ...GOOD, self_test: { passed: 3, failed: 2 } })).toEqual([
      { problem: "self-test", id: "P1-S01", failed: 2 },
    ]);
  });
});

describe("resultMessage", () => {
  const LOST: ResultFinding = {
    problem: "claim-lost",
    id: "P1-S01",
    key: "pass_rate",
    value: 0.4,
    threshold: "below 0.5",
  };
  const ALL: readonly ResultFinding[] = [
    { problem: "no-result-file", id: "P1-S01" },
    { problem: "result-linked", id: "P1-S01", link: "data" },
    { problem: "result-unreadable", id: "P1-S01", why: "not JSON" },
    { problem: "no-number", id: "P1-S01", key: "pass_rate" },
    {
      problem: "claim-lost",
      id: "P1-S01",
      key: "pass_rate",
      value: 0.4,
      threshold: "below 0.5",
    },
    {
      problem: "claim-holds",
      id: "P1-S01",
      key: "pass_rate",
      value: 0.7,
      threshold: "below 0.5",
    },
    { problem: "kappa", id: "P1-S01", step: "pass", min: 0.6, got: 0.4 },
    { problem: "kappa", id: "P1-S01", step: "pass", min: 0.6, got: null },
    { problem: "self-test", id: "P1-S01", failed: 2 },
    { problem: "self-test", id: "P1-S01", failed: null },
    { problem: "funnel", id: "P1-S01", missing: ["a", "b"] },
    { problem: "no-recall-audit", id: "P1-S01" },
    { problem: "recall-sample", id: "P1-S01", files: 30, min_files: 50 },
    { problem: "recall", id: "P1-S01", extracted: 63, units: 95, min: 0.7 },
  ];

  it("every problem has a text that names the study, says what to do and links the page", () => {
    // Guards: each message stands alone — no reader needs the rule's source to act on it.
    expect(
      ALL.map((f) => {
        const m = resultMessage(f);
        return (
          m.includes("`P1-S01`") &&
          m.includes("What to do:") &&
          m.endsWith("docs/rules/repro/study-result.md")
        );
      }),
    ).toEqual(ALL.map(() => true));
    expect([...new Set(ALL.map((f) => f.problem))]).toEqual(RESULT_PROBLEMS);
  });

  it("a lost claim says LOST, the number and the threshold fixed before the run", () => {
    expect(resultMessage(LOST).split("\n")[0]).toBe(
      '`P1-S01`\'s claim LOST: its `pass_rate` is 0.4, below 0.5, the threshold its plan fixed before the run. What to do: report the loss in the paper, and say so in `result.json` with `"claim": "lost"`; the threshold is not moved after the run.',
    );
  });
});

describe("recall_audit", () => {
  it("a recall audit missing, on fewer files than the plan fixed, or below its least recall", () => {
    expect(judge({ ...GOOD, recall_audit: undefined })).toEqual([
      { problem: "no-recall-audit", id: "P1-S01" },
    ]);
    expect(
      judge({
        ...GOOD,
        recall_audit: { files: 30, units_in_files: 60, extracted: 30 },
      }),
    ).toEqual([
      { problem: "recall-sample", id: "P1-S01", files: 30, min_files: 50 },
      {
        problem: "recall",
        id: "P1-S01",
        extracted: 30,
        units: 60,
        min: 0.6,
      },
    ]);
    // Guards: exactly at the bar is enough; a recall of 60 of 100 is 0.6.
    expect(
      judge({
        ...GOOD,
        recall_audit: { files: 50, units_in_files: 100, extracted: 60 },
      }),
    ).toEqual([]);
  });
  it("a recall below its bar gives the counts, the recall and the bar", () => {
    expect(
      resultMessage({
        problem: "recall",
        id: "P1-S01",
        extracted: 63,
        units: 95,
        min: 0.7,
      }).split("\n")[0],
    ).toBe(
      "`P1-S01`: the extractor found 63 of the 95 units a person found reading the audited files in full, a recall of 0.663, below the 0.7 its plan fixed before the run — the extractor misses too much. What to do: report the recall as a limit of the number, or fix the extractor and audit again; the bar is not lowered after the fact.",
    );
  });
});

describe("gatesOf — the gates of a plan, only when every one is decided", () => {
  const PLAN: StudyPlan = {
    $schema: PLAN_V2,
    question: "q",
    population: { source: "s", draw: { kind: "all", method: "census" } },
    arms: [],
    primary_outcome: "o",
    author_check: null,
    mode: {
      kind: "decide_before_run",
      outputs: ["result.json"],
      decision: { file: "d.md", note: "n" },
      we_lose_if: { result: "x", above: 1 },
    },
    second_check: "none",
    self_test: "none",
    funnel: "none",
    recall_audit: "none",
  };

  it("reads a plan v2's gates, and none of a plan v1 or one with a gate undecided", () => {
    const undecided: readonly StudyPlan[] = [
      { ...PLAN, second_check: undefined },
      { ...PLAN, second_check: null },
      { ...PLAN, self_test: null },
      { ...PLAN, funnel: null },
      { ...PLAN, recall_audit: null },
    ];
    expect(gatesOf(PLAN)).toEqual({
      we_lose_if: { result: "x", above: 1 },
      second_check: "none",
      self_test: "none",
      funnel: "none",
      recall_audit: "none",
    });
    // Guards: a gate absent or null is never read as decided.
    expect(undecided.map(gatesOf)).toEqual(undecided.map(() => null));
  });

  it("has no claim for an exploratory plan, or a decide-first mode without we_lose_if", () => {
    const noClaim = {
      kind: "decide_before_run" as const,
      outputs: [],
      decision: { file: "d.md", note: "n" },
    };
    expect(
      [
        { ...PLAN, mode: { kind: "exploratory" as const, reason: "r" } },
        { ...PLAN, mode: noClaim },
        { ...PLAN, mode: undefined },
      ].map((p) => gatesOf(p)?.we_lose_if),
    ).toEqual([null, null, null]);
  });
});
