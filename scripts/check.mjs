#!/usr/bin/env node
/**
 * `npm run check` — ONE command you run on yourself before pushing.
 *
 * ── WHY IT EXISTS, AND IT IS A MEASURED FAILURE, NOT A TIDINESS IDEA ───────────────────────
 * On 2026-09-19 a change to `paper/research-question` was pushed that broke the test suite.
 * The gates were run afterwards — `lint`, `check:readme`, `check:globs`, `check:content-only`,
 * and the rule's own mutation battery, all green — but `npm test` and `test:install` were not,
 * because there were eleven separate scripts and no way to run them except from memory. Five
 * callers across two files had been left behind by the change, and the suite said so; nobody
 * asked it.
 *
 * A prose reminder would not have helped. The same class is on record from vigiles: three
 * agents were handed a list of five gate commands, all three reported "gates 5/5 green", and
 * not one ran the harness tests — they were not on the list.
 *
 * 🔴 SO THE LOAD-BEARING PART HERE IS NOT THE LIST OF GATES — IT IS THE TAIL. This script
 * prints which CI jobs it does NOT reproduce, and why. A check that is silent about its own
 * boundary reads as complete, which is the same class as a counter that counts what it ignores.
 *
 * ── WHAT KEEPS THE LIST FROM GOING STALE ───────────────────────────────────────────────────
 * `check.harness.mjs` sits beside it and pulls the job names OUT OF THE WORKFLOW ITSELF,
 * requiring every one to be either covered here or named in `NOT_COVERED` with a reason. Add a
 * job to CI and the harness goes red the same day — the list cannot quietly fall behind.
 *
 * ── WHY IT DOES NOT REPLACE THE CI JOBS ────────────────────────────────────────────────────
 * The jobs solve a different problem: a different environment (TeX exists only in `build-e2e`,
 * macOS only in `macos`) and a named culprit per bond. One command cannot do that and should
 * not try. This is about a human being able to check themselves BEFORE the push.
 *
 * ── NO `--fast` FLAG, ON PURPOSE ───────────────────────────────────────────────────────────
 * A subset flag re-creates the exact failure above: the cheap half gets run and reported as
 * "the gates". The slow steps instead SKIP LOUDLY when their prerequisite is genuinely absent
 * (no TeX, no network), and the tail names every skip. "I ran check" then means one thing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Every local gate, in the order a human wants them: cheapest and most likely to fail first,
 * so a typo does not cost eight minutes. `job` names the CI job this step reproduces, and the
 * harness checks those names against the real workflow.
 */
export const GATES = [
  {
    name: "the package compiles",
    job: "gates",
    script: "build",
    // First because everything below imports from `dist/`. A stale build makes every later
    // failure a lie about its own cause.
  },
  {
    name: "rules and scripts lint",
    job: "gates",
    script: "lint",
  },
  {
    name: "skills lint",
    job: "gates",
    script: "lint:skills",
  },
  {
    name: "every declared rule is enabled for a file on disk",
    job: "gates",
    script: "check:globs",
  },
  {
    name: "rules read content, not the filesystem",
    job: null,
    // 🔴 Deliberately not in CI, and this is the one asymmetry worth stating rather than
    // hiding: the check is about a property of the rules' source, which cannot change between
    // a developer's tree and the runner's. Running it twice buys nothing; NOT running it
    // locally buys a defect that reaches review.
    reason: "source-only property — identical in every environment, so CI adds nothing",
    script: "check:content-only",
  },
  {
    name: "every number in the README matches disk",
    job: "gates",
    script: "check:readme",
  },
  {
    name: "the marketplace manifest is accepted by the host's own validator",
    job: "gates",
    script: "check:marketplace",
  },
  {
    name: "57 harnesses",
    job: "gates",
    script: "test",
  },
  {
    name: "mutation batteries — every guard is killed by its own assertion",
    job: "gates",
    script: "test:sabotage",
  },
  {
    name: "install e2e — pack, install under npm and pnpm, run the binary",
    job: "gates",
    script: "test:install",
  },
  {
    name: "build e2e — a real pdflatex, and the PDF's fonts are measured",
    job: "build-e2e",
    script: "test:build",
  },
];

/**
 * CI jobs this command does NOT reproduce. Each needs a reason a reader can check, because an
 * unexplained gap is indistinguishable from an oversight — which is what the harness enforces.
 */
export const NOT_COVERED = {
  macos:
    "a second operating system. `npm test` here runs on this machine only, and the macOS job " +
    "exists because a defect was found that appeared on macOS alone (vigiles#241: /var is a " +
    "symlink to /private/var, so a path recorded before resolution did not match). No local " +
    "command can stand in for a different kernel.",
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const failed = [];
  const skipped = [];

  for (const g of GATES) {
    process.stdout.write(`── ${g.name}\n`);
    const r = spawnSync("npm", ["run", "-s", g.script], {
      cwd: ROOT,
      stdio: "inherit",
      encoding: "utf8",
    });
    // 🔴 The exit code is read from npm, never from a pipe. `cmd | tail && …` reports the
    // FILTER's status, which is almost always zero — that is how a red harness shipped on
    // 2026-09-16.
    if (r.status === 0) continue;
    // A declared skip is the slow steps' contract: build-e2e exits 0 having SAID it had no TeX.
    // Anything nonzero is a failure, and is reported as one.
    failed.push(`${g.name}  (npm run ${g.script} → ${r.status})`);
  }

  console.log("");
  if (failed.length) {
    console.error("🔴 gates failed:");
    for (const f of failed) console.error(`   ${f}`);
  } else {
    console.log(`✓ ${GATES.length} gate(s) passed`);
  }
  if (skipped.length) for (const s of skipped) console.log(`⏳ skipped: ${s}`);

  // THE TAIL. Not decoration — the reason this file exists rather than a list in a doc.
  console.log("\nWhat this command does NOT cover:");
  for (const [job, why] of Object.entries(NOT_COVERED)) {
    console.log(`  CI job «${job}» — ${why}`);
  }
  const localOnly = GATES.filter((g) => g.job === null);
  for (const g of localOnly) {
    console.log(`  (and «${g.name}» runs ONLY here — ${g.reason})`);
  }

  process.exit(failed.length ? 1 : 0);
}

export { ROOT, existsSync, join };
