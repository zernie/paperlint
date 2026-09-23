/**
 * skill-contract.mutations.mjs — the non-vacuity proof for the colocated skill harnesses.
 *
 * Run: `node skills/skill-contract.mutations.mjs` (~1 min; it rewrites each SKILL.md and restores
 * it, so it is not part of the plain test run).
 *
 * ── WHY IT EXISTS, AND WHY IT ARRIVED WITH THE SKILLS ───────────────────────
 * `scripts/run-mutations.mjs` refuses a repository where some `*.harness.mjs` is named by no
 * battery, and the refusal is the whole argument of this package: silence is the success state of
 * every check here, so «it passed» and «it cannot fail» are byte-identical from outside. The ten
 * skill harnesses arrived on 2026-09-12 and were orphans the moment they landed — the guard said
 * so on the first run, which is exactly what a guard is for.
 *
 * ── HOW THE SKILLS ARE REACHED FROM INSIDE THIS PACKAGE ─────────────────────
 * 🔴 `checkSkill()` looks at `<consumerRoot>/.claude/skills/<name>/SKILL.md` — the fixed Claude
 * Code layout — not at `skills/<name>` where this repository keeps them. So this repository is its
 * OWN FIRST CONSUMER: `.claude/skills/<name>` is a symlink to `../../skills/<name>`, and
 * `.claude/skills/paper-pipeline/scripts` is a symlink to the real scripts directory, so the path
 * every SKILL.md's prose names (`node .claude/skills/paper-pipeline/scripts/announce.mjs …`)
 * resolves here too. Without those symlinks `skill-corpus.mjs` throws while LOADING, and a harness
 * whose module fails to load is reported by `vigiles test` as SKIPPED with exit code 0 — a green
 * run that tested nothing. That is not a hypothetical: it is what the first attempt printed.
 *
 * Because the symlinks point back at `skills/`, an edit to `skills/<n>/SKILL.md` IS the edit the
 * harness sees. The driver therefore writes the real file and restores it, verifying both.
 *
 * ── THE DEFECT EACH CASE PLANTS, AND WHY THAT ONE ───────────────────────────
 * Nine of the ten are `checkSkill()` one-liners, so they all fail the same way and one defect
 * shape covers them: make the skill announce under a SIBLING'S name. It is the defect the
 * assertion exists for — these record blocks are copy-paste templates differing in one token,
 * `announce.mjs` validates nothing, and the wrong gate then reads FRESH in `status.mjs` while the
 * right one reads NEVER-RUN. Each case names a DIFFERENT sibling so that no two cases could pass
 * on one shared accident.
 *
 * `osf-artifact-upload` is not a `checkSkill()` skill (it carries no `announce.mjs <self>` line —
 * it is a utility `submit-paper` composes with, not a stage), so its case plants the defect ITS
 * harness is about: a `curl` that loses `-g`, which makes a bracketed OSF parameter glob and the
 * request fail silently.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../lib/mutation-driver.mjs";
import { consumerRoot } from "./paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const md = (s) => join(HERE, s, "SKILL.md");
const harness = (s) => join(HERE, s, `${s}.harness.mjs`);

/** [skill, the sibling it is made to announce under] — every sibling distinct. */
const ANNOUNCERS = [
  ["analyze-sibling-paper", "map-prior-work"],
  ["argument-arc", "tighten-paper"],
  ["cold-read-diff", "argument-arc"],
  ["draft-paper", "build-benchmark"],
  ["map-prior-work", "find-venue"],
  ["paper-adversarial-review", "pc-panel-review"],
  ["pc-panel-review", "harden-paper"],
  ["sweep-design-space", "research-ideate"],
  ["tighten-paper", "grade-paper-writing"],
  // ── wave ② (2026-09-12). Same defect shape: all twelve are `checkSkill()` stage skills
  // carrying exactly one `announce.mjs <self>` line, verified unambiguous before these were
  // written. Siblings stay pairwise distinct across the WHOLE list, so no two cases can pass
  // on one shared accident.
  ["build-benchmark", "draft-paper"],
  ["camera-ready", "extend-paper"],
  ["harden-paper", "paper-adversarial-review"],
  ["paper-status", "render-paper"],
  ["extend-paper", "camera-ready"],
  ["study-accepted-papers", "analyze-sibling-paper"],
  ["verify-citations", "cold-read-diff"],
  ["render-paper", "paper-status"],
  ["find-venue", "plan-paper-timeline"],
  ["research-ideate", "sweep-design-space"],
  ["plan-paper-timeline", "study-accepted-papers"],
  ["grade-paper-writing", "verify-citations"],
  // ── wave ③ (2026-09-12). `submit-paper` is a `checkSkill()` stage skill with exactly one
  // `announce.mjs submit-paper` line (verified unambiguous before this was written). Its sibling
  // is the conductor itself — the only name left that keeps the whole list pairwise distinct, and
  // a fitting one: recording a submission under the orchestrator's gate is precisely the
  // copy-paste slip that reads FRESH on the wrong row.
  ["submit-paper", "paper-pipeline"],
];

