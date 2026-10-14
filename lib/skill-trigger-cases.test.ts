/**
 * The shared trigger table is FROZEN while the skills move their cases next to themselves.
 *
 * A skill's trigger cases belong beside the skill, in `skills/<name>/trigger-cases.json`. The
 * shared table in `skill-trigger-cases.mjs` holds the skills that have not moved yet; this file
 * keeps it from growing (a new skill adds a colocated file, never a row) and makes it shrink in
 * step with the moves (a skill that left the table leaves `FROZEN` too). A skill is never in both
 * places, and a colocated file is read through a schema.
 *
 * Each check is shown both ways: on the real table (passes) and on a planted one (fails).
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import {
  COLOCATED_CASES,
  SHARED_CASES,
  TRIGGER_CASES_FILE,
  colocatedCases,
  type TriggerCase,
} from "./skill-trigger-cases.mjs";

/** The skills still in the shared table. It may only SHRINK: remove a name when its skill moves. */
const FROZEN: readonly string[] = [
  "analyze-sibling-paper",
  "argument-arc",
  "build-benchmark",
  "build-label-page",
  "camera-ready",
  "cold-read-diff",
  "draft-paper",
  "extend-paper",
  "find-venue",
  "grade-paper-writing",
  "harden-paper",
  "map-prior-work",
  "osf-artifact-upload",
  "paper-adversarial-review",
  "paper-pipeline",
  "paper-status",
  "pc-panel-review",
  "plan-paper-timeline",
  "render-paper",
  "research-ideate",
  "study-accepted-papers",
  "submission-portal",
  "submit-paper",
  "sweep-design-space",
  "tighten-paper",
  "verify-citations",
];

/** What is wrong with the shared table against the frozen set, as messages; [] when nothing. */
function frozenProblems(
  table: readonly TriggerCase[],
  frozen: readonly string[],
): string[] {
  const names = table.map((c) => c.skill);
  const added = names.filter((n) => !frozen.includes(n));
  const gone = frozen.filter((n) => !names.includes(n));
  return [
    ...added.map(
      (n) =>
        `${n} is a new row in lib/skill-trigger-cases.mjs, which is frozen: put its cases in ` +
        `skills/${n}/${TRIGGER_CASES_FILE} beside the skill instead`,
    ),
    ...gone.map(
      (n) =>
        `${n} left the shared table: remove it from FROZEN in lib/skill-trigger-cases.test.ts — ` +
        `the frozen set only shrinks`,
    ),
  ];
}

const row = (skill: string): TriggerCase => ({
  skill,
  why: "x",
  prompts: ["a", "b", "c", "d"],
  collides: [],
});

test("the shared table names exactly the frozen skills", () => {
  assert.deepEqual(frozenProblems(SHARED_CASES, FROZEN), []);
});

test("a planted new row, and a frozen name that left the table, both fail", () => {
  const planted = [...SHARED_CASES, row("new-skill")];
  assert.deepEqual(frozenProblems(planted, FROZEN), [
    `new-skill is a new row in lib/skill-trigger-cases.mjs, which is frozen: put its cases in skills/new-skill/${TRIGGER_CASES_FILE} beside the skill instead`,
  ]);
  const shrunk = SHARED_CASES.filter((c) => c.skill !== "camera-ready");
  assert.deepEqual(frozenProblems(shrunk, FROZEN), [
    "camera-ready left the shared table: remove it from FROZEN in lib/skill-trigger-cases.test.ts — the frozen set only shrinks",
  ]);
});

test("no skill with a colocated file is also in the shared table", () => {
  const shared = new Set(SHARED_CASES.map((c) => c.skill));
  assert.deepEqual(
    COLOCATED_CASES.map((c) => c.skill).filter((s) => shared.has(s)),
    [],
  );
  assert.deepEqual(
    COLOCATED_CASES.map((c) => c.skill),
    ["label-agent-runs", "run-agent-grid"],
  );
});

const CASE = {
  why: "the territory",
  prompts: ["one", "two", "three", "four"],
  collides: ["other"],
};
const WORK = useTempDir("trigger-cases-");

test("colocated files are read by directory name; a skill without one is skipped", () => {
  const dir = writeTree(join(WORK, "ok"), {
    [`b-skill/${TRIGGER_CASES_FILE}`]: JSON.stringify(CASE),
    [`a-skill/${TRIGGER_CASES_FILE}`]: JSON.stringify(CASE),
    "c-skill/SKILL.md": "---\n---\n",
  });
  assert.deepEqual(colocatedCases(dir, []), [
    { skill: "a-skill", ...CASE },
    { skill: "b-skill", ...CASE },
  ]);
});

test("a skill in both places is refused, naming it", () => {
  const dir = writeTree(join(WORK, "double"), {
    [`a-skill/${TRIGGER_CASES_FILE}`]: JSON.stringify(CASE),
  });
  assert.throws(() => colocatedCases(dir, [row("a-skill")]), {
    message: `a-skill has its trigger cases in ${join(dir, "a-skill", TRIGGER_CASES_FILE)} AND in lib/skill-trigger-cases.mjs; delete the table row — the colocated file is the one that stays.`,
  });
});

test("a malformed colocated file is refused through the schema, naming the file", () => {
  const dir = writeTree(join(WORK, "bad"), {
    [`a-skill/${TRIGGER_CASES_FILE}`]: JSON.stringify({
      why: "x",
      prompts: ["only one"],
      collides: [],
      skill: "a-skill",
    }),
  });
  const file = join(dir, "a-skill", TRIGGER_CASES_FILE);
  assert.throws(
    () => colocatedCases(dir, []),
    (e: unknown) => {
      assert.ok(e instanceof TypeError);
      assert.ok(e.message.startsWith(`${file}: `), e.message);
      assert.match(e.message, /prompts/);
      assert.match(e.message, /skill/);
      return true;
    },
  );
});
