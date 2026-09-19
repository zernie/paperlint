/**
 * `local/temp-root-realpath` — both halves on real ESLint, plus the corpus itself.
 *
 * 🔴 WHY THIS HARNESS EXISTS AT ALL, rather than stopping at the twenty-four fixes. The
 * defect (issue #9) ONLY REPRODUCES ON macOS: there `/var` is a symlink to `/private/var`,
 * and one directory gets two spellings. On Linux `realpathSync` is the identity, so no
 * behavioral test can tell a fixed root apart from a broken one: removing the wrapper leaves
 * the run GREEN. The only check that can even go red on Linux is structural: ask the AST
 * whether the root is resolved at the point it's created. That is exactly why it is written
 * as a linter rule and not an assert inside someone's harness.
 *
 * ⚠️ And a boundary, so the harness isn't mistaken for more: it asserts that the IDIOM is in
 * place, not that macOS is now green. The latter is only checked on macOS, and CI here is one
 * `ubuntu-latest` — recorded as a known limit, not papered over.
 *
 * Fixtures are strings through `lintText`, not files on disk: a defect file under `fixtures/`
 * would fall under the config's own `**\/*.mjs` block and would make `npx eslint .` red on a
 * healthy checkout. This is the same reason the `.tex` fixtures sit on `warn`.
 */
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { recordCheck } from "vigiles";
import localRules from "./temp-root-realpath.mjs";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.mjs"],
      languageOptions: { ecmaVersion: 2024, sourceType: "module" },
      plugins: { local: localRules },
      rules: { "local/temp-root-realpath": "error" },
    },
  ],
});

/** @returns {Promise<import("eslint").Linter.LintMessage[]>} */
const on = async (code) =>
  (await eslint.lintText(code, { filePath: "probe.mjs" }))[0].messages;

const HEAD = 'import { mkdtempSync, realpathSync } from "node:fs";\n' +
  'import { tmpdir } from "node:os";\nimport { join } from "node:path";\n';

const cases = [];

// ── 1. FIRES: a root from `tmpdir()` with no resolve — exactly the shape from issue #9.
{
  const m = await on(`${HEAD}const TMP = mkdtempSync(join(tmpdir(), "probe-"));\n`);
  assert.equal(m.length, 1, `one finding was expected, got ${m.length}: ${JSON.stringify(m)}`);
  assert.equal(m[0].ruleId, "local/temp-root-realpath");
  assert.match(m[0].message, /realpathSync\(mkdtempSync/, "the message must carry the FIX, not just the diagnosis");
  assert.match(m[0].message, /private\/var/, "and name the cause — why one directory gets two names");
  cases.push("mkdtempSync(join(tmpdir(), …)) with no resolve → a finding, the fix is in the message");
}

// ── 2. STAYS SILENT on the fixed form. Without this half the rule is indistinguishable
//      from one that screams at every `mkdtempSync`.
{
  const m = await on(`${HEAD}const TMP = realpathSync(mkdtempSync(join(tmpdir(), "probe-")));\n`);
  assert.deepEqual(m, [], `the rule must stay silent on a resolved root, got: ${JSON.stringify(m)}`);
  cases.push("realpathSync(mkdtempSync(join(tmpdir(), …))) → silence");
}

// ── 3. 🔴 STAYS SILENT ON A NESTED ROOT, and this is load-bearing, not a concession. The
//      corpus has five of these (`mkdtempSync(join(TMP, "repo-"))`); they inherit their
//      spelling from `TMP`, which is caught at ITS OWN spot. A rule that screamed here too
//      would demand a double resolve — and for an `error`-level rule a false positive is
//      worse than a miss: it gets turned off.
{
  const m = await on(
    `${HEAD}const TMP = realpathSync(mkdtempSync(join(tmpdir(), "probe-")));\n` +
      `const sub = mkdtempSync(join(TMP, "repo-"));\nvoid sub;\n`,
  );
  assert.deepEqual(m, [], `a nested root inherits its spelling from the parent; got: ${JSON.stringify(m)}`);
  cases.push("a nested mkdtempSync(join(TMP, …)) → silence (the parent is already resolved)");
}

// ── 4. A COMMENT AND A STRING ARE NOT A CALL. This is exactly why the rule parses the AST: a
//      text-based guard looking for "mkdtempSync(join(tmpdir()" would find this very file and
//      would have to exclude itself — the class of check string-based checks are banned for here.
{
  const m = await on(
    `${HEAD}// mkdtempSync(join(tmpdir(), "in-a-comment-"))\n` +
      `const doc = 'mkdtempSync(join(tmpdir(), "in-a-string-"))';\nvoid doc;\n`,
  );
  assert.deepEqual(m, [], `text ABOUT a call is not a call; got: ${JSON.stringify(m)}`);
  cases.push("the same sequence in a comment and a string → silence");
}

// ── 5. `fs.mkdtempSync` / `os.tmpdir()` through a namespace — the same thing under a
//      different spelling.
{
  const ns = 'import * as fs from "node:fs";\nimport * as os from "node:os";\nimport { join } from "node:path";\n';
  const bad = await on(`${ns}const TMP = fs.mkdtempSync(join(os.tmpdir(), "probe-"));\n`);
  assert.equal(bad.length, 1, `the namespaced spelling must be caught; got: ${JSON.stringify(bad)}`);
  const good = await on(`${ns}const TMP = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), "probe-")));\n`);
  assert.deepEqual(good, [], `and it must be exempted too; got: ${JSON.stringify(good)}`);
  cases.push("fs.mkdtempSync(join(os.tmpdir(), …)) is caught, fs.realpathSync(…) exempts it");
}

// ── 6. 🔴 THE CORPUS ITSELF IS CLEAN. The "silent" half on a made-up string says nothing
//      about the repository: the rule could also be silent because it was never handed a
//      single file (the recorded class — `scripts/rules-see-files.mjs`). So this check runs
//      THE RULE OVER THE REAL TREE and requires many files, zero findings.
{
  const corpus = new ESLint({ cwd: new URL("..", import.meta.url).pathname });
  const results = await corpus.lintFiles(["."]);
  const hits = results.flatMap((r) =>
    r.messages
      .filter((msg) => msg.ruleId === "local/temp-root-realpath")
      .map((msg) => `${r.filePath}:${msg.line}`),
  );
  assert.deepEqual(hits, [], `the corpus must be clean of unresolved roots:\n${hits.join("\n")}`);
  const linted = results.filter((r) => r.filePath.endsWith(".mjs")).length;
  assert.ok(
    linted > 50,
    `the rule was only handed ${linted} .mjs files — zero findings on an empty input is NOT cleanliness`,
  );
  cases.push(`corpus: ${linted} .mjs files, zero unresolved roots`);
}

recordCheck(cases.length);
console.log(`local/temp-root-realpath: ${cases.length} cases:`);
for (const c of cases) console.log(`  ok  ${c}`);