// 🔴 "Every sibling is distinct" is an ASSERTION, not a wish stated in a comment. The list is
// written by hand, and exactly this kind of list has already rotted silently before. If two cases
// mutate into the same name, they can pass on one shared accident, and the battery stops being
// able to tell their failures apart.
{
  const seen = new Set();
  for (const [skill, sibling] of ANNOUNCERS) {
    if (skill === sibling)
      throw new Error(
        `${skill}: the sibling must be DIFFERENT from the skill itself`,
      );
    if (seen.has(sibling))
      throw new Error(
        `sibling "${sibling}" is named twice — the cases stopped being independent. ` +
          `Each case needs its own, otherwise two of them can pass on one shared accident.`,
      );
    seen.add(sibling);
  }
}

const CASES = ANNOUNCERS.map(([skill, sibling]) => ({
  name: `${skill}: announces as ${sibling}`,
  disables:
    "the identity check — a run recorded under a sibling's gate, which then reads FRESH",
  edits: [[md(skill), `announce.mjs ${skill} `, `announce.mjs ${sibling} `]],
  harness: harness(skill),
  expect: "its announce command files under",
}));

CASES.push({
  name: "osf-artifact-upload: one curl loses -g",
  disables:
    "the globbing rule this skill states in its own §gotchas, three paragraphs above the command",
  // 🔴 ANCHORED ON THE ONE CALL THAT IS UNIQUE, not on the shared prefix. `curl -g -s --retry 3`
  // appears three times, and the driver refuses an ambiguous target rather than guessing — which
  // is how the first version of this case reported AMBIGUOUS instead of quietly mutating one of
  // three and calling it a kill.
  edits: [
    [
      md("osf-artifact-upload"),
      'curl -g -s --retry 3 --cacert $CA -H "$AUTH" https://api.osf.io/v2/users/me/',
      'curl -s --retry 3 --cacert $CA -H "$AUTH" https://api.osf.io/v2/users/me/',
    ],
  ],
  harness: harness("osf-artifact-upload"),
  expect: 'command(s) omit "-g"',
});

// ── wave ③: the conductor. NOT a `checkSkill()` skill — its harness (`paper-pipeline.harness.mjs`)
// checks ROUTING INTEGRITY, so the defect has to be a routing one, the same way
// `osf-artifact-upload` above gets the defect ITS harness is about.
//
// 🔴 THE FORWARD DIRECTION IS THE ONE A MUTATION CAN REACH. Backward ("a wired stage the map never
// names") cannot be planted by editing the map alone — deleting a route makes the skill un-named,
// which is exactly what the MISSING allowance list tolerates for three skills, so the kill would
// depend on which name was picked. Forward is unconditional: a bolded backticked token in a routing
// table that resolves to no skill directory is a route to nowhere, and a run following the map
// stalls there. `**\`camera-ready\`**` occurs exactly once, so the edit cannot be ambiguous.
CASES.push({
  name: "paper-pipeline: the map routes to a skill that does not exist",
  disables:
    "forward routing integrity — the conductor pointing at a name with no SKILL.md behind it",
  edits: [
    [md("paper-pipeline"), "**`camera-ready`**", "**`camera-ready-v2`**"],
  ],
  harness: harness("paper-pipeline"),
  expect: "no .claude/skills/camera-ready-v2/SKILL.md exists",
});

// 🔴 A FLOOR, NOT A COMMENT. The list above is written by hand, and a hand-written list of paths
// is the thing this package replaced in `package.json` on 2026-09-11 because it had already
// rotted SILENTLY. A skill added to `skills/` with a colocated harness and no case here would be
// caught by `run-mutations.mjs` — but only on the run AFTER someone added it, and only if they
// ran it. This asserts the pairing from the other side, at import time.
// 🔴 THE `paper-pipeline` EXCLUSION IS GONE (wave ③, 2026-09-12). It was written when that
// directory held only `scripts/` — no SKILL.md, no colocated harness, nothing for a case to kill.
// Both arrived with wave ③, so the exclusion would now hide the orchestrator from the very floor
// that exists to notice an uncovered harness: `e.name !== "paper-pipeline"` and «it has no harness»
// were the same statement for one day and are opposite statements now.
const withHarness = readdirSync(HERE, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((n) => readdirSync(join(HERE, n)).includes(`${n}.harness.mjs`));
const covered = new Set(CASES.map((c) => c.harness));
const missing = withHarness.filter((n) => !covered.has(harness(n)));
if (missing.length)
  throw new Error(
    `skill-contract.mutations.mjs covers no case for: ${missing.join(", ")}.\n` +
      `Each skill directory carrying <name>.harness.mjs needs a case here, or that harness is a ` +
      `test nothing can kill — green and silent whether or not it still checks anything.`,
  );

process.exit(
  runMutations({ root: consumerRoot(), runner: "vigiles", cases: CASES }),
);
