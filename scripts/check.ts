#!/usr/bin/env node
/**
 * `npm run check` — ONE command you run on yourself before pushing.
 *
 * ── WHY IT EXISTS, AND IT IS A MEASURED FAILURE, NOT A TIDINESS IDEA ───────────────────────
 * On 2026-09-19 a change to a lint rule was pushed that broke the test suite.
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
 * `check.harness.ts` sits beside it and pulls the job names OUT OF THE WORKFLOW ITSELF,
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
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
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
 * npm lifecycle script through which it does. `check.harness.ts` requires that step in the job
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
      /**
       * The script is a vitest run, so its JSON report says how many tests were SKIPPED: a run
       * whose exit is 0 and whose report counts a skip is a skip, not a pass.
       */
      readonly vitest?: true;
    }
  | {
      readonly run: readonly [string, ...string[]];
      readonly script?: undefined;
      readonly inCi?: undefined;
      readonly vitest?: undefined;
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
    script: "test:e2e:install",
    vitest: true,
  },
  {
    name: "TeX e2e — real TeX Live: paperlint toolchain, a real pdflatex build of every fixture, the real banal",
    job: "build-e2e",
    script: "test:e2e:tex",
    vitest: true,
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
 * vitest's JSON report, as far as the verdict reads it: skipped (`pending`) and `todo` tests.
 *
 * 🔴 A SKIP IS A THIRD OUTCOME. Until the Codex review on #45 the e2e runs exited 0 on a skip and
 * this loop counted that as a pass: a machine without pnpm or TeX printed "all gates passed" for
 * runs that never happened. The count comes from the runner's own report, not from an exit code
 * the tests would have to agree on.
 */
const VitestReport = z.looseObject({
  numPendingTests: z.number().int().nonnegative(),
  numTodoTests: z.number().int().nonnegative(),
});

/** How many tests a vitest JSON report says were not run, or null when it is not one. */
export function skippedIn(report: string | null): number | null {
  if (report === null) return null;
  try {
    const r = VitestReport.safeParse(JSON.parse(report));
    return r.success ? r.data.numPendingTests + r.data.numTodoTests : null;
  } catch {
    return null;
  }
}

/**
 * A gate's outcome from its exit status and, for a vitest gate, the skip count its report gave
 * (`null`: the report is missing or unreadable, which cannot be read as a pass).
 */
export function outcome(
  status: number | null,
  vitest?: { readonly skipped: number | null },
): Outcome {
  if (status !== 0) return "fail";
  if (vitest === undefined) return "pass";
  if (vitest.skipped === null) return "fail";
  return vitest.skipped > 0 ? "skip" : "pass";
}

/** The gates that did not pass, each as the line the verdict prints, split by outcome. */
interface NotPassed {
  failed: string[];
  skipped: string[];
}

/** A report file's text, read once and removed; null when the run wrote none. */
export type ReadReport = (file: string) => string | null;
const readReport: ReadReport = (file) => {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  rmSync(file, { force: true });
  return text;
};

/** The arguments that make a vitest gate write its JSON report to `file`, beside the usual output. */
export const reportArgs = (file: string): string[] => [
  "--",
  "--reporter=default",
  "--reporter=json",
  `--outputFile.json=${file}`,
];

/** Run each gate in order; `write` announces it before it starts. */
function runEach(
  gates: readonly Gate[],
  spawn: Spawn,
  write: (text: string) => unknown,
  reportOf: ReadReport,
): NotPassed {
  const BIN_FIRST_PATH = [join(ROOT, "node_modules", ".bin"), process.env.PATH]
    .filter(Boolean)
    .join(delimiter);
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const [i, g] of gates.entries()) {
    write(`── ${g.name}\n`);
    const [cmd, ...args] = commandOf(g);
    const file = join(
      tmpdir(),
      `paperlint-check-${String(process.pid)}-${String(i)}.json`,
    );
    const r = spawn(cmd, g.vitest ? [...args, ...reportArgs(file)] : args, {
      cwd: ROOT,
      stdio: "inherit",
      encoding: "utf8",
      env: { ...process.env, PATH: BIN_FIRST_PATH },
    });
    // 🔴 The exit code is read from the command itself, never from a pipe. `cmd | tail && …`
    // reports the FILTER's status, which is almost always zero — that is how a red harness
    // shipped on 2026-09-16.
    const skips = g.vitest ? { skipped: skippedIn(reportOf(file)) } : undefined;
    const o = outcome(r.status, skips);
    if (o === "pass") continue;
    const shown = commandOf(g).join(" ");
    if (o === "skip")
      skipped.push(
        `${g.name}  (${shown} → ${String(skips?.skipped)} test(s) skipped)`,
      );
    else
      failed.push(
        `${g.name}  (${shown} → ${r.status === 0 ? "exit 0, but no vitest JSON report to read skips from" : String(r.status)})`,
      );
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
    log(`  (and «${g.name}» runs ONLY here — ${g.reason})`);
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
  reportOf = readReport,
}: {
  gates?: readonly Gate[];
  spawn?: Spawn;
  log?: (line: string) => void;
  err?: (line: string) => void;
  write?: (text: string) => unknown;
  reportOf?: ReadReport;
} = {}): number {
  const notPassed = runEach(gates, spawn, write, reportOf);
  report(gates, notPassed, { log, err });
  return notPassed.failed.length ? 1 : 0;
}

if (isMain(import.meta.url)) process.exit(runGates());

export { ROOT, existsSync, join };
