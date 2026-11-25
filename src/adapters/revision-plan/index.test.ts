/**
 * The parser of a paper's `revision-plan.json`: a valid plan becomes the value whole, and each planted
 * defect is one problem at the path of its field.
 */
import { describe, expect, it } from "vitest";
import { PLAN, planText } from "../../../test/revision-plan-fixture.ts";
import { parseRevisionPlan, revisionPlanCodec } from "./index.ts";

/** The plan with `fields` set over its own; a field set to undefined is left out. */
const planWith = (fields: Readonly<Record<string, unknown>>): string =>
  planText({ ...PLAN, ...fields });

/** The plan with row `i` replaced by `row`. */
const withRow = (i: number, row: Readonly<Record<string, unknown>>): string =>
  planWith({ remaining: PLAN.remaining.map((r, k) => (k === i ? row : r)) });

const problems = (text: string) => {
  const parsed = parseRevisionPlan(text);
  return parsed.ok ? [] : parsed.problems;
};

const [R1, R2, R3, R4] = PLAN.remaining;
const ENOUGH = { kind: "enough", since: "2026-12-01" };

/** Plans the shape accepts beside the fixture: each other bar, measurement, state and finding id. */
const VALID: readonly (readonly [string, string])[] = [
  [
    "a corpus bar",
    planWith({
      bar: { kind: "corpus", series: "usenix-sec", editions: [2024, 2025] },
    }),
  ],
  [
    "a proxy bar",
    planWith({
      bar: { kind: "proxy", series: "agent", stands_in_for: "a first edition" },
    }),
  ],
  [
    "enough measured",
    planWith({
      measurement: { ...ENOUGH, evidence: "research/2026-12-01-bar.md" },
    }),
  ],
  ["a row being done", withRow(1, { ...R2, state: "doing" })],
  [
    "a finding named by its id",
    withRow(1, {
      ...R2,
      from: { kind: "finding", file: "reviews/a.md", finding: "M2" },
    }),
  ],
];

/** One planted defect each, and the path it is reported at. */
const DEFECTS: readonly (readonly [string, string, readonly unknown[]])[] = [
  [
    "a misspelt key, at the key",
    planWith({ writen: "2026-11-25" }),
    ["writen"],
  ],
  [
    "a corpus bar without its series",
    planWith({ bar: { kind: "corpus", editions: [2025] } }),
    ["bar", "series"],
  ],
  [
    "a corpus bar with no edition",
    planWith({ bar: { kind: "corpus", series: "agent", editions: [] } }),
    // The first edition is the one missing: `editions` is a tuple with a rest element.
    ["bar", "editions", 0],
  ],
  ["no bar, without why", planWith({ bar: { kind: "none" } }), ["bar", "why"]],
  [
    "a bar of no kind the shape names",
    planWith({ bar: { kind: "measured" } }),
    ["bar", "kind"],
  ],
  [
    "enough measured, without the file that decided it",
    planWith({ measurement: ENOUGH }),
    ["measurement", "evidence"],
  ],
  [
    "evidence above the paper folder",
    planWith({ measurement: { ...ENOUGH, evidence: "../other/notes.md" } }),
    ["measurement", "evidence"],
  ],
  [
    "an absolute evidence path",
    planWith({ measurement: { ...ENOUGH, evidence: "/home/notes.md" } }),
    ["measurement", "evidence"],
  ],
  [
    "a drive-qualified evidence path",
    planWith({ measurement: { ...ENOUGH, evidence: "C:/outside/notes.md" } }),
    ["measurement", "evidence"],
  ],
  [
    "a finding file with a drive letter",
    withRow(1, {
      ...R2,
      from: { kind: "finding", file: "C:/reviews/a.md", finding: 3 },
    }),
    ["remaining", 1, "from", "file"],
  ],
  [
    "a finding file with a backslash",
    withRow(1, {
      ...R2,
      from: { kind: "finding", file: "reviews\\a.md", finding: 3 },
    }),
    ["remaining", 1, "from", "file"],
  ],
  [
    "a done row without evidence",
    withRow(2, { ...R3, evidence: undefined }),
    ["remaining", 2, "evidence"],
  ],
  [
    "a dropped row without its kind",
    withRow(3, { ...R4, kind: undefined }),
    ["remaining", 3, "kind"],
  ],
  [
    "a row with no origin",
    withRow(1, { ...R2, from: undefined }),
    ["remaining", 1, "from"],
  ],
  [
    "a row with no date it was added",
    withRow(1, { ...R2, added: "soon" }),
    ["remaining", 1, "added"],
  ],
  [
    "a row of no state the shape names",
    withRow(1, { ...R2, state: "blocked" }),
    ["remaining", 1, "state"],
  ],
  [
    "a by-rule row naming no rule id",
    withRow(0, { ...R1, rule: "required-section" }),
    ["remaining", 0, "rule"],
  ],
  [
    "a row id that is not R and a number",
    withRow(1, { ...R2, id: "row-2" }),
    ["remaining", 1, "id"],
  ],
  [
    "a cycle that is no cycle id",
    planWith({ cycle: "LangCode 2027" }),
    ["cycle"],
  ],
  [
    "a whitespace-only reason",
    withRow(3, { ...R4, reason: "  " }),
    ["remaining", 3, "reason"],
  ],
];

describe("parseRevisionPlan: a valid plan", () => {
  it("🔴 parses into the whole value, every field kept", () => {
    expect(revisionPlanCodec.parse(planText())).toEqual({
      ok: true,
      plan: PLAN,
    });
  });

  it.each(VALID)("%s parses", (_name, text) => {
    expect(problems(text)).toEqual([]);
  });
});

describe("parseRevisionPlan: each defect at its field", () => {
  it.each(DEFECTS)("%s", (_name, text, path) => {
    expect(problems(text).map((p) => p.path)).toEqual([path]);
  });

  it("🔴 two rows with one id: the second, naming the first", () => {
    expect(problems(withRow(1, { ...R2, id: "R1" }))).toEqual([
      {
        path: ["remaining", 1, "id"],
        message: '"R1" is the id of row 1 too: each row has its own',
      },
    ]);
  });

  it("a tag of no kind names the kinds it takes", () => {
    expect(problems(planWith({ bar: { kind: "measured" } }))).toEqual([
      {
        path: ["bar", "kind"],
        message: '"kind" is one of "corpus", "proxy", "none"',
      },
    ]);
  });

  it("a field left out is missing, at its own path", () => {
    expect(problems(planWith({ bar: { kind: "none" } }))).toEqual([
      { path: ["bar", "why"], message: "missing: the shape requires it here" },
    ]);
  });

  it("text that is not JSON: one problem at the top", () => {
    expect(problems("{ cycle: ")).toEqual([{ path: [], message: "not JSON" }]);
  });
});
