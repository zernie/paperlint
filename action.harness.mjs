/**
 * Harness over `action.yml` and the guard it calls.
 * Run: `npx vigiles test action.harness.mjs`
 *
 * 🔴 WHAT IT REFUSES TO BE. A harness that greps `action.yml` for `--no-config-lookup` would pass
 * on a file where the flag sits inside a comment, and would say nothing about whether the action
 * BEHAVES. So: the YAML is read with a PARSER (`js-yaml`) and addressed as nodes, and the
 * green-zero guard is exercised by CALLING it on fixtures — the same entry point the action calls.
 *
 * BOTH HALVES for every property: it fires on a planted defect AND stays quiet on a clean input.
 * A guard only ever observed silent is indistinguishable from a dead one.
 */
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { guard } from "./scripts/eslint-report-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-action-")));
const action = yaml.load(readFileSync(join(HERE, "action.yml"), "utf8"));

// ── I. SHAPE, read as nodes ───────────────────────────────────────────────────────────────────
assert.equal(action.runs.using, "composite", "the action must be composite");
const names = action.runs.steps.map((s) => s.name);
assert.equal(
  action.runs.steps.length,
  3,
  `expected 3 steps, got ${action.runs.steps.length}: ${names}`,
);

const eslintStep = action.runs.steps.find((s) => s.name === "paperlint lint");
assert.ok(eslintStep, `no step named "paperlint lint" among: ${names}`);

// 🔴 THE ACTION MUST CALL THE PACKAGE'S OWN CLI, NOT ESLINT. This is not tidiness: while the step
// invoked `npx eslint` directly it was a SECOND implementation of the same job, and it had already
// drifted — the directory-structure check (a paper directory with no PIPELINE-STATUS.md gets zero
// rules and reports clean) lives in `bin/paperlint.mjs`, so in CI it did not run at all. Any future edit
// that reaches past the CLI reintroduces exactly that gap, silently and greenly.
assert.match(
  eslintStep.run,
  /npx paperlint lint/,
  "the lint step must call this package's own CLI — invoking eslint directly bypasses the settings and the structure check",
);
assert.doesNotMatch(
  eslintStep.run,
  /npx eslint/,
  "the lint step must not invoke eslint directly — that is the bypass this step was fixed to remove",
);
// `--no-config-lookup` is deliberately absent and is NOT missing: the CLI builds its config with
// `overrideConfigFile: true`, so a consumer's nested config cannot reach the run. The guarantee
// moved from a flag into the code — assert the code, not the flag.
//
// 🔴 AND ASSERT IT IN THE FILE THAT HOLDS IT. This read said `bin/paperlint.mjs` until the CLI moved to
// TypeScript; `bin/paperlint.mjs` is now a loader shim and contains no such call, so the assertion went
// red on a move that changed no behaviour. That redness is the point — the same assertion written
// as a grep over "the CLI" would have kept passing against whichever file still matched, which is
// how a check quietly stops watching its subject.
assert.match(
  readFileSync(new URL("./src/cli.ts", import.meta.url), "utf8"),
  /overrideConfigFile:\s*true/,
  "the CLI must pin its own config, or a consumer's nested config silently changes the rule set",
);
// The redirect into a report file is only sound while `--json` keeps stdout clean.
assert.match(
  eslintStep.run,
  /--json > "\$RUNNER_TEMP\/paperlint-report\.json"/,
  "the machine-readable report must be redirected whole — it is what the guard reads",
);
// The guard must be CALLED, and by file — an inline blob would be untestable.
assert.match(
  eslintStep.run,
  /eslint-report-guard\.mjs/,
  "the lint step must hand its report to scripts/eslint-report-guard.mjs",
);
// ── I-b. THE STEP'S SHELL SEMANTICS, EXECUTED — not grepped ───────────────────────────────────
//
// 🔴 THE ASSERTION THAT STOOD HERE READ THE TEXT (`/RC=\$\?/`) AND WAS GREEN OVER A DEAD ERROR
// PATH. GitHub runs composite `shell: bash` as `bash --noprofile --norc -eo pipefail`. Under `-e`
// a bare `npx eslint` that exits non-zero ABORTS THE SCRIPT, so the guard on the next line never
// ran — and the file contained the characters `RC=$?` either way, so the text assertion could not
// tell the two apart. Every failure this action exists to explain (bad config, unreadable report,
// non-zero ESLint) lives on exactly that dead path.
//
// So: execute the REAL `run:` block under the REAL flags, with a stub standing in for `npx`, and
// require that the guard was reached and that ESLint's code came through it.
const stubbedStepRun = (stubRc, paths = ".") => {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-bin-")));
  writeFileSync(
    join(bin, "npx"),
    // Stub prints the report TO STDOUT, not to a file by the `-o` flag: the step no longer passes
    // `-o`, it REDIRECTS output. So the stub also checks the redirect itself — if it disappears
    // from the step, the file stays empty and the guard says "nothing was measured".
    `#!/usr/bin/env bash\n` +
      `printf '%s\\n' "$@" > "$RUNNER_TEMP/npx-args"\n` +
      `printf '%s' "$REPORT_JSON"\n` +
      `exit "$STUB_RC"\n`,
    { mode: 0o755 },
  );
  return spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", "-c", eslintStep.run],
    {
      cwd: TMP,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: TMP,
        GITHUB_ACTION_PATH: HERE,
        PAPERLINT_CONFIG: "",
        PAPERLINT_PATHS: paths,
        PAPERLINT_MAXWARN: "-1",
        STUB_RC: String(stubRc),
        REPORT_JSON: JSON.stringify([{ filePath: "/x/a.md", messages: [] }]),
      },
    },
  );
};

