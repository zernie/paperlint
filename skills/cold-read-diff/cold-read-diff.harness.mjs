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
 * And, for this skill only (#405, #301): it runs INLINE, not as a forked agent — the fork was
 * the orchestrator that blocked the caller for 15–35 minutes, read the whole paper, fixed and
 * rebuilt it, and returned its whole report into the caller's context. So the skill must: name
 * its extractor script; start its readers with the Agent tool, in the background, on sonnet;
 * never shell out to `claude -p` for them; and never apply fixes inside the check.
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
const tools = /^allowed-tools:\s*\[([^\]]*)\]/m.exec(frontmatter)?.[1] ?? "";

const shape = [
  [
    !/^context:\s*fork/m.test(frontmatter),
    "it runs as a forked agent again: the fork blocked the caller (#405)",
  ],
  [
    /\bAgent\b/.test(tools),
    "Agent is not in allowed-tools, so the readers cannot be started",
  ],
  [
    /\$\{CLAUDE_SKILL_DIR\}\/scripts\/cold-read\.js/.test(md),
    "it no longer names its extractor; the extract gets rebuilt by hand (#301)",
  ],
  [
    /run_in_background: true/.test(md),
    "it no longer starts the readers in the background (#405)",
  ],
  [/model: "sonnet"/.test(md), "it no longer puts the readers on sonnet"],
  [!/claude -p/.test(md), "it shells out to `claude -p` for the readers again"],
  [
    !/^\d+\.\s+\*\*Apply the fixes/m.test(md),
    "it applies fixes inside the check again; the author decides (#405)",
  ],
];
const broken = shape
  .filter(([ok]) => !ok)
  .map(([, why]) => `cold-read-diff: ${why}`);
assert.deepEqual(broken, [], broken.join("\n"));
