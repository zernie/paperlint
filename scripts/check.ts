#!/usr/bin/env node
/**
 * `npm run check` — ONE command you run on yourself before pushing.
 *
 * ── WHY IT EXISTS, AND IT IS A MEASURED FAILURE, NOT A TIDINESS IDEA ───────────────────────
 * On 2026-09-19 a change to `paper/research-question` was pushed that broke the test suite.
 * The gates were run afterwards — `lint`, `check:readme`, `check:globs`, `check:content-only`,
 * and the rule's own (since-removed) mutation battery, all green — but `npm test` and `test:install` were not,
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
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

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
/**
 * How CI runs a gate that has no step of its own: the step that runs it as a side effect, and the
 * npm lifecycle script through which it does. `check.harness.mjs` requires that step in the job
 * and that lifecycle script to be the gate's own command, so the two cannot drift apart.
 */
export interface RunInCi {
  readonly step: string;
  readonly lifecycle: "prepare";
}

/**
 * A gate runs either an npm script or a command of its own — never both. Only an npm script can be
 * run by CI through a lifecycle script (`inCi`); every other gate has a step that runs its command.
 */
type GateCommand =
  | {
      readonly script: string;
      readonly run?: undefined;
      readonly inCi?: RunInCi;
    }
  | {
      readonly run: readonly [string, ...string[]];
      readonly script?: undefined;
      readonly inCi?: undefined;
    };

/**
 * A gate reproduces a CI job, or runs only here and says why (`job: null` needs a `reason`, or it
 * becomes the quiet way to drop something out of CI).
 */
export type Gate = { readonly name: string } & GateCommand &
  (
    | { readonly job: string; readonly reason?: undefined }
    | { readonly job: null; readonly reason: string }
  );

/** What `runGates` needs from a finished process: its exit status, `null` when a signal ended it. */
export type Spawn = (
  cmd: string,
  args: readonly string[],
  options: {
    cwd: string;
    stdio: "inherit";
    encoding: "utf8";
    env: NodeJS.ProcessEnv;
  },
) => { readonly status: number | null };

export type Outcome = "pass" | "skip" | "fail";

export const GATES: readonly Gate[] = [
  {
    name: "the package compiles",
    job: "gates",
    script: "build",
    // CI has no `npm run build` step: `npm ci` runs `prepare`, which is `tsc` as well.
    inCi: { step: "npm ci", lifecycle: "prepare" },
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
    run: ["vigiles", "lint", ".", "README.md"],
    // README.md is passed to `vigiles lint` by name: it is not an instruction file, so vigiles
    // would not open it on its own. The marks tie the `paperlint init` and `paperlint new` sections to the
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
    run: ["node", "scripts/rules-see-files.mjs"],
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
    run: ["node", "scripts/rules-are-content-only.mjs"],
  },
  {
    name: "every test, under coverage — vitest, then the vigiles harnesses, with c8's thresholds (npm run coverage)",
    job: "gates",
    script: "coverage",
    // `npm run coverage` IS `npm test`, run under c8 with `--check-coverage` (.c8rc.json holds
    // the thresholds). One run, not two: the tests pass and the coverage floor holds, or the gate
    // is red and says which.
  },
  {
    // vitest transpiles without type-checking, so the tests' types are checked here.
    name: "the tests type-check",
    job: "gates",
    run: ["tsc", "-p", "tsconfig.test.json"],
  },
  {
    name: "legacy layer exemptions are frozen — none new, none grown (#76)",
    job: "gates",
    run: ["node", "scripts/layer-legacy-frozen.ts"],
  },
  {
    name: "install e2e — pack, install under npm and pnpm, run the binary",
    job: "gates",
    run: ["node", "test/e2e/install.ts"],
  },
  {
    name: "build e2e — a real pdflatex, and the PDF's fonts are measured",
    job: "build-e2e",
    run: ["node", "test/e2e/build.ts"],
  },
  {
    name: "banal e2e — the real banal on pdf.js-written XML gives banal-on-pdftohtml's numbers",
    job: "build-e2e",
    run: ["node", "test/e2e/banal.ts"],
  },
  {
    name: "toolchain e2e — real TeX Live into $PAPERLINT_TEXLIVE_DIR, then a build with only it on PATH",
    job: "build-e2e",
    run: ["node", "test/e2e/toolchain.ts"],
  },
];

/** The command line a gate runs, as an argument list. */
export function commandOf(gate: Gate): readonly [string, ...string[]] {
  return gate.script !== undefined
    ? ["npm", "run", "-s", gate.script]
    : gate.run;
}