// FIRES-THROUGH: ESLint failed. This is the case the old text assertion could not see.
{
  const r = stubbedStepRun(2);
  assert.match(
    r.stdout,
    /linted 1 file\(s\)/,
    "the guard must still run when ESLint exits non-zero — under `bash -e` a bare command aborts the step",
  );
  assert.equal(
    r.status,
    2,
    "ESLint's failure code must come through the guard, not be masked to 1",
  );
}
// QUIET HALF: ESLint succeeded — the guard runs and passes 0 through.
{
  const r = stubbedStepRun(0);
  assert.match(
    r.stdout,
    /linted 1 file\(s\)/,
    "the guard must run on success too",
  );
  assert.equal(r.status, 0, "a clean run must stay green");
}

// texcount is checked for EXISTENCE, not by the installer's exit code: an installer can put nothing
// in place and report success (measured in this corpus, 2026-09-01).
const pathStep = action.runs.steps.find((s) => /on PATH/i.test(s.name ?? ""));
assert.ok(pathStep, `no step verifying texcount is on PATH among: ${names}`);
assert.match(
  pathStep.run,
  /command -v texcount/,
  "the PATH step must probe the binary itself",
);

for (const key of [
  "config",
  "paths",
  "max-warnings",
  "texcount",
  "working-directory",
])
  assert.ok(action.inputs[key], `input \`${key}\` is missing`);

// ── `paths` is OPTIONAL: with none, the CLI lints the papersDir its paperlint.json declares ──────
// `paperlint lint` with no path finds the root paperlint.json and lints its `papersDir`, so that is
// the normal call and the action must not refuse it. What is asserted is the behaviour: the real
// `run:` block, handed an empty `paths`, calls the CLI with no path argument at all, and the guard
// still runs over what the CLI reported.
assert.equal(
  action.inputs.paths.required,
  false,
  "`paths` must be optional — the CLI finds papersDir itself",
);
assert.equal(
  action.inputs.paths.default,
  "",
  "`paths` must default to empty, which means: the papersDir of paperlint.json",
);
{
  const r = stubbedStepRun(0, "");
  assert.equal(r.status, 0, `an empty \`paths\` must run clean: ${r.stderr}`);
  assert.deepEqual(
    readFileSync(join(TMP, "npx-args"), "utf8").trim().split("\n"),
    ["paperlint", "lint", "--max-warnings=-1", "--json"],
    "with no `paths` the CLI must get no path argument — not an empty string, not `.`",
  );
  assert.match(r.stdout, /linted 1 file\(s\)/, "the guard must still run");
}
{
  stubbedStepRun(0, "papers/a papers/b");
  assert.deepEqual(
    readFileSync(join(TMP, "npx-args"), "utf8").trim().split("\n"),
    [
      "paperlint",
      "lint",
      "papers/a",
      "papers/b",
      "--max-warnings=-1",
      "--json",
    ],
    "named paths are handed to the CLI one argument each",
  );
}

// ── II. BEHAVIOUR of the guard — both halves, on fixtures ─────────────────────────────────────
const fixture = (name, body) => {
  const p = join(TMP, name);
  writeFileSync(p, body);
  return p;
};

// FIRES: zero files linted. The whole reason the guard exists.
{
  const { code, lines } = guard(fixture("empty.json", "[]"), 0, {
    paths: ".",
    config: "c.mjs",
  });
  assert.equal(
    code,
    1,
    "a report of zero linted files must FAIL, not pass as clean",
  );
  assert.match(lines.join("\n"), /linted ZERO files/);
}
// With no paths given, the guard names where the scope came from instead of printing `paths=`.
{
  const { lines } = guard(fixture("empty2.json", "[]"), 0, {
    paths: "",
    config: "paperlint.json",
  });
  assert.match(
    lines.join("\n"),
    /paths=\(none: the papersDir of paperlint\.json\)/,
    "an empty paths value must be named as the papersDir, not printed blank",
  );
}
// FIRES: the report is absent or unparsable — nothing was measured either way.
assert.equal(
  guard(join(TMP, "absent.json"), 0).code,
  1,
  "an unreadable report must FAIL",
);
assert.equal(
  guard(fixture("garbage.json", "{oops"), 0).code,
  1,
  "an unparsable report must FAIL",
);
assert.equal(
  guard(fixture("object.json", '{"not":"an array"}'), 0).code,
  1,
  "a report that is not a result array must FAIL",
);

// QUIET: files were linted and ESLint was happy → ESLint's code passes through untouched.
{
  const one = fixture(
    "one.json",
    JSON.stringify([
      {
        filePath: "/x/a.md",
        messages: [
          { severity: 1, line: 3, column: 1, ruleId: "paper/x", message: "m" },
        ],
      },
    ]),
  );
  assert.equal(
    guard(one, 0).code,
    0,
    "a real run with findings must pass ESLint's own 0 through",
  );
  assert.equal(
    guard(one, 2).code,
    2,
    "a real run must pass ESLint's failure code through, not mask it",
  );
}
// QUIET: a file linted with NO findings is a legitimate clean run — the guard must not fire on it.
{
  const clean = fixture(
    "clean.json",
    JSON.stringify([{ filePath: "/x/a.md", messages: [] }]),
  );
  const { code, lines } = guard(clean, 0);
  assert.equal(
    code,
    0,
    "one file linted with zero findings is CLEAN, not empty — the guard must be quiet",
  );
  assert.doesNotMatch(lines.join("\n"), /linted ZERO files/);
  assert.match(lines.join("\n"), /linted 1 file\(s\) · 0 finding\(s\)/);
}

console.log(
  "✓ action.yml shape (parsed, not grepped) + guard behaviour, both halves",
);
