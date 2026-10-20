/**
 * submission-portal — the shared per-skill checks (frontmatter, tool contract, pipeline wiring, own
 * identity). Not checked here: that the skill's `npx paperlint submission …` commands are ones the
 * CLI runs — that belongs in vigiles (zernie/vigiles#395) — nor that the skill fires
 * (`submission-portal.eval.mjs`).
 */
import { test } from "vitest";
import { checkSkill } from "../../lib/skill-checks.mjs";

test("the shared per-skill checks pass", async () => {
  await checkSkill("submission-portal");
});
