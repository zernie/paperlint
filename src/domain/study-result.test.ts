/**
 * What `repro/study-result` decides from a done study's plan v2 and its `result.json`
 * (`src/domain/study-result.ts`). Both halves: a result that shows every gate is silent, and so is a
 * lost claim said in so many words; each missing or failed gate is reported once, with a text that
 * stands alone.
 */
import { describe, expect, it } from "vitest";
import {
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
    const { pass_rate: _p, ...noNumber } = GOOD;
    expect(judge(noNumber)).toEqual([
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
    expect(resultMessage(ALL[4] as ResultFinding).split("\n")[0]).toBe(
      '`P1-S01`\'s claim LOST: its `pass_rate` is 0.4, below 0.5, the threshold its plan fixed before the run. What to do: report the loss in the paper, and say so in `result.json` with `"claim": "lost"`; the threshold is not moved after the run.',
    );
  });
});
