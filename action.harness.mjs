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
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "rpp-action-")));
const action = yaml.load(readFileSync(join(HERE, "action.yml"), "utf8"));

// ── I. SHAPE, read as nodes ───────────────────────────────────────────────────────────────────
assert.equal(action.runs.using, "composite", "the action must be composite");
const names = action.runs.steps.map((s) => s.name);
assert.equal(
  action.runs.steps.length,
  4,
  `expected 4 steps, got ${action.runs.steps.length}: ${names}`,
);

const eslintStep = action.runs.steps.find((s) => s.name === "rpp lint");
assert.ok(eslintStep, `no step named "rpp lint" among: ${names}`);

// 🔴 THE ACTION MUST CALL THE PACKAGE'S OWN CLI, NOT ESLINT. This is not tidiness: while the step
// invoked `npx eslint` directly it was a SECOND implementation of the same job, and it had already
// drifted — the directory-structure check (a paper directory with no PIPELINE-STATUS.md gets zero
// rules and reports clean) lives in `bin/rpp.mjs`, so in CI it did not run at all. Any future edit
// that reaches past the CLI reintroduces exactly that gap, silently and greenly.
assert.match(
  eslintStep.run,
  /npx rpp lint/,
  "the lint step must call this package's own CLI — invoking eslint directly bypasses rpp.json and the structure check",
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
// 🔴 AND ASSERT IT IN THE FILE THAT HOLDS IT. This read said `bin/rpp.mjs` until the CLI moved to
// TypeScript; `bin/rpp.mjs` is now a loader shim and contains no such call, so the assertion went
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
  /--json > "\$RUNNER_TEMP\/rpp\.json"/,
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
const stubbedStepRun = (stubRc) => {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), "rpp-bin-")));
  writeFileSync(
    join(bin, "npx"),
    // Stub prints the report TO STDOUT, not to a file by the `-o` flag: the step no longer passes
    // `-o`, it REDIRECTS output. So the stub also checks the redirect itself — if it disappears
    // from the step, the file stays empty and the guard says "nothing was measured".
    `#!/usr/bin/env bash\n` +
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
        RPP_CONFIG: "eslint.config.mjs",
        RPP_PATHS: ".",
        RPP_MAXWARN: "-1",
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

// ── `paths` is REQUIRED, and the requirement is ENFORCED, not merely declared ─────────────────
// 🔴 GitHub does not enforce `required: true` for COMPOSITE actions. A caller who omits the
// input reaches the first step with an empty string and no error at all. So two separate things
// are asserted here, and neither implies the other: that the contract is DECLARED, and that a
// step exists which can actually fail on it.
assert.equal(
  action.inputs.paths.required,
  true,
  "`paths` must be declared required",
);
assert.ok(
  !("default" in action.inputs.paths),
  "`paths` must have NO default — the old default `.` linted the whole checkout, so a caller " +
    "who never chose a scope still got a green job over one",
);
const pathsGuard = action.runs.steps.find((s) =>
  /paths was actually given/i.test(s.name ?? ""),
);
assert.ok(
  pathsGuard,
  `no step enforcing the \`paths\` contract among: ${names}`,
);
assert.match(
  pathsGuard.run,
  /exit 1/,
  "the `paths` guard must FAIL, not warn — a declaration nobody checks is documentation",
);
// And it must come FIRST: checking scope after texlive setup would burn apt minutes
// for a call already wrong.
assert.equal(
  action.runs.steps[0].name,
  pathsGuard.name,
  "the `paths` guard must run FIRST — checking scope after an apt install burns minutes on a " +
    "call that was already wrong",
);

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
  "✓ action.yml shape (parsed, not grepped) + guard behaviour, both halves — 20 assertions",
);
