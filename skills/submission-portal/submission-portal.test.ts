/**
 * submission-portal — the free tier: the skill's commands are commands the CLI accepts, in the
 * order the skill promises, and the skill passes the shared per-skill checks. No model, no network,
 * no portal.
 *
 * 🔴 WHY THE COMMANDS ARE PARSED, NOT GREPPED: a skill that tells the agent to run a flag the CLI
 * refuses fails at the worst moment — before a deadline, on a real submission. So every
 * `paperlint submission …` the skill writes goes through the CLI's own argument parser and its
 * usage check, and must come out runnable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { commandsIn } from "vigiles";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { parseArgs } from "../../src/cli.ts";
import { usageProblem } from "../../src/submission.ts";

const SKILL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "SKILL.md"),
  "utf8",
);
const commands = commandsIn(
  SKILL,
  /(^|[|;&]\s*)npx paperlint submission\b/,
).map((c) => c.text);

/** A command as the CLI receives it: the words after `npx paperlint`. */
const argvOf = (command: string): string[] =>
  command
    .replace(/^.*?npx paperlint /, "")
    .split(/\s+/)
    .filter(Boolean);

test("the skill names show, a dry run and a save — and nothing else", () => {
  const kinds = commands.map((c) => {
    const a = parseArgs(argvOf(c));
    return `${String(a.paths[0])}${a.save ? " --save" : ""}`;
  });
  assert.deepEqual([...new Set(kinds)], ["show", "update", "update --save"]);
});

test("every `paperlint submission` command in the skill is one the CLI runs", () => {
  assert.ok(
    commands.length > 0,
    "the skill names no `paperlint submission` command",
  );
  for (const c of commands) {
    const a = parseArgs(argvOf(c));
    assert.equal(a.cmd, "submission", c);
    assert.equal(a.unknownFlag, undefined, c);
    assert.equal(a.missingValue, undefined, c);
    const problem = usageProblem({
      sub: a.paths[0],
      paperDir: a.paths[1] ?? ".",
      extra: a.paths.slice(2),
      pdf: a.pdf,
      abstract: a.abstract,
      submit: a.submit,
      save: a.save,
    });
    assert.equal(problem, null, c);
  }
});

test("🔴 the procedure reads, dry-runs, then saves, then reads again — never saves first", () => {
  const order = commands.map((c) => {
    const a = parseArgs(argvOf(c));
    return a.paths[0] === "show" ? "show" : a.save ? "save" : "dry";
  });
  const firstSave = order.indexOf("save");
  assert.ok(firstSave > order.indexOf("dry"), order.join(" → "));
  assert.ok(order.indexOf("dry") > order.indexOf("show"), order.join(" → "));
  assert.ok(order.lastIndexOf("show") > firstSave, order.join(" → "));
});

test("the shared per-skill checks pass", async () => {
  await checkSkill("submission-portal");
});
