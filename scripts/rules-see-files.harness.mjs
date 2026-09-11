/**
 * Colocated test for `scripts/rules-see-files.mjs` — the guard against a green zero.
 * Run: `npx vigiles test scripts/rules-see-files.harness.mjs`
 *
 * 🔴 BOTH HALVES, and for this guard the order matters more than usual. Its success state is
 * silence, and silence is exactly the state it was built to distrust: a guard that has only
 * ever been seen quiet is indistinguishable from a guard that is dead. So:
 *   I.  QUIET on this repository — every rule declared in `eslint.config.mjs` is enabled for at
 *       least one file that exists.
 *   II. FIRES on a planted empty glob — a throwaway project whose config declares a rule over a
 *       glob nothing matches. The rule is syntactically fine, the config is valid, ESLint exits
 *       0 with zero findings, and the guard is the only thing that says anything.
 *   III. The fixture in II has a CONTROL rule that does see a file, so "fires" means "named the
 *        blind one", not "complained about everything".
 */
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const { rulesSeeFiles } = await import(join(HERE, "rules-see-files.mjs"));

const TMP = mkdtempSync(join(tmpdir(), "rules-see-files-"));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

// ═════════════════════════════════════════════════════════════════════════════
// I. QUIET ON THIS REPOSITORY
// ═════════════════════════════════════════════════════════════════════════════
{
  const { rules, blind, linted } = await rulesSeeFiles({ cwd: ROOT });
  assert.deepEqual(
    blind,
    [],
    "a rule declared in eslint.config.mjs was enabled for zero files on disk — it is never " +
      "invoked, and its zero findings mean nothing",
  );
  assert.ok(rules.length > 0, "no rules were found in eslint.config.mjs — the guard has no subject");
  assert.ok(linted > 0, "ESLint linted no files at all — the guard cannot distinguish anything");
  // Not just "not blind": the count has to be the fixtures it should be seeing. A rule that saw
  // one file when four exist is a narrower defect of the same family.
  const tex = rules.find((r) => r.rule === "tex/future-promise");
  assert.ok(tex, "`tex/future-promise` is no longer declared");
  assert.ok(
    tex.files >= 4,
    `\`tex/future-promise\` was enabled for ${tex.files} file(s); the four fixtures alone should ` +
      "exceed that, so its glob is narrower than the test data it is supposed to cover",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// II + III. FIRES ON A PLANTED EMPTY GLOB, AND NAMES THE RIGHT RULE
// ═════════════════════════════════════════════════════════════════════════════
{
  const project = join(TMP, "planted");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "probe.js"), "export const x = 1;\n");
  writeFileSync(
    join(project, "eslint.config.mjs"),
    [
      "const noop = { meta: { schema: [] }, create: () => ({}) };",
      "export default [",
      "  {",
      '    files: ["**/*.js"],',
      '    plugins: { probe: { rules: { alive: noop, dead: noop } } },',
      '    rules: { "probe/alive": "warn" },',
      "  },",
      "  {",
      // Nothing in this project has that extension. The block is valid, the rule is valid,
      // and it will never be called.
      '    files: ["**/*.nosuchextension"],',
      '    plugins: { probe: { rules: { alive: noop, dead: noop } } },',
      '    rules: { "probe/dead": "warn" },',
      "  },",
      "];",
      "",
    ].join("\n"),
  );

  // First: confirm the thing the guard exists to distrust. ESLint itself is perfectly happy.
  const results = await new ESLint({ cwd: project }).lintFiles(["."]);
  assert.deepEqual(
    results.flatMap((r) => r.messages),
    [],
    "the planted project produced findings — it is supposed to be the silent, green, and wrong case",
  );

  const { blind, rules } = await rulesSeeFiles({ cwd: project });
  assert.deepEqual(
    blind,
    ["probe/dead"],
    "the guard did not name the rule declared over an empty glob",
  );
  assert.equal(
    rules.find((r) => r.rule === "probe/alive").files,
    1,
    "the control rule was not credited with the file it does see — the guard reports blindness " +
      "for everything rather than for the blind one",
  );
}
