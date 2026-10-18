/**
 * The index's mode columns (`src/domain/index-columns.ts`) and the table that carries them
 * (`studyIndex`, `indexInSync`, `indexCurrent` in `src/domain/study-registry.ts`): the mode from the
 * plan, the decision's and the first output's commits from git's history, and the two git columns
 * left out of what the lint compares.
 */
import { describe, expect, it } from "vitest";
import type { DecideFirstStudy } from "./decide-first.ts";
import { decisionCell, indexHistory } from "./index-columns.ts";
import type { DecideFirst } from "./study-mode.ts";
import {
  indexCurrent,
  indexInSync,
  studyIndex,
  withIndex,
  type IndexInput,
  type PlanState,
  type Study,
  type StudyPlan,
  type StudyRegistry,
} from "./study-registry.ts";

const D = { commit: "d".repeat(40), date: "2026-10-14T09:12:00+05:00" };
const A = { commit: "a".repeat(40), date: "2026-10-16T11:00:00+05:00" };

const DECIDED: DecideFirst = {
  kind: "decide_before_run",
  outputs: ["RESULTS.md"],
  decision: { file: "repro/P1-S01-hint/decision.md", note: "exclusions" },
};

const plan = (mode: StudyPlan["mode"]): PlanState => ({
  kind: "ready",
  plan: {
    question: "q?",
    population: { source: "s", draw: { kind: "all", method: "census" } },
    arms: [],
    primary_outcome: "o",
    author_check: null,
    mode,
  },
});

const row = (n: number, over: Partial<Study> = {}): Study => ({
  id: `P1-S0${String(n)}`,
  folder: `P1-S0${String(n)}-s`,
  title: `S${String(n)}`,
  question: "q?",
  kind: "measurement",
  status: "running",
  date: "2026-10-15",
  in_paper: "no",
  plan: "plan.json",
  ...over,
});

/** Nine studies, one per state a mode cell can be in. */
const NINE: StudyRegistry = {
  prefix: "P1",
  studies: [
    row(1, { folder: "P1-S01-hint" }),
    row(2),
    row(3),
    row(4),
    row(5),
    row(6, { kind: "spike", plan: undefined }),
    row(7, { plan: "../plan.json" }),
    row(8),
    row(9),
  ],
};
/** Their plans and histories. */
const NINE_AT: IndexInput = {
  plans: new Map<string, PlanState>([
    ["P1-S01-hint/plan.json", plan(DECIDED)],
    ["P1-S02-s/plan.json", plan(DECIDED)],
    ["P1-S03-s/plan.json", plan({ kind: "exploratory", reason: "a | look" })],
    ["P1-S04-s/plan.json", plan(DECIDED)],
    ["P1-S05-s/plan.json", plan(DECIDED)],
    ["P1-S08-s/plan.json", { kind: "unreadable", why: "not JSON" }],
    ["P1-S09-s/plan.json", plan(undefined)],
  ]),
  history: new Map([
    [
      "P1-S01-hint/plan.json",
      { kind: "read", decision: D, decisionDeleted: false, firstOutput: A },
    ],
    [
      "P1-S02-s/plan.json",
      {
        kind: "read",
        decision: null,
        decisionDeleted: false,
        firstOutput: null,
      },
    ],
    ["P1-S04-s/plan.json", { kind: "unread", why: "shallow clone" }],
  ]),
};

