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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dropWhile, map } from "remeda";
import { parse } from "shell-quote";
import { expect, test } from "vitest";
import { commandsIn } from "vigiles";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { parseArgs } from "../../src/cli.ts";
import { usageProblem } from "../../src/submission.ts";

const SKILL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "SKILL.md"),
  "utf8",
);
const commands = map(
  commandsIn(SKILL, /(^|[|;&]\s*)npx paperlint submission\b/),
  (c) => c.text,
);

/**
 * A command as the CLI receives it: the words after `npx paperlint`, split as a shell splits them, so
 * a quoted argument stays one word. A shell operator in the line is kept as its text, and fails below.
 */
const argvOf = (command: string): readonly string[] =>
  dropWhile(
    // `<paper>` is a placeholder the reader fills with one word, not a shell redirection.
    map(parse(command.replace(/<([\w-]+)>/g, "$1")), (w) =>
      typeof w === "string" ? w : JSON.stringify(w),
    ),
    (w) => w !== "paperlint",
  ).slice(1);

/** A command as a step of the procedure: the subcommand, and for a change whether it saves. */
const stepOf = (command: string): string => {
  const a = parseArgs([...argvOf(command)]);
  const sub = String(a.paths[0]);
  return sub === "show" ? "show" : `${sub} ${a.save ? "save" : "dry"}`;
};

test("the skill's commands are, in order: create (dry, then save), read, change (dry, then save), read again", () => {
  expect(map(commands, stepOf)).toEqual([
    "new dry",
    "new save",
    "show",
    "update dry",
    "update save",
    "show",
  ]);
});

test("every `paperlint submission` command in the skill is one the CLI runs", () => {
  const verdicts = map(commands, (c) => {
    const a = parseArgs([...argvOf(c)]);
    return {
      command: c,
      cmd: a.cmd,
      unknownFlag: a.unknownFlag,
      missingValue: a.missingValue,
      problem: usageProblem({
        sub: a.paths[0],
        paperDir: a.paths[1] ?? ".",
        extra: a.paths.slice(2),
        pdf: a.pdf,
        abstract: a.abstract,
        submit: a.submit,
        save: a.save,
      }),
    };
  });
  expect(verdicts).toEqual(
    map(commands, (command) => ({
      command,
      cmd: "submission",
      unknownFlag: undefined,
      missingValue: undefined,
      problem: null,
    })),
  );
});

test("a quoted argument stays one word", () => {
  expect(
    argvOf(`npx paperlint submission update "my paper" --abstract 'a b.txt'`),
  ).toEqual(["submission", "update", "my paper", "--abstract", "a b.txt"]);
});

test("the shared per-skill checks pass", async () => {
  await checkSkill("submission-portal");
});
