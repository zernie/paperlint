/**
 * The shared trigger table is FROZEN while every skill moves its trigger cases into its own eval
 * file (#218).
 *
 * A skill's trigger cases belong to the skill: `skills/<name>/<name>.eval.ts` default-exports
 * `defineEval({ measureTriggerRate: { prompts, irrelevantPrompts, … } })`, and `vigiles eval`
 * discovers and runs it. `lib/skill-trigger-cases.mjs` holds the skills that have not moved yet.
 * This file keeps that table from growing (a new skill writes its own eval file, never a row),
 * makes `FROZEN` shrink in step with the moves, and refuses a skill that is in both places.
 *
 * The table is read by RUNNING the module in a child process, as the evals do — not by importing
 * it here, which would need types for a JavaScript module, and not by matching its text. An eval
 * file is classified by PARSING it: importing one that still calls the paid kit would spend money.
 *
 * Each check is shown both ways: on the real files (passes) and on a planted input (fails).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { assertPromptDiversity } from "vigiles";
import { test } from "vitest";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import grid from "../skills/run-agent-grid/run-agent-grid.eval.ts";
import labels from "../skills/label-agent-runs/label-agent-runs.eval.ts";

const ROOT = join(import.meta.dirname, "..");

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

const Row = z.object({ skill: z.string(), prompts: z.array(z.string()) });
type Row = z.infer<typeof Row>;

/** The shared table's rows, read by running the module. */
function sharedTable(): Row[] {
  const url = pathToFileURL(join(ROOT, "lib", "skill-trigger-cases.mjs")).href;
  const r = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const m = await import(${JSON.stringify(url)});` +
        "console.log(JSON.stringify(m.CASES.map(({ skill, prompts }) => ({ skill, prompts }))));",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return z.array(Row).parse(JSON.parse(r.stdout));
}
const SHARED = sharedTable();

/** What is wrong with the shared table against the frozen set, as messages; [] when nothing. */
function frozenProblems(
  table: readonly string[],
  frozen: readonly string[],
): string[] {
  return [
    ...table
      .filter((n) => !frozen.includes(n))
      .map(
        (n) =>
          `${n} is a new row in lib/skill-trigger-cases.mjs, which is frozen: declare its trigger ` +
          `cases in skills/${n}/${n}.eval.ts with defineEval({ measureTriggerRate }) instead`,
      ),
    ...frozen
      .filter((n) => !table.includes(n))
      .map(
        (n) =>
          `${n} left the shared table: remove it from FROZEN in lib/skill-trigger-cases.test.ts — ` +
          `the frozen set only shrinks`,
      ),
  ];
}

/** Is this the `measureTriggerRate` key of an object literal? */
const isTriggerKey = (p: ts.ObjectLiteralElementLike): boolean =>
  p.name !== undefined &&
  ts.isIdentifier(p.name) &&
  p.name.text === "measureTriggerRate";

/** Does this eval file default-export `defineEval({ measureTriggerRate: … })`? Parsed, not run. */
function declaresTriggerRate(file: string): boolean {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
  );
  return sf.statements.some(
    (s) =>
      ts.isExportAssignment(s) &&
      ts.isCallExpression(s.expression) &&
      ts.isIdentifier(s.expression.expression) &&
      s.expression.expression.text === "defineEval" &&
      s.expression.arguments.some(
        (a) =>
          ts.isObjectLiteralExpression(a) && a.properties.some(isTriggerKey),
      ),
  );
}

/** Skills under `dir` whose own `<name>.eval.ts` declares their trigger cases. */
const colocated = (dir: string): string[] =>
  globSync("*/*.eval.ts", { cwd: dir })
    .filter((f) => basename(f) === `${dirname(f)}.eval.ts`)
    .filter((f) => declaresTriggerRate(join(dir, f)))
    .map((f) => dirname(f))
    .sort();

test("the shared table names exactly the frozen skills", () => {
  assert.deepEqual(
    frozenProblems(
      SHARED.map((r) => r.skill),
      FROZEN,
    ),
    [],
  );
});

test("a planted new row, and a frozen name that left the table, both fail", () => {
  const names = SHARED.map((r) => r.skill);
  assert.deepEqual(frozenProblems([...names, "new-skill"], FROZEN), [
    "new-skill is a new row in lib/skill-trigger-cases.mjs, which is frozen: declare its trigger cases in skills/new-skill/new-skill.eval.ts with defineEval({ measureTriggerRate }) instead",
  ]);
  assert.deepEqual(
    frozenProblems(
      names.filter((n) => n !== "camera-ready"),
      FROZEN,
    ),
    [
      "camera-ready left the shared table: remove it from FROZEN in lib/skill-trigger-cases.test.ts — the frozen set only shrinks",
    ],
  );
});

test("no skill that declares its own trigger cases is also in the shared table", () => {
  const mine = colocated(join(ROOT, "skills"));
  assert.deepEqual(mine, ["add-venue", "label-agent-runs", "run-agent-grid"]);
  assert.deepEqual(
    mine.filter((s) => SHARED.some((r) => r.skill === s)),
    [],
  );
});

const WORK = useTempDir("trigger-cases-");

test("an eval file is classified by its default export, parsed: defineEval yes, the kit no", () => {
  const dir = writeTree(join(WORK, "skills"), {
    "own/own.eval.ts":
      'import { defineEval } from "vigiles";\nexport default defineEval({ measureTriggerRate: { prompts: [] } });\n',
    "kit/kit.eval.ts":
      'import { runSkillTriggerEval } from "../../lib/skill-eval-kit.mjs";\nawait runSkillTriggerEval("kit");\n',
    "other/other.eval.ts":
      'import { defineEval } from "vigiles";\nexport default defineEval({ measure: { task: "x" } });\n',
    "named/elsewhere.eval.ts":
      'import { defineEval } from "vigiles";\nexport default defineEval({ measureTriggerRate: { prompts: [] } });\n',
  });
  assert.deepEqual(colocated(dir), ["own"]);
  // A planted double source: a skill that declares its own cases and is also a table row.
  assert.deepEqual(
    colocated(dir).filter((s) => [...FROZEN, "own"].includes(s)),
    ["own"],
  );
});

test("each new eval declares diverse prompts on both sides, none of them a table row's", () => {
  const tablePrompts = new Set(SHARED.flatMap((r) => r.prompts));
  for (const def of [grid, labels]) {
    const spec = def.measureTriggerRate;
    assert.ok(spec, "the eval declares measureTriggerRate");
    assertPromptDiversity(spec.prompts, { minPrompts: 4, label: "prompts" });
    assertPromptDiversity(spec.irrelevantPrompts ?? [], {
      minPrompts: 4,
      label: "irrelevantPrompts",
    });
    assert.deepEqual(
      spec.prompts.filter((p) => tablePrompts.has(p)),
      [],
    );
  }
});
