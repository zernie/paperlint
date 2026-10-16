/**
 * The schema of a study's mode (`mode` in its plan). Both halves: what `studies new` writes parses back
 * to itself; a measurement's plan is ready only with exactly one mode; every contradiction is refused
 * with its reason.
 */
import { expect, it } from "vitest";
import type { StudyMode } from "../../domain/study-mode.ts";
import {
  planTemplate,
  planText,
  type StudyKind,
  type StudyPlan,
} from "../../domain/study-registry.ts";
import { studyRegistryCodec } from "./index.ts";

const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["data/outcome/**", "RESULTS.md"],
  decision: {
    file: "repro/P1-S01-x/decision.md",
    note: "exclusions and the sample approved",
  },
};
const EXPLORATORY: StudyMode = {
  kind: "exploratory",
  reason: "a first look at the logs, to find the question",
};

const PLAN: StudyPlan = {
  question: "Does the hint help?",
  population: {
    source: "tasks, 2026-10-01",
    draw: { kind: "all", method: "census" },
  },
  arms: [{ name: "hint" }, { name: "none" }],
  primary_outcome: "pass rate",
  author_check: null,
  mode: DECIDED,
};

const parse = (text: string, kind: StudyKind = "measurement") =>
  studyRegistryCodec.parsePlan(text, kind);
const withMode = (mode: unknown): string => JSON.stringify({ ...PLAN, mode });
const why = (text: string): string => {
  const r = parse(text);
  return r.kind === "unreadable" ? r.why : r.kind;
};
const empty = (text: string, kind: StudyKind = "measurement") => {
  const r = parse(text, kind);
  return r.kind === "draft" ? r.empty : r.kind;
};

it("each mode parses to itself, ready", () => {
  // Guards: the three modes round-trip through the text planText writes.
  expect(
    [DECIDED, EXPLORATORY].map((mode) => parse(planText({ ...PLAN, mode }))),
  ).toEqual(
    [DECIDED, EXPLORATORY].map((mode) => ({
      kind: "ready",
      plan: { ...PLAN, mode },
    })),
  );
});

it("a measurement's plan without a mode is a draft naming `mode`; a spike's is ready", () => {
  const none: StudyPlan = { ...PLAN, mode: undefined };
  // Guards: "none" is not a ready state for a measurement — and a spike may omit it.
  expect(empty(planText(none))).toEqual(["mode"]);
  expect(empty(planText(none), "spike")).toBe("ready");
});

it("the template of a measurement is a draft decided before its run, its decision file named", () => {
  const t = planTemplate("measurement", "P1-S02-x");
  // Guards: `studies new` scaffolds the default mode; what is left to fill is named.
  expect(t.mode).toEqual({
    kind: "decide_before_run",
    outputs: [],
    decision: { file: "repro/P1-S02-x/decision.md", note: "" },
  });
  expect(empty(planText(t))).toEqual([
    "question",
    "population.source",
    "population.draw.method",
    "primary_outcome",
    "mode.outputs",
    "mode.decision.note",
  ]);
  expect(planTemplate("spike", "P1-S03-y").mode).toBeUndefined();
});

it("each mode's empty texts are named: the decision's, an exploratory reason", () => {
  // Guards: a mode left half-written is a draft, so a study that has run on it is reported.
  expect(
    empty(
      withMode({ ...DECIDED, outputs: [], decision: { file: " ", note: "" } }),
    ),
  ).toEqual(["mode.outputs", "mode.decision.file", "mode.decision.note"]);
  expect(empty(withMode({ ...EXPLORATORY, reason: "" }))).toEqual([
    "mode.reason",
  ]);
});

it("two modes at once, or a mode that is neither, cannot be written", () => {
  // Guards: exactly one — a second mode's key is an unknown key, an unknown kind is refused.
  expect(why(withMode({ ...DECIDED, reason: "r" }))).toBe(
    'mode: Unrecognized key: "reason"',
  );
  expect(why(withMode({ kind: "preregistered" }))).toBe(
    "mode.kind: Invalid discriminator value. Expected 'decide_before_run' | 'exploratory'",
  );
  expect(why(withMode({ kind: "blind" }))).toBe(
    "mode.kind: Invalid discriminator value. Expected 'decide_before_run' | 'exploratory'",
  );
});

it("refuses an output outside the folder or naming the study's README, and a decision outside the paper", () => {
  const outside =
    "is not a path inside the study's folder, or names its README.md";
  // Guards: a glob cannot reach past the study's folder; a decision cannot leave the paper.
  expect(
    ["../x", "/abs", "a\\b", "README.md"].map((o) =>
      why(withMode({ ...DECIDED, outputs: [o] })),
    ),
  ).toEqual(Array.from({ length: 4 }, () => `mode.outputs.0: ${outside}`));
  expect(why(withMode({ ...DECIDED, outputs: ["a", "a"] }))).toBe(
    "mode.outputs: the output «a» is listed more than once",
  );
  expect(
    ["../d.md", "/d.md", "a\\d.md"].map((file) =>
      why(withMode({ ...DECIDED, decision: { file, note: "n" } })),
    ),
  ).toEqual(
    Array.from(
      { length: 3 },
      () => "mode.decision.file: is not a path inside the paper's folder",
    ),
  );
});

it("refuses a decision path that names the paper's folder or a directory, and keeps an empty one a draft", () => {
  const notFile =
    "mode.decision.file: is not a path to a file inside the paper's folder: one or more names joined by /, none empty, . or ..";
  // Guards: a decision of `.` would make the gate ask git about the whole paper, and the order rule
  // read the paper's first commit as the decision; such a path cannot be written down.
  expect(
    [".", "./", "repro/", "a//d.md", "a/./d.md", "./d.md"].map((file) =>
      why(withMode({ ...DECIDED, decision: { file, note: "n" } })),
    ),
  ).toEqual(Array(6).fill(notFile));
  expect(
    empty(withMode({ ...DECIDED, decision: { file: "", note: "n" } })),
  ).toEqual(["mode.decision.file"]);
});

it("mode is a field of the plan, so extra cannot carry it", () => {
  // Guards: one place says how a study is gated.
  expect(
    why(JSON.stringify({ ...PLAN, mode: undefined, extra: { mode: {} } })),
  ).toBe(
    "extra.mode: is a field of the plan itself — set it there, not in extra",
  );
});