describe("the mode columns of the index", () => {
  it("say each study's mode and, for one decided before its run, its two commits", () => {
    // Guards: the sample row a reader and the review skills read — decided before the run, the
    // decision's first commit and date, the first output's — and every other state its own words.
    expect(studyIndex(NINE, NINE_AT).split("\n").slice(2)).toEqual([
      "| P1-S01 | S1    | running | —      | no       | decide_before_run      | dddddddddddd 2026-10-14 | aaaaaaaaaaaa 2026-10-16 | [P1-S01-hint/](P1-S01-hint/) |",
      "| P1-S02 | S2    | running | —      | no       | decide_before_run      | not committed           | none                    | [P1-S02-s/](P1-S02-s/)       |",
      "| P1-S03 | S3    | running | —      | no       | exploratory: a \\| look | —                       | —                       | [P1-S03-s/](P1-S03-s/)       |",
      "| P1-S04 | S4    | running | —      | no       | decide_before_run      | unknown (shallow clone) | unknown (shallow clone) | [P1-S04-s/](P1-S04-s/)       |",
      "| P1-S05 | S5    | running | —      | no       | decide_before_run      | not read                | not read                | [P1-S05-s/](P1-S05-s/)       |",
      "| P1-S06 | S6    | running | —      | no       | —                      | —                       | —                       | [P1-S06-s/](P1-S06-s/)       |",
      "| P1-S07 | S7    | running | —      | no       | —                      | —                       | —                       | [P1-S07-s/](P1-S07-s/)       |",
      "| P1-S08 | S8    | running | —      | no       | —                      | —                       | —                       | [P1-S08-s/](P1-S08-s/)       |",
      "| P1-S09 | S9    | running | —      | no       | —                      | —                       | —                       | [P1-S09-s/](P1-S09-s/)       |",
    ]);
  });

  it("the lint compares the mode, never the two commits; `studies index` rewrites on either", () => {
    const r: StudyRegistry = { prefix: "P1", studies: [row(1)] };
    const plans = new Map([["P1-S01-s/plan.json", plan(DECIDED)]]);
    const was: IndexInput = { plans, history: new Map() };
    const readme = withIndex("# index\n", r, was);
    const committed: IndexInput = {
      plans,
      history: new Map([
        [
          "P1-S01-s/plan.json",
          {
            kind: "read",
            decision: D,
            decisionDeleted: false,
            firstOutput: null,
          },
        ],
      ]),
    };
    const explored: IndexInput = {
      plans: new Map([
        ["P1-S01-s/plan.json", plan({ kind: "exploratory", reason: "r" })],
      ]),
      history: new Map(),
    };
    // Guards: a squash merge renames the commits, so the lint cannot hold them; the command can.
    expect([
      indexInSync(readme, r, committed),
      indexCurrent(readme, r, committed),
      indexInSync(readme, r, explored),
      indexCurrent(readme, r, was),
      indexCurrent(null, r, was),
    ]).toEqual([true, false, false, true, false]);
  });
});

it("two rows of one id each show their own history, keyed by folder and plan", () => {
  const r: StudyRegistry = {
    prefix: "P1",
    studies: [row(1, { folder: "P1-S01-a" }), row(1, { folder: "P1-S01-b" })],
  };
  const at: IndexInput = {
    plans: new Map([
      ["P1-S01-a/plan.json", plan(DECIDED)],
      ["P1-S01-b/plan.json", plan(DECIDED)],
    ]),
    history: new Map([
      [
        "P1-S01-a/plan.json",
        { kind: "read", decision: D, decisionDeleted: false, firstOutput: A },
      ],
      [
        "P1-S01-b/plan.json",
        {
          kind: "read",
          decision: null,
          decisionDeleted: false,
          firstOutput: null,
        },
      ],
    ]),
  };
  // Guards: keyed by id, the second row's history was shown on both rows (the later one wins).
  expect(
    studyIndex(r, at)
      .split("\n")
      .slice(2)
      .map((l) =>
        l
          .split("|")
          .slice(6, 9)
          .map((c) => c.trim()),
      ),
  ).toEqual([
    ["decide_before_run", "dddddddddddd 2026-10-14", "aaaaaaaaaaaa 2026-10-16"],
    ["decide_before_run", "not committed", "none"],
  ]);
});

it("a decision committed and since deleted shows its commit, and that it is gone", () => {
  // Guards: the Methods sentence must not cite a decision that no longer stands.
  expect(
    decisionCell({
      mode: DECIDED,
      history: {
        kind: "read",
        decision: D,
        decisionDeleted: true,
        firstOutput: null,
      },
    }),
  ).toBe("dddddddddddd 2026-10-14, deleted since");
});

describe("indexHistory", () => {
  const study = (facts: DecideFirstStudy["facts"]): DecideFirstStudy => ({
    id: "P1-S01",
    folder: "P1-S01-hint",
    plan: "plan.json",
    mode: DECIDED,
    tree: [],
    facts,
  });

  it("is the decision's first commit and the oldest output's, or what kept git from saying", () => {
    expect([
      indexHistory(study({ kind: "unknown", why: "not a repository" })),
      indexHistory(study({ kind: "shallow" })),
      indexHistory(study({ kind: "not-a-file", what: "directory" })),
      indexHistory(study({ kind: "linked", link: "repro/sub" })),
      indexHistory(
        study({
          kind: "read",
          decision: D,
          decisionDeleted: false,
          files: [
            { path: "decision.md", ...D, order: "same" },
            { path: "RESULTS.md", ...A, order: "after" },
          ],
        }),
      ),
      indexHistory(
        study({
          kind: "read",
          decision: null,
          decisionDeleted: false,
          files: [],
        }),
      ),
    ]).toEqual([
      { kind: "unread", why: "git could not answer" },
      { kind: "unread", why: "shallow clone" },
      { kind: "unread", why: "the decision is a directory" },
      { kind: "unread", why: "the decision is behind a symbolic link" },
      { kind: "read", decision: D, decisionDeleted: false, firstOutput: A },
      {
        kind: "read",
        decision: null,
        decisionDeleted: false,
        firstOutput: null,
      },
    ]);
  });
});
