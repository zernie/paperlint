/**
 * skill-contract.mutations.mjs — the non-vacuity proof for the ten colocated skill harnesses.
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
];

const CASES = ANNOUNCERS.map(([skill, sibling]) => ({
  name: `${skill}: announces as ${sibling}`,
  disables: "the identity check — a run recorded under a sibling's gate, which then reads FRESH",
  edits: [[md(skill), `announce.mjs ${skill} `, `announce.mjs ${sibling} `]],
  harness: harness(skill),
  expect: "its announce command files under",
}));

CASES.push({
  name: "osf-artifact-upload: one curl loses -g",
  disables: "the globbing rule this skill states in its own §gotchas, three paragraphs above the command",
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

// 🔴 A FLOOR, NOT A COMMENT. The list above is written by hand, and a hand-written list of paths
// is the thing this package replaced in `package.json` on 2026-09-11 because it had already
// rotted SILENTLY. A skill added to `skills/` with a colocated harness and no case here would be
// caught by `run-mutations.mjs` — but only on the run AFTER someone added it, and only if they
// ran it. This asserts the pairing from the other side, at import time.
const withHarness = readdirSync(HERE, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "paper-pipeline")
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

process.exit(runMutations({ root: consumerRoot(), runner: "vigiles", cases: CASES }));
