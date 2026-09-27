/**
 * paper-pipeline — the orchestrator. Free, deterministic tier: no model, no network.
 *
 * WHAT AN ORCHESTRATOR CAN ACTUALLY BE TESTED FOR. It writes nothing and decides
 * nothing on its own; its whole claim is in one sentence of its own description —
 * "Routes to the stage skills". So the property is ROUTING INTEGRITY, in both
 * directions, and both directions catch a real failure:
 *
 *   forward   every name it routes to resolves to a skill on disk
 *             -> catches a skill renamed or removed while the conductor still
 *                points at the old name. The agent reads a route to nowhere.
 *
 *   backward  every skill this package ships is named by the conductor
 *             -> catches the far more common one: a stage skill added and never
 *                wired into the map, so the orchestrated run silently skips it.
 *
 * The skills the map does not name are held in an explicit list (NOT_IN_MAP), each
 * with its reason, and the list is checked for rot in both directions: an entry
 * naming a skill that no longer ships, or one the map HAS since named, fails — so
 * an exception cannot quietly outlive its reason.
 *
 * ⚠️ COVERAGE NOTE. Before this file, `paper-pipeline` counted as covered because
 * five older eval files sit in its directory — and every one of them measures
 * OTHER skills' firing. Colocation is evidence of PLACEMENT, not of content; this
 * skill was the live example of that gap in our own corpus.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordCheck } from "vigiles";
import { installedSkills } from "./scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(HERE, "..");
const SELF = "paper-pipeline";

const dirs = installedSkills(SKILLS_DIR);
const read = (d) => readFileSync(join(SKILLS_DIR, d, "SKILL.md"), "utf-8");

const src = read(SELF);

/**
 * Names the conductor routes to. Backticked tokens that ARE skill directories —
 * deliberately generous, because the tables use several row shapes and a strict
 * one silently under-counted (11 of 19 on the first attempt, which would have
 * made the backward check fail for the wrong reason).
 *
 * Being generous costs the forward direction its teeth: a token that does not
 * resolve is filtered out here rather than caught. So the forward check below
 * reads the RAW tokens instead, with a shape narrow enough to mean "this is a
 * skill reference".
 */
const routed = new Set(
  [...src.matchAll(/`([a-z0-9-]+)`/g)]
    .map((m) => m[1])
    .filter((n) => dirs.includes(n)),
);

// ── forward: a bolded backticked token in a routing table must be a real skill ──
// `**`name`**` is the map's own emphasis for "go run this one", so it is a claim
// about a skill and not about `pdflatex` or `jinja2` (plain backticks, correctly
// out of scope).
const asserted = [...src.matchAll(/\*\*`([a-z0-9-]+)`\*\*/g)].map((m) => m[1]);
assert.ok(
  asserted.length > 0,
  "found no routed skills at all — the extraction broke, not the map",
);
for (const name of new Set(asserted)) {
  assert.ok(
    dirs.includes(name),
    `paper-pipeline routes to \`${name}\`, and no .claude/skills/${name}/SKILL.md exists. ` +
      `The conductor points at nothing; a run following the map stalls there.`,
  );
  recordCheck();
}

// ── backward: every shipped skill is named somewhere in the map ──
/** Shipped skills the conductor does NOT name, each with why. */
const NOT_IN_MAP = new Map([
  [
    "cold-read-diff",
    "reached through `grade-paper-writing`, which routes to it; missing only from the map",
  ],
  [
    "sweep-design-space",
    "reached through `argument-arc`; missing only from the map",
  ],
  [
    "paper-status",
    "reports ON the pipeline rather than being a stage in it — the conductor has nothing to route to it",
  ],
  [
    "osf-artifact-upload",
    "a helper that uploads an artifact file, not a stage of writing a paper",
  ],
]);

for (const name of dirs) {
  if (name === SELF) continue;
  if (NOT_IN_MAP.has(name)) continue;
  assert.ok(
    routed.has(name),
    `${name} ships with this package and paper-pipeline never names it. A reader of the map ` +
      `does not learn the stage exists; name it in the map, or add it to NOT_IN_MAP with a reason.`,
  );
  recordCheck();
}

// ── the exception list must not rot, in BOTH directions ──
for (const [name, reason] of NOT_IN_MAP) {
  assert.ok(
    dirs.includes(name),
    `NOT_IN_MAP names "${name}" and no such skill ships — delete the entry. Recorded reason: "${reason}"`,
  );
  assert.ok(
    !routed.has(name),
    `NOT_IN_MAP still names "${name}", but paper-pipeline DOES name it now — delete the entry, ` +
      `so the assertion above starts protecting this skill.`,
  );
  recordCheck();
}

console.log(
  `✓ paper-pipeline routing: ${String(new Set(asserted).size)} routes resolve · ` +
    `${String(dirs.length - NOT_IN_MAP.size - 1)} skills named · ` +
    `${String(NOT_IN_MAP.size)} not in the map (${[...NOT_IN_MAP.keys()].join(", ")})`,
);
