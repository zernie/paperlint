/**
 * The schema of a plan v2's gates (src/domain/study-gates.ts). Both halves: a plan v2 with every gate
 * parses to itself, ready, and a plan v1 stays as it was; every gate missing, misplaced or malformed
 * is refused with its reason; a gate still null keeps the plan a draft naming it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { PLAN_V2 } from "../../domain/study-gates.ts";
import type { DecideFirst } from "../../domain/study-mode.ts";
import { planText, type StudyPlan } from "../../domain/study-registry.ts";
import { planV2JsonSchema, studyRegistryCodec } from "./index.ts";

const DECIDED: DecideFirst = {
  kind: "decide_before_run",
  outputs: ["result.json"],
  decision: { file: "repro/P1-S01-x/decision.md", note: "the draw" },
};

const V1: StudyPlan = {
  question: "Do the readings disagree?",
  population: {
    source: "repositories, 2026-10-31",
    draw: { kind: "seeded", method: "one rule per repository", seed: 7 },
  },
  arms: [],
  primary_outcome: "share of rules whose readings disagree",
  author_check: null,
  mode: DECIDED,
};

const V2: StudyPlan = {
  ...V1,
  $schema: PLAN_V2,
  mode: { ...DECIDED, we_lose_if: { result: "share_upper95", below: 0.2 } },
  second_check: [
    { step: "lint-checkable", min_kappa: 0.6 },
    { step: "admissible", min_kappa: 0.6 },
  ],
  self_test: { made_by: "scripts/selftest.mjs" },
  funnel: ["no linter rule", "clone failed"],
};

const parse = (p: unknown) =>
  studyRegistryCodec.parsePlan(JSON.stringify(p), "measurement");
const why = (p: unknown): string => {
  const r = parse(p);
  return r.kind === "unreadable" ? r.why : r.kind;
};
const empty = (p: unknown) => {
  const r = parse(p);
  return r.kind === "draft" ? r.empty : r.kind;
};

it("a plan v2 with every gate parses to itself, ready; a plan v1 stays ready", () => {
  // Guards: the v2 fields round-trip through the text planText writes, and v1 is unchanged.
  expect(
    [V1, V2].map((p) =>
      studyRegistryCodec.parsePlan(planText(p), "measurement"),
    ),
  ).toEqual([
    { kind: "ready", plan: V1 },
    { kind: "ready", plan: V2 },
  ]);
});

it('"none" is a gate decided: a census with nothing labelled, tested or dropped is ready', () => {
  const p = {
    ...V2,
    mode: { ...DECIDED, we_lose_if: { result: "rate", above: 0.1 } },
    second_check: "none",
    self_test: "none",
    funnel: "none",
  };
  // Guards: "not this study" has one spelling, and it is a decision, not a gap.
  expect(parse(p)).toEqual({ kind: "ready", plan: p });
});

it("every gate still null keeps the plan a draft naming it", () => {
  const p = {
    ...V2,
    mode: { ...DECIDED, we_lose_if: null },
    second_check: null,
    self_test: null,
    funnel: null,
  };
  // Guards: null is "not decided yet" — the study may not run on it.
  expect(empty(p)).toEqual([
    "mode.we_lose_if",
    "second_check",
    "self_test",
    "funnel",
  ]);
});

it("a plan v2 that leaves a gate out is no plan, the gate named", () => {
  const { funnel: _f, ...noFunnel } = V2;
  const { we_lose_if: _w, ...modeWithout } = V2.mode as DecideFirst;
  // Guards: a forgotten gate cannot be written — only "none" or null say "not this one".
  expect(why(noFunnel)).toMatch(/^funnel: is missing, and a plan v2/u);
  expect(why({ ...V2, mode: modeWithout })).toMatch(
    /^mode\.we_lose_if: is missing/u,
  );
});

it("a plan without $schema that carries a gate is refused: nobody would read it", () => {
  // Guards: a v1 plan cannot half-declare the gates.
  expect(why({ ...V1, funnel: "none" })).toBe(
    `funnel: is a field of a plan v2 — add "$schema": "${PLAN_V2}"`,
  );
});

it("an exploratory mode cannot carry we_lose_if, and an exploratory plan v2 needs none", () => {
  const exploratory = { kind: "exploratory", reason: "a first look" };
  // Guards: no claim, no falsifier — the shape refuses one.
  expect(why({ ...V2, mode: { ...exploratory, we_lose_if: null } })).toContain(
    "we_lose_if",
  );
  expect(parse({ ...V2, mode: exploratory }).kind).toBe("ready");
});

it("each malformed gate is refused", () => {
  const bad: readonly unknown[] = [
    { ...V2, $schema: "https://example.com/plan.json" },
    {
      ...V2,
      mode: { ...DECIDED, we_lose_if: { result: "x", below: 1, above: 2 } },
    },
    { ...V2, mode: { ...DECIDED, we_lose_if: { result: "x" } } },
    { ...V2, second_check: [] },
    { ...V2, second_check: [{ step: "a", min_kappa: 0 }] },
    { ...V2, second_check: [{ step: "a", min_kappa: 1.2 }] },
    {
      ...V2,
      second_check: [
        { step: "a", min_kappa: 0.6 },
        { step: "a", min_kappa: 0.7 },
      ],
    },
    { ...V2, self_test: "n/a" },
    { ...V2, self_test: { made_by: "../outside.mjs" } },
    { ...V2, self_test: { must_catch: "bad.js" } },
    { ...V2, funnel: [] },
    { ...V2, funnel: ["clone failed", "clone failed"] },
  ];
  // Guards: each of these is refused — none parses to a plan.
  expect(bad.map((p) => parse(p).kind)).toEqual(bad.map(() => "unreadable"));
  expect(why(bad[6])).toContain("the step «a» is listed more than once");
  expect(why(bad[11])).toContain("the reason «clone failed»");
});

it("the shipped schemas/plan.v2.schema.json is the one the parser generates", () => {
  const shipped: unknown = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../schemas/plan.v2.schema.json",
      ),
      "utf8",
    ),
  );
  // Guards: an editor's suggestions for a plan v2 never drift from what the parser accepts.
  expect(shipped).toEqual(planV2JsonSchema());
});
