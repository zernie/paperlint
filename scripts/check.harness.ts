/**
 * Both halves for `npm run check` — and the half that matters is not "does it run the gates",
 * it is "does its list still describe the CI it claims to mirror".
 *
 * 🔴 A HANDWRITTEN LIST OF GATES IS A FOSSIL THE DAY AFTER IT IS WRITTEN. That is measured, not
 * feared: on 2026-09-19 eleven scripts existed with no aggregate, a subset was run from memory,
 * and a suite-breaking change was pushed. Writing the subset down in a doc would have produced
 * the same outcome one release later — the list would simply have been wrong instead of absent.
 *
 * So the assertions below do not check that `check.ts` contains the right strings. They pull
 * the job names OUT OF `.github/workflows/ci.yml` and require every one to be accounted for.
 * Add a job to CI and this goes red the same day, naming the job nobody covered.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { z } from "zod";
import { createChecker } from "../lib/check.ts";
import type { Gate } from "./check.ts";

/** A workflow file, as far as these checks read it. `on` is a plain key: js-yaml reads YAML 1.2. */
const Step = z.looseObject({
  name: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
});
const Workflow = z.looseObject({
  on: z
    .looseObject({
      pull_request: z
        .looseObject({ types: z.array(z.string()).optional() })
        .nullish(),
    })
    .optional(),
  jobs: z
    .record(
      z.string(),
      z.looseObject({
        steps: z.array(Step).optional(),
        strategy: z
          .looseObject({
            matrix: z
              .looseObject({ os: z.array(z.string()).optional() })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
type Workflow = z.infer<typeof Workflow>;
const PackageJson = z.looseObject({
  scripts: z.record(z.string(), z.string()).optional(),
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const { GATES, NOT_COVERED, outcome, SKIP_EXIT, commandOf } =
  await import("./check.ts");

const check = createChecker();

// ── the workflow is the ORACLE, not a copy of it ───────────────────────────────────────────
// A declared skip is a THIRD outcome. Folding it into "pass" printed "all gates passed" on a
// machine where the e2e never ran (Codex review on #45); folding it into "fail" would make the
// command red for anyone without pnpm or TeX, and it would be ignored.
check("exit 0 is a pass", outcome(0) === "pass");
check(
  `exit ${SKIP_EXIT} is a skip — neither a pass nor a failure`,
  outcome(SKIP_EXIT) === "skip",
);
check("the skip code is the one vigiles' runner uses (77)", SKIP_EXIT === 77);
check(
  "any other nonzero exit is a failure",
  outcome(1) === "fail" && outcome(2) === "fail",
);
check(
  "a process killed by a signal (status null) is a failure, not a skip",
  outcome(null) === "fail",
);

// Every workflow, not just ci.yml: a harness reading one file would stop seeing a job added to
// another without a sound. (macOS lived in platform.yml from 2026-09-23 to 2026-09-24; it is now
// a cell of ci.yml's build-e2e matrix.)
const WF_DIR = join(ROOT, ".github", "workflows");
const workflows = Object.fromEntries(
  readdirSync(WF_DIR)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => [
      f,
      Workflow.parse(load(readFileSync(join(WF_DIR, f), "utf-8"))),
    ]),
);
const ciJobs = Object.values(workflows).flatMap((wf) =>
  Object.keys(wf.jobs ?? {}),
);
check(
  "the workflows parse and declare jobs — without this every assertion below is vacuous",
  ciJobs.length > 0 && "ci.yml" in workflows,
);

// ── macOS: a cell of the TeX job, on every push ─────────────────────────────────────────
// install-tl-unx must work there, and issue #9 appears there alone. The trigger used to be a
// separate once-per-PR workflow; the repository is public, so the minutes are free.
const prTypes = (wf: Workflow | undefined): string[] =>
  wf?.on?.pull_request?.types ?? [];
const buildOs =
  workflows["ci.yml"]?.jobs?.["build-e2e"]?.strategy?.matrix?.os ?? [];
check(
  "build-e2e runs on Linux AND macOS — one job, two operating systems",
  buildOs.includes("ubuntu-latest") && buildOs.includes("macos-latest"),
  JSON.stringify(buildOs),
);
check(
  "no workflow listens to `labeled` — a label trigger re-fires on every push and can pass by skipping",
  Object.values(workflows).every((wf) => !prTypes(wf).includes("labeled")),
);
check(
  "ci.yml listens to ready_for_review — otherwise marking a draft ready runs NOTHING",
  prTypes(workflows["ci.yml"]).includes("ready_for_review"),
);

// ── HALF ONE: every CI job is accounted for ────────────────────────────────────────────────
const covered = new Set(GATES.map((g) => g.job).filter(Boolean));
for (const job of ciJobs) {
  check(
    `CI job «${job}» is either reproduced by a gate or named in NOT_COVERED with a reason — ` +
      `an unexplained gap is indistinguishable from an oversight`,
    covered.has(job) || typeof NOT_COVERED[job] === "string",
  );
}

// ── HALF TWO: the list names nothing that does not exist ───────────────────────────────────
// A dead job name is worse than a missing one: it reads as coverage and delivers nothing.
for (const g of GATES) {
  if (g.job === null) continue;
  check(
    `gate «${g.name}» names a job that really exists in a workflow (${g.job})`,
    ciJobs.includes(g.job),
  );
}
for (const job of Object.keys(NOT_COVERED)) {
  check(
    `NOT_COVERED names a job that really exists in a workflow (${job})`,
    ciJobs.includes(job),
  );
}

// ── HALF THREE: every gate is runnable ─────────────────────────────────────────────────────
// A gate whose script or file was renamed fails at the moment someone runs it — which is
// exactly the moment they are trusting it. Catch it here instead.
const scripts =
  PackageJson.parse(
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")),
  ).scripts ?? {};
for (const g of GATES) {
  check(
    `gate «${g.name}» says how to run it in exactly one way (script or run)`,
    Boolean(g.script) !== Array.isArray(g.run),
  );
  if (g.script) {
    check(
      `gate «${g.name}» maps to a script that exists (npm run ${g.script})`,
      typeof scripts[g.script] === "string",
    );
    continue;
  }
  // A `run` gate names files and programs directly. Every file it names must be on disk, and
  // every program other than `node` must be installed in node_modules/.bin.
  const argv = commandOf(g);
  const files = argv.filter((a) => /\.[cm]?[jt]s$/.test(a));
  const programs = [argv[0]];
  // Guards: a gate runs SOMETHING — a script of ours, or an installed program such as `tsc`.
  check(
    `gate «${g.name}» runs files that exist (${files.join(", ")})`,
    (files.length > 0 || programs.some((p) => p !== "node")) &&
      files.every((f) => existsSync(join(ROOT, f))),
  );
  check(
    `gate «${g.name}» runs programs that are installed (${programs.join(", ")})`,
    programs.every(
      (p) => p === "node" || existsSync(join(ROOT, "node_modules", ".bin", p)),
    ),
  );
}
check(
  "`check` itself is wired as a script, or nobody can run any of this",
  typeof scripts.check === "string",
);

// ── HALF FOUR: a local-only gate must say WHY ──────────────────────────────────────────────
// Without this, `job: null` becomes the quiet way to drop something out of CI.
for (const g of GATES.filter((g) => g.job === null)) {
  check(
    `local-only gate «${g.name}» carries a reason`,
    typeof g.reason === "string" && g.reason.length > 20,
  );
}

// ── HALF FIVE: the gate's command RUNS in the job it names ─────────────────────────────────
// Half two proves the job exists; it does not prove the job runs the gate. `the tests type-check`
// claimed `gates` for weeks while no step of that job ran tsc — the claim was the only coverage.
// So each step's `run` is split into commands (lines, `&&`, `||`, `;`) and each command into
// tokens, and the gate's own command has to be one of them: `npm run <script>` (flags and extra
// arguments allowed) for a script gate, its argv (an `npx` in front and extra arguments allowed)
// for a run gate. Tokens, not a substring: `npm run lint` must not be found inside
// `npm run lint:skills`, nor a path inside a comment.
const commandsIn = (run: string | undefined): string[][] =>
  String(run ?? "")
    .split(/\n|&&|\|\||;/)
    .map((c) => c.trim().split(/\s+/).filter(Boolean))
    .filter((t) => t.length > 0);
const stepsOf = (job: string) =>
  Object.values(workflows).flatMap((wf) => wf.jobs?.[job]?.steps ?? []);
const startsWith = (tokens: readonly string[], prefix: readonly string[]) =>
  prefix.every((p, i) => tokens[i] === p);
const runsGate = (tokens: readonly string[], g: Gate): boolean => {
  if (g.script)
    return (
      tokens[0] === "npm" &&
      tokens[1] === "run" &&
      tokens.slice(2).find((t) => !t.startsWith("-")) === g.script
    );
  const argv = commandOf(g);
  return (
    startsWith(tokens, argv) ||
    (tokens[0] === "npx" && startsWith(tokens.slice(1), argv))
  );
};
for (const g of GATES) {
  if (g.job === null) continue;
  const steps = stepsOf(g.job);
  const { inCi } = g;
  if (inCi) {
    // A gate CI runs as a side effect of another step, through an npm lifecycle script: the step
    // it names must exist in the job and install the package (npm runs lifecycle scripts there),
    // and the lifecycle script must be the gate's own command, so the two cannot drift apart.
    const step = steps.find((s) => s.name === inCi.step);
    const tokens = commandsIn(step?.run)[0] ?? [];
    check(
      `gate «${g.name}» runs in CI job «${g.job}» through step «${inCi.step}», whose ${inCi.lifecycle} script is the gate's command`,
      step !== undefined &&
        tokens[0] === "npm" &&
        ["ci", "install"].includes(tokens[1] ?? "") &&
        typeof scripts[g.script] === "string" &&
        scripts[inCi.lifecycle] === scripts[g.script],
      JSON.stringify({ run: step?.run, lifecycle: scripts[inCi.lifecycle] }),
    );
    continue;
  }
  check(
    `gate «${g.name}» runs its command (${commandOf(g).join(" ")}) in a step of CI job «${g.job}»`,
    steps.some((s) => commandsIn(s.run).some((t) => runsGate(t, g))),
    steps.map((s) => s.run ?? `(uses ${s.uses})`).join(" | "),
  );
}

// ── and the tail is not optional ───────────────────────────────────────────────────────────
check(
  "NOT_COVERED is non-empty — if it ever is, either CI shrank or someone silenced the tail",
  Object.keys(NOT_COVERED).length > 0,
);

console.log(
  `✓ ${String(check.count)} assertions passed — npm run check: ${GATES.length} gates, ` +
    `${ciJobs.length} CI job(s) all accounted for`,
);
