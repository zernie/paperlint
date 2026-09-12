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
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { guard } from "./scripts/eslint-report-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "rpp-action-"));
const action = yaml.load(readFileSync(join(HERE, "action.yml"), "utf8"));

// ── I. SHAPE, read as nodes ───────────────────────────────────────────────────────────────────
assert.equal(action.runs.using, "composite", "the action must be composite");
const names = action.runs.steps.map((s) => s.name);
assert.equal(action.runs.steps.length, 3, `expected 3 steps, got ${action.runs.steps.length}: ${names}`);

const eslintStep = action.runs.steps.find((s) => s.name === "eslint");
assert.ok(eslintStep, `no step named "eslint" among: ${names}`);

// `--no-config-lookup` is LOAD-BEARING: without it a consumer's nested config silently changes
// which rules are enabled, and the job stays green over a different rule set than the one asked for.
assert.match(
  eslintStep.run,
  /--no-config-lookup/,
  "the eslint step must pass --no-config-lookup, or a nested consumer config can change the rule set",
);
// The guard must be CALLED, and by file — an inline blob would be untestable.
assert.match(
  eslintStep.run,
  /eslint-report-guard\.mjs/,
  "the eslint step must hand its report to scripts/eslint-report-guard.mjs",
);
// ESLint's own code must reach the guard, not be swallowed by the pipeline.
assert.match(eslintStep.run, /RC=\$\?/, "the eslint step must capture ESLint's return code");

// texcount is checked for EXISTENCE, not by the installer's exit code: an installer can put nothing
// in place and report success (measured in this corpus, 2026-09-01).
const pathStep = action.runs.steps.find((s) => /on PATH/i.test(s.name ?? ""));
assert.ok(pathStep, `no step verifying texcount is on PATH among: ${names}`);
assert.match(pathStep.run, /command -v texcount/, "the PATH step must probe the binary itself");

for (const key of ["config", "paths", "max-warnings", "texcount", "working-directory"])
  assert.ok(action.inputs[key], `input \`${key}\` is missing`);

// ── II. BEHAVIOUR of the guard — both halves, on fixtures ─────────────────────────────────────
const fixture = (name, body) => {
  const p = join(TMP, name);
  writeFileSync(p, body);
  return p;
};

// FIRES: zero files linted. The whole reason the guard exists.
{
  const { code, lines } = guard(fixture("empty.json", "[]"), 0, { paths: ".", config: "c.mjs" });
  assert.equal(code, 1, "a report of zero linted files must FAIL, not pass as clean");
  assert.match(lines.join("\n"), /linted ZERO files/);
}
// FIRES: the report is absent or unparsable — nothing was measured either way.
assert.equal(guard(join(TMP, "absent.json"), 0).code, 1, "an unreadable report must FAIL");
assert.equal(guard(fixture("garbage.json", "{oops"), 0).code, 1, "an unparsable report must FAIL");
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
      { filePath: "/x/a.md", messages: [{ severity: 1, line: 3, column: 1, ruleId: "paper/x", message: "m" }] },
    ]),
  );
  assert.equal(guard(one, 0).code, 0, "a real run with findings must pass ESLint's own 0 through");
  assert.equal(guard(one, 2).code, 2, "a real run must pass ESLint's failure code through, not mask it");
}
// QUIET: a file linted with NO findings is a legitimate clean run — the guard must not fire on it.
{
  const clean = fixture("clean.json", JSON.stringify([{ filePath: "/x/a.md", messages: [] }]));
  const { code, lines } = guard(clean, 0);
  assert.equal(code, 0, "one file linted with zero findings is CLEAN, not empty — the guard must be quiet");
  assert.doesNotMatch(lines.join("\n"), /linted ZERO files/);
  assert.match(lines.join("\n"), /linted 1 file\(s\) · 0 finding\(s\)/);
}

console.log("✓ action.yml shape (parsed, not grepped) + guard behaviour, both halves — 17 assertions");
