/**
 * `runMutations` — three harness outcomes, not two.
 *
 * ── WHY THIS FILE SHOWED UP LAST, NOT FIRST ────────────────────────────
 * The engine that renders a verdict for EVERY battery in the repository was, until 2026-09-15,
 * checked by nothing. Every one of its defenses (a harness path pointing at nothing · a no-op
 * mutation · retrying a non-kill · a baseline of already-red harnesses) was written AFTER it
 * caught a real defect, and none of them had a test. So the next defect of the same class
 * arrived in CI and was read as "two mutations survived".
 *
 * The third outcome — SKIP — is pinned down here. The fixtures are real: the skipping harness
 * calls `skip()` FROM vigiles rather than faking it with exit code 77 by hand, because the
 * latter would test my mental model of the protocol instead of the protocol itself.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { recordCheck } from "vigiles";
import { runMutations } from "./mutation-driver.mjs";

// The fixture lives in a temp directory where `node` will not find `vigiles` by walking up
// the tree. The specifier is resolved HERE, by node's own resolver, and substituted in
// absolute — that way the skip is done by a real `skip()`, not an imitation via exit code 77.
// An imitation would test my mental model of the protocol instead of the protocol itself.
const VIGILES = pathToFileURL(createRequire(import.meta.url).resolve("vigiles")).href;

const SUBJECT = "export const MARKER = 'keep-me';\n";
const cases = [];

/** Temp root: a fixture subject + the harness that judges it. */
function fixture(harnessBody) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mutdrv-")));
  const subject = join(root, "subject.mjs");
  const harness = join(root, "probe.harness.mjs");
  writeFileSync(subject, SUBJECT);
  writeFileSync(harness, harnessBody(subject));
  return { root, subject, harness };
}

const quiet = { log: console.log, error: console.error };
/** The verdict is read from the exit code and output, so the driver's output is intercepted. */
function silently(fn) {
  const lines = [];
  console.log = console.error = (...a) => lines.push(a.join(" "));
  try {
    return { code: fn(), out: lines.join("\n") };
  } finally {
    console.log = quiet.log;
    console.error = quiet.error;
  }
}

// ── 1. THE HARNESS SKIPS ⇒ the battery REFUSES, rather than declaring the mutation survived.
// Observed failure (run 34966606186): CI had no `claude` binary, the harness skipped,
// `vigiles test` returned 0, and the driver printed "🔴 SURVIVED" — a claim about the TEST
// that was really a claim about the ENVIRONMENT.
{
  const { root, subject, harness } = fixture(
    () => `import { skip } from ${JSON.stringify(VIGILES)};\nskip("fixture: the capability this tier observes is absent");\n`,
  );
  try {
    const before = readFileSync(subject, "utf8");
    const { code, out } = silently(() =>
      runMutations({
        root,
        runner: "node",
        cases: [{ name: "marker removed", harness, expect: "MARKER", disables: "fixture", edits: [[subject, "keep-me", "gone"]] }],
      }),
    );
    assert.equal(code, 2, `a skip must REFUSE, not judge; got ${code}\n${out}`);
    assert.doesNotMatch(out, /SURVIVED/, "and not claim a survived mutation — that's a false diagnosis");
    assert.match(out, /SKIP on clean source/, "the refusal must name the cause");
    assert.match(out, /probe\.harness\.mjs/, "and name WHICH harness is skipping");
    assert.equal(
      readFileSync(subject, "utf8"), before,
      "the refusal must happen BEFORE any file is edited — the message arrives with a clean tree",
    );
    cases.push("harness skips → refusal before editing files, no verdict about the mutation");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 2. THE HARNESS WORKS ⇒ the prior behavior is intact. Without this half, case 1 is
// indistinguishable from an engine that just always refuses.
{
  const { root, subject, harness } = fixture(
    (s) => `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nassert.match(readFileSync(${JSON.stringify(s)}, "utf8"), /keep-me/, "MARKER is gone");\n`,
  );
  try {
    const { code, out } = silently(() =>
      runMutations({
        root,
        runner: "node",
        cases: [{ name: "marker removed", harness, expect: "MARKER is gone", disables: "fixture", edits: [[subject, "keep-me", "gone"]] }],
      }),
    );
    assert.equal(code, 0, `a working harness must kill the mutation; got ${code}\n${out}`);
    assert.match(out, /RED \(expected case\)/, "and kill it with ITS OWN message, not just any red");
    assert.equal(readFileSync(subject, "utf8"), SUBJECT, "the source must be restored");
    cases.push("harness works → mutation killed by its own assertion, source restored");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 3. THE PATCH NEVER LANDED ⇒ that is NOT a survived mutation. The third outcome, and until
// 09-17 the engine dumped it into the second one: anything that was not `RED (expected` counted
// as survived — including NOT FOUND, AMBIGUOUS and NO-OP, where the file was never edited at all.
//
// 🔴 The two verdicts send the reader in OPPOSITE directions: survived means STRENGTHEN THE
// TEST, unusable means FIX THE MUTATION. Observed the same day: a `find` string went stale
// after the rule was rewritten, the engine reported "1 mutation survived", and the next step
// would have been rewriting a harness that was fine.
{
  const { root, subject, harness } = fixture(
    (s) => `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nassert.match(readFileSync(${JSON.stringify(s)}, "utf8"), /keep-me/, "MARKER is gone");\n`,
  );
  try {
    const { code, out } = silently(() =>
      runMutations({
        root,
        runner: "node",
        cases: [{
          name: "stale target",
          harness,
          expect: "MARKER is gone",
          disables: "fixture",
          // The string is not in the file — exactly the case of a stale target.
          edits: [[subject, "no-such-string-anywhere", "x"]],
        }],
      }),
    );
    assert.equal(code, 1, `an unusable mutation must REFUSE the run; got ${code}\n${out}`);
    assert.match(out, /UNUSABLE/, "the verdict must be named unusable, not survived");
    assert.match(out, /NOT FOUND/, "and name the CAUSE — what exactly was not found");
    assert.doesNotMatch(
      out,
      /mutation\(s\) survived/,
      "and must NOT claim a survived mutation: that would send someone to fix a working test",
    );
    cases.push("patch never landed → UNUSABLE with a cause, not \"mutation survived\"");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Report to the tool, or the surface counts as UNCOVERED despite a working test —
// "0 checks" and "no test" look identical in the ledger.
recordCheck(cases.length);
console.log(`mutation-driver: ${cases.length} outcome(s) pinned down:`);
for (const c of cases) console.log(`  ok  ${c}`);
