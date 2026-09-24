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
 *   backward  every pipeline-wired skill is named by the conductor
 *             -> catches the far more common one: a stage skill added and never
 *                wired into the map, so the orchestrated run silently skips it.
 *
 * 🔴 THE BACKWARD DIRECTION IS RED TODAY, WHICH IS WHY IT IS WORTH WRITING.
 * Three wired skills are absent from the conductor (see MISSING below). Two are
 * genuine stages. They are held in an explicit list rather than asserted away,
 * and the list is checked for rot in both directions: an entry naming a skill
 * that stopped being wired, or one that HAS since been routed, fails — so the
 * debt cannot quietly become permanent.
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

/** Same contract `skill-checks.mjs` derives membership from: a skill announces ITSELF. */
const PIPELINE_MARKER =
  /^\s*node\s+\.claude\/skills\/paper-pipeline\/scripts\/announce\.mjs\s+([a-z0-9-]+)/m;

const dirs = installedSkills(SKILLS_DIR);
const read = (d) => readFileSync(join(SKILLS_DIR, d, "SKILL.md"), "utf-8");
const wired = dirs.filter((d) => PIPELINE_MARKER.test(read(d)));

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

// ── backward: every wired stage skill is named somewhere in the map ──
/**
 * Wired skills the conductor does NOT name, each with why it is tolerated TODAY.
 * Dated, because an undated allowance is indistinguishable from an oversight —
 * the same argument `skill-checks.mjs` makes about its own EXCLUDED map.
 */
const MISSING = new Map([
  [
    "cold-read-diff",
    "2026-08-11 — absent from the MAP but NOT unreachable: it is in EXPECTED_GATES and `grade-paper-writing` routes to it, so a run gets there. Belongs in the map for discoverability; not added here because the pipeline is being reworked in parallel",
  ],
  [
    "sweep-design-space",
    "2026-08-11 — same shape: in EXPECTED_GATES, reached via `argument-arc`, missing only from the map. Deferred to the rework",
  ],
  [
    "paper-status",
    "reports ON the pipeline rather than being a stage in it — the conductor has nothing to route to it",
  ],
]);

for (const name of wired) {
  if (name === SELF) continue;
  if (MISSING.has(name)) continue;
  assert.ok(
    routed.has(name),
    `${name} is a wired pipeline skill and paper-pipeline never names it. Whether that STRANDS ` +
      `it depends on whether a sibling routes to it — check before calling it unreachable ` +
      `(measured 2026-08-11: both known-absent skills WERE reachable via a sibling, and the ` +
      `first version of this message claimed otherwise). What it always costs is discoverability: ` +
      `a reader of the map does not learn the stage exists.`,
  );
  recordCheck();
}

// ── the allowance list must not rot, in BOTH directions ──
for (const [name, reason] of MISSING) {
  assert.ok(
    dirs.includes(name),
    `MISSING names "${name}" and no such skill exists — delete the entry. Recorded reason: "${reason}"`,
  );
  assert.ok(
    wired.includes(name),
    `MISSING names "${name}", which is no longer a wired pipeline skill, so the allowance covers ` +
      `nothing. Recorded reason: "${reason}"`,
  );
  assert.ok(
    !routed.has(name),
    `MISSING still names "${name}", but paper-pipeline DOES name it now — the debt was paid and the ` +
      `entry is stale. Delete it, so the assertion above starts protecting this skill.`,
  );
  recordCheck();
}

console.log(
  `✓ paper-pipeline routing: ${String(new Set(asserted).size)} routes resolve · ` +
    `${String(wired.length - MISSING.size - 1)} wired skills reachable · ` +
    `${String(MISSING.size)} known-absent (${[...MISSING.keys()].join(", ")})`,
);