/**
 * CI jobs this command does NOT reproduce. Each needs a reason a reader can check, because an
 * unexplained gap is indistinguishable from an oversight — which is what the harness enforces.
 */
export const NOT_COVERED: Readonly<Record<string, string>> = {
  // build-e2e's macOS cell is the one part of a covered job no local command can stand in for:
  // it exists because issue #9 appeared on macOS alone (/var is a symlink to /private/var).
  merge:
    "dependabot-automerge.yml merges the bot's own pull requests once CI is green. It checks " +
    "nothing itself; there is no local equivalent because it acts on GitHub, not on the tree.",
  release:
    "release.yml publishes to npm and tags a GitHub release; running it locally would publish. " +
    "What can break it silently, the release notes, is rendered by scripts/release-config.test.ts in npm test.",
  validate:
    "pr-title.yml checks the pull request's TITLE (the squash commit semantic-release reads), " +
    "which exists only on GitHub, not in the tree.",
};

/**
 * Exit 77 means "declared skip" — the same code vigiles' runner uses (`SKIP_EXIT_CODE`). The e2e steps exit 77 when a tool they need is
 * absent and --strict is off. Anything else nonzero is a failure.
 *
 * 🔴 A SKIP IS A THIRD OUTCOME. Until the Codex review on #45 the e2e steps exited 0 on a skip,
 * this loop counted that as a pass, and `skipped` below was declared and never filled: a machine
 * without pnpm or TeX printed "all gates passed" for runs that never happened.
 */
export const SKIP_EXIT = 77;
export function outcome(status: number | null): Outcome {
  if (status === 0) return "pass";
  if (status === SKIP_EXIT) return "skip";
  return "fail";
}

/** The gates that did not pass, each as the line the verdict prints, split by outcome. */
interface NotPassed {
  failed: string[];
  skipped: string[];
}

/** Run each gate in order; `write` announces it before it starts. */
function runEach(
  gates: readonly Gate[],
  spawn: Spawn,
  write: (text: string) => unknown,
): NotPassed {
  const BIN_FIRST_PATH = [join(ROOT, "node_modules", ".bin"), process.env.PATH]
    .filter(Boolean)
    .join(delimiter);
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const g of gates) {
    write(`── ${g.name}\n`);
    const [cmd, ...args] = commandOf(g);
    const r = spawn(cmd, args, {
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
    else failed.push(`${g.name}  (${shown} → ${String(r.status)})`);
  }
  return { failed, skipped };
}

/** The verdict, then THE TAIL. */
function report(
  gates: readonly Gate[],
  { failed, skipped }: NotPassed,
  { log, err }: { log: (line: string) => void; err: (line: string) => void },
): void {
  log("");
  if (failed.length) {
    err("🔴 gates failed:");
    for (const f of failed) err(`   ${f}`);
  } else {
    const passed = gates.length - skipped.length;
    log(
      `✓ ${String(passed)} gate(s) passed${skipped.length ? `, ${String(skipped.length)} SKIPPED — not run, not passed` : ""}`,
    );
  }
  for (const s of skipped) log(`⏳ skipped: ${s}`);

  // THE TAIL. Not decoration — the reason this file exists rather than a list in a doc.
  log("\nWhat this command does NOT cover:");
  for (const [job, why] of Object.entries(NOT_COVERED)) {
    log(`  CI job «${job}» — ${why}`);
  }
  for (const g of gates.filter((x) => x.job === null)) {
    log(`  (and «${g.name}» runs ONLY here — ${String(g.reason)})`);
  }
}

/**
 * Run every gate in order and print the verdict and THE TAIL. `spawn`, `log`, `err` and `write`
 * are injected so a test can drive every outcome without running eleven real gates.
 *
 * @returns the exit code: 1 when a gate failed, else 0 (a skip is not a failure, and says so).
 */
export function runGates({
  gates = GATES,
  spawn = spawnSync,
  log = console.log,
  err = console.error,
  write = (s: string) => process.stdout.write(s),
}: {
  gates?: readonly Gate[];
  spawn?: Spawn;
  log?: (line: string) => void;
  err?: (line: string) => void;
  write?: (text: string) => unknown;
} = {}): number {
  const notPassed = runEach(gates, spawn, write);
  report(gates, notPassed, { log, err });
  return notPassed.failed.length ? 1 : 0;
}

if (isMain(import.meta.url)) process.exit(runGates());

export { ROOT, existsSync, join };
