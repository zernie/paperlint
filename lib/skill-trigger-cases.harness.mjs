/**
 * skill-trigger-cases.harness.mjs — the carrier that lets a consumer add its OWN trigger cases
 * without either side forking the table.
 *
 * WHY THIS FILE EXISTS. The case table used to be one list in the consumer's `.claude/lib/`,
 * holding both this package's skills and three of the consumer's own — and the consumer's three
 * name private skills and quote private prose. Splitting it is a correctness question, not a
 * tidiness one, and it fails in a direction that LOOKS FINE:
 *
 * 🔴 `irrelevantFor(skill)` builds a case's FALSE-POSITIVE set out of its `collides` siblings. A
 * missing sibling does not make the measurement smaller — it makes it a DIFFERENT measurement:
 * precision silently becomes recall, with a number that still prints and still looks plausible.
 * So "the consumer's cases must come back" is asserted here, and so is "and the package must not
 * be holding them itself".
 *
 * Run: `npx vigiles test lib/skill-trigger-cases.harness.mjs`
 * Killed by: `lib/skill-trigger-cases.mutations.mjs`
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordCheck } from "vigiles";
import { CASES, BY_SKILL, irrelevantFor } from "./skill-trigger-cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const soft = (label, fn) => {
  try {
    fn();
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
  }
};

/**
 * Load the module in a child process whose CONSUMER ROOT is `root`, and report what happened.
 * A child, not an `import()`, because the module answers the carrier question ONCE at load time
 * (top-level await) — a second import in this process would be served from the module cache and
 * would measure the first root again while appearing to measure the second.
 */
function loadAt(root) {
  const script =
    `import("${join(HERE, "skill-trigger-cases.mjs").replaceAll("\\", "/")}")` +
    `.then((m) => console.log("OK " + m.CASES.length))` +
    `.catch((e) => { console.log("THROW " + String(e.message).split("\\n")[0]); });`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  }).trim();
}

function fixture(pkgJson, casesFile) {
  const root = mkdtempSync(join(tmpdir(), "rpp-cases-"));
  writeFileSync(join(root, "package.json"), JSON.stringify(pkgJson));
  if (casesFile) {
    mkdirSync(join(root, ".claude", "lib"), { recursive: true });
    writeFileSync(join(root, ".claude", "lib", "skill-trigger-cases.local.mjs"), casesFile);
  }
  return root;
}

const LOCAL_ONE = `export const CASES = [{
  skill: "local-only-skill",
  why: "a skill that exists only in this consumer",
  prompts: ["one", "two", "three", "four"],
  collides: [],
}];\n`;

// ── I. The package's own table ───────────────────────────────────────────────
// ⚠️ «THE TABLE CARRIES NO PRIVATE TOKEN» IS NOT ASSERTED HERE, AND THAT IS DELIBERATE.
// `eslint-rules/papers.harness.mjs` part IV already walks every source file in this package for
// them, and it is the ONLY file allowed to spell them — a second copy of the denylist would be a
// second truth, and it would have to spell the words to check for them, which is precisely what
// the guard forbids. Measured 2026-09-12: an earlier draft of this file did carry its own copy,
// and part IV failed it. The guard caught its own duplicate, which is the behaviour wanted.

soft("I. every case is shaped and every collider resolves", () => {
  for (const c of CASES) {
    assert.equal(typeof c.skill, "string", `a case has no skill name`);
    assert.equal(c.prompts.length, 4, `${c.skill}: ${c.prompts.length} prompts, expected 4`);
    for (const sib of c.collides)
      assert.ok(BY_SKILL.has(sib), `${c.skill} collides with unknown skill "${sib}"`);
  }
});

// 🔴 THE ASSERTION THE SPLIT EXISTS FOR. Not "the table is non-empty" — that survives losing every
// collider. This one fails the moment a collider goes missing, because the false-positive set it
// builds from goes empty, which is the silent turn from precision into recall.
soft("I. irrelevantFor still yields a full set for a one-collider case", () => {
  const one = CASES.find((c) => c.collides.length === 1);
  assert.ok(one, "no one-collider case left to check the slicing against");
  assert.equal(irrelevantFor(one.skill).length, 4, `${one.skill}: irrelevant set is short`);
});

// ── II. The carrier, all four states ─────────────────────────────────────────
soft("II. undeclared and absent is SILENT — a consumer with no skills of its own", () => {
  const out = loadAt(fixture({ name: "plain-consumer" }, null));
  assert.match(out, /^OK \d+$/, `expected a clean load, got: ${out}`);
  assert.equal(Number(out.slice(3)), CASES.length, "the package table changed size with no input");
});

soft("II. the DEFAULT path is picked up without any declaration", () => {
  const out = loadAt(fixture({ name: "defaulting-consumer" }, LOCAL_ONE));
  assert.equal(
    out,
    `OK ${CASES.length + 1}`,
    `the file at the default location was not merged: ${out}`,
  );
});

// ⚠️ DECLARED-AND-MISSING vs UNDECLARED-AND-MISSING is the whole point of the distinction, and it
// is the same one `scriptsRoot()` draws: a path someone typed is a keystroke away from being wrong,
// and substituting silence for it hides the typo behind a working run.
soft("II. declared and missing THROWS, naming the declaration", () => {
  const out = loadAt(fixture({ "research-paper-pipeline": { triggerCases: "nope.mjs" } }, null));
  assert.match(out, /^THROW /, `a typoed declaration loaded quietly: ${out}`);
  assert.match(out, /nope\.mjs/, `the throw does not name the declared path: ${out}`);
});

soft("II. a consumer may not redefine a case this package owns", () => {
  const clash = `export const CASES = [{ skill: "${CASES[0].skill}", why: "x", prompts: ["a","b","c","d"], collides: [] }];\n`;
  const out = loadAt(fixture({ name: "clashing-consumer" }, clash));
  assert.match(out, /^THROW /, `a shadowing case was accepted: ${out}`);
  assert.match(out, new RegExp(CASES[0].skill), `the throw does not name the skill: ${out}`);
});

if (failures.length) {
  console.error(`${failures.length} assertion(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `trigger-case carrier: ${CASES.length} package case(s), consumer merge in four states ✓`,
);
recordCheck();
