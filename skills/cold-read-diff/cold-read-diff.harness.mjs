/**
 * cold-read-diff — the free, deterministic tier. No model, no network.
 *
 * COLOCATED ON PURPOSE. vigiles decides coverage by PLACEMENT as of 2026-08-11:
 * a test that merely names a surface no longer counts, because that tier was
 * crediting surfaces nothing touched. So each skill needs a file inside its own
 * directory — this one.
 *
 * The shared assertions live in `lib/skill-checks.mjs` and are CALLED here with
 * this skill's name. What this proves: this skill's frontmatter parses as strict YAML,
 * its declared tool contract is sane, its pipeline wiring points at scripts that exist.
 *
 * And, for this skill only (#405, #301): it does NOT run as a forked agent, and it tells
 * the caller to start `scripts/cold-read.js` in the background and never to fix the paper
 * inside the check. A forked orchestrator was what blocked the caller for 15–35 minutes,
 * fixed and rebuilt the paper, and returned its whole report into the caller's context.
 *
 * What it does NOT prove: that the skill fires, or that the readers' answers are good. Those
 * need a real model — see `cold-read-diff.eval.mjs`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSkill } from "../../lib/skill-checks.mjs";

await checkSkill("cold-read-diff");

const md = readFileSync(new URL("SKILL.md", import.meta.url), "utf8");
const frontmatter = md.split(/^---$/m)[1] ?? "";
assert.doesNotMatch(
  frontmatter,
  /^context:\s*fork/m,
  "cold-read-diff runs as a forked agent again: the fork is the orchestrator that blocked the caller (#405)",
);
assert.match(
  md,
  /\$\{CLAUDE_SKILL_DIR\}\/scripts\/cold-read\.js/,
  "cold-read-diff no longer instructs its script; an agent would rebuild the extract by hand (#301)",
);
assert.match(
  md,
  /run_in_background/,
  "cold-read-diff no longer tells the caller to run the read in the background (#405)",
);
assert.doesNotMatch(
  md,
  /^\d+\.\s+\*\*Apply the fixes/m,
  "cold-read-diff applies fixes inside the check again; the caller decides (#405)",
);
