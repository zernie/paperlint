/**
 * build-label-page — the free tier of the SKILL itself: its checklist has the eight rules the skill
 * names. The generator is tested beside it, in scripts/.
 * No model, no network, no browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const HERE = import.meta.dirname;

test("the checklist has the eight rules, numbered, and the skill names eight", () => {
  const checklist = readFileSync(
    join(HERE, "references", "checklist.md"),
    "utf8",
  );
  const numbers = [...checklist.matchAll(/^## (\d+)\. /gm)].map((m) => m[1]);
  assert.deepEqual(numbers, ["1", "2", "3", "4", "5", "6", "7", "8"]);
  const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");
  const listed = [...skill.matchAll(/^(\d)\. \*\*/gm)].map((m) => m[1]);
  assert.deepEqual(listed.slice(0, 8), numbers);
});
