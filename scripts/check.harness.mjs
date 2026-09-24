/**
 * Both halves for `npm run check` — and the half that matters is not "does it run the gates",
 * it is "does its list still describe the CI it claims to mirror".
 *
 * 🔴 A HANDWRITTEN LIST OF GATES IS A FOSSIL THE DAY AFTER IT IS WRITTEN. That is measured, not
 * feared: on 2026-09-19 eleven scripts existed with no aggregate, a subset was run from memory,
 * and a suite-breaking change was pushed. Writing the subset down in a doc would have produced
 * the same outcome one release later — the list would simply have been wrong instead of absent.
 *
 * So the assertions below do not check that `check.mjs` contains the right strings. They pull
 * the job names OUT OF `.github/workflows/ci.yml` and require every one to be accounted for.
 * Add a job to CI and this goes red the same day, naming the job nobody covered.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const { GATES, NOT_COVERED, outcome, SKIP_EXIT, commandOf } =
  await import("./check.mjs");

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

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

// Every workflow, not just ci.yml: the platform cells (macOS) live in platform.yml since
// 2026-09-23, and a harness reading one file would have stopped seeing them without a sound.
const WF_DIR = join(ROOT, ".github", "workflows");
const workflows = Object.fromEntries(
  readdirSync(WF_DIR)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => [f, load(readFileSync(join(WF_DIR, f), "utf-8"))]),
);
const ciJobs = Object.values(workflows).flatMap((wf) =>
  Object.keys(wf.jobs ?? {}),
);
check(
  "the workflows parse and declare jobs — without this every assertion below is vacuous",
  ciJobs.length > 0 && "ci.yml" in workflows && "platform.yml" in workflows,
);

// ── THE PLATFORM TRIGGER: once per PR, never per push ──────────────────────────────────────
// These three lines ARE the cost and safety design (see the header of platform.yml): with
// `synchronize` the 10x job runs on every push; with a label it runs on every push AND a
// foreign label can satisfy the required check by skipping.
const prTypes = (wf) => wf.on?.pull_request?.types ?? [];
check(
  "platform.yml runs on opened + ready_for_review only — `synchronize` would bill macOS on every push",
  JSON.stringify(prTypes(workflows["platform.yml"])) ===
    JSON.stringify(["opened", "ready_for_review"]),
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
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).scripts ?? {};
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
  const files = argv.filter((a) => /\.m?js$/.test(a));
  check(
    `gate «${g.name}» runs files that exist (${files.join(", ")})`,
    files.length > 0 && files.every((f) => existsSync(join(ROOT, f))),
  );
  const programs = argv.filter(
    (a, i) => i === 0 || argv[i - 1] === "scripts/exclusive.mjs",
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

// ── and the tail is not optional ───────────────────────────────────────────────────────────
check(
  "NOT_COVERED is non-empty — if it ever is, either CI shrank or someone silenced the tail",
  Object.keys(NOT_COVERED).length > 0,
);

console.log(
  `✓ ${String(n)} assertions passed — npm run check: ${GATES.length} gates, ` +
    `${ciJobs.length} CI job(s) all accounted for`,
);
