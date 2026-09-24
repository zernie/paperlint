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
 * The jobs solve a different problem: a different environment (TeX Live exists only in
 * `build-e2e`, and macOS only in its second matrix cell) and a named culprit per bond. One command cannot do that and should
 * not try. This is about a human being able to check themselves BEFORE the push.
 *
 * ── NO `--fast` FLAG, ON PURPOSE ───────────────────────────────────────────────────────────
 * A subset flag re-creates the exact failure above: the cheap half gets run and reported as
 * "the gates". The slow steps instead SKIP LOUDLY when their prerequisite is genuinely absent
 * (no TeX, no network), and the tail names every skip. "I ran check" then means one thing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Every local gate, in the order a human wants them: cheapest and most likely to fail first,
 * so a typo does not cost eight minutes. `job` names the CI job this step reproduces, and the
 * harness checks those names against the real workflow.
 *
 * Each gate says how it runs in one of two ways:
 *   - `script` — an npm script that people also run by hand (`build`, `lint`, `fmt:check`, `test`);
 *   - `run` — the command itself, for checks that have no npm script of their own. Keeping these
 *     out of package.json keeps its script list short; this file is the one place they are listed.
 * Programs installed by npm (`vigiles`, `eslint`) are found because `node_modules/.bin` is put
 * first on PATH below, the same way `npm run` does it.
 */
const locked = (...cmd) => ["node", "scripts/exclusive.mjs", ...cmd];

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
    name: "skills lint, and the vigiles marks in README.md and CLAUDE.md",
    job: "gates",
    run: locked("vigiles", "lint", ".", "README.md"),
    // README.md is passed to `vigiles lint` by name: it is not an instruction file, so vigiles
    // would not open it on its own. The marks tie the `rpp init` and `rpp new` sections to the
    // functions that implement them, and the lint fails when either function is renamed.
  },
  {
    name: "formatting",
    job: "gates",
    script: "fmt:check",
    // Prettier defaults, the same config as vigiles. What it must not touch — compiled
    // SKILL.md, fixture data, raw runs — is listed in `.prettierignore` with the reason.
  },
  {
    name: "every declared rule is enabled for a file on disk",
    job: "gates",
    run: locked("node", "scripts/rules-see-files.mjs"),
  },
  {
    name: "rules read content, not the filesystem",
    job: null,
    // 🔴 Deliberately not in CI, and this is the one asymmetry worth stating rather than
    // hiding: the check is about a property of the rules' source, which cannot change between
    // a developer's tree and the runner's. Running it twice buys nothing; NOT running it
    // locally buys a defect that reaches review.
    reason:
      "source-only property — identical in every environment, so CI adds nothing",
    run: locked("node", "scripts/rules-are-content-only.mjs"),
  },
  {
    name: "the marketplace manifest is accepted by the host's own validator",
    job: "gates",
    run: locked("node", "scripts/marketplace-shape.mjs"),
  },
  {
    name: "every harness (npm test)",
    job: "gates",
    script: "test",
  },
  {
    name: "mutation batteries are frozen — none new, none grown (#52)",
    job: "gates",
    run: locked("node", "scripts/mutation-batteries-frozen.mjs"),
  },
  {
    name: "mutation batteries — every guard is killed by its own assertion",
    job: "gates",
    run: locked("node", "scripts/run-mutations.mjs"),
  },
  {
    name: "install e2e — pack, install under npm and pnpm, run the binary",
    job: "gates",
    run: locked("node", "test/e2e/install.mjs"),
  },
  {
    name: "build e2e — a real pdflatex, and the PDF's fonts are measured",
    job: "build-e2e",
    run: locked("node", "test/e2e/build.mjs"),
  },
  {
    name: "toolchain e2e — real TeX Live into $RPP_TEXLIVE_DIR, then a build with only it on PATH",
    job: "build-e2e",
    run: locked("node", "test/e2e/toolchain.mjs"),
  },
];

/** The command line a gate runs, as an argument list. */
export function commandOf(gate) {
  return gate.script ? ["npm", "run", "-s", gate.script] : gate.run;
}

/**
 * CI jobs this command does NOT reproduce. Each needs a reason a reader can check, because an
 * unexplained gap is indistinguishable from an oversight — which is what the harness enforces.
 */
export const NOT_COVERED = {
  // build-e2e's macOS cell is the one part of a covered job no local command can stand in for:
  // it exists because issue #9 appeared on macOS alone (/var is a symlink to /private/var).
  merge:
    "dependabot-automerge.yml merges the bot's own pull requests once CI is green. It checks " +
    "nothing itself; there is no local equivalent because it acts on GitHub, not on the tree.",
};

/**
 * Exit 77 means "declared skip" — the same code vigiles' runner uses (`SKIP_EXIT_CODE`), and the
 * one lib/mutation-driver.mjs already recognizes. The e2e steps exit 77 when a tool they need is
 * absent and --strict is off. Anything else nonzero is a failure.
 *
 * 🔴 A SKIP IS A THIRD OUTCOME. Until the Codex review on #45 the e2e steps exited 0 on a skip,
 * this loop counted that as a pass, and `skipped` below was declared and never filled: a machine
 * without pnpm or TeX printed "all gates passed" for runs that never happened.
 */
export const SKIP_EXIT = 77;
export function outcome(status) {
  if (status === 0) return "pass";
  if (status === SKIP_EXIT) return "skip";
  return "fail";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const BIN_FIRST_PATH = [join(ROOT, "node_modules", ".bin"), process.env.PATH]
    .filter(Boolean)
    .join(delimiter);
  const failed = [];
  const skipped = [];

  for (const g of GATES) {
    process.stdout.write(`── ${g.name}\n`);
    const [cmd, ...args] = commandOf(g);
    const r = spawnSync(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      encoding: "utf8",
      env: { ...process.env, PATH: BIN_FIRST_PATH },
    });
    // 🔴 The exit code is read from the command itself, never from a pipe. `cmd | tail && …`
    // reports the FILTER's status, which is almost always zero — that is how a red harness
    // shipped on 2026-09-16.
    const o = outcome(r.status);
    if (o === "pass") continue;
    const shown = commandOf(g).join(" ");
    if (o === "skip") skipped.push(`${g.name}  (${shown} → ${SKIP_EXIT})`);
    else failed.push(`${g.name}  (${shown} → ${r.status})`);
  }

  console.log("");
  if (failed.length) {
    console.error("🔴 gates failed:");
    for (const f of failed) console.error(`   ${f}`);
  } else {
    const passed = GATES.length - skipped.length;
    console.log(
      `✓ ${passed} gate(s) passed${skipped.length ? `, ${skipped.length} SKIPPED — not run, not passed` : ""}`,
    );
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
