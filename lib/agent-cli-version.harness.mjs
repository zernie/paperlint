/**
 * `observeAgentCli` — both halves, every case staged through an INJECTED spawner.
 *
 * The case that matters most is 4: a probe that discards its output. It cannot be staged at
 * all against a real `spawnSync`, because there is no way to ask the installed binary to print
 * nothing — which is precisely why the observation had to leave the harness that spawns it
 * before it could be tested (issue #7).
 */
import assert from "node:assert/strict";
import { recordCheck } from "vigiles";
import { observeAgentCli, CHARACTERIZED_CLI } from "./agent-cli-version.mjs";

/** A spawner that records how it was called, so the CALL SHAPE is assertable, not just the result. */
const spawner = (result) => {
  const seen = [];
  const fn = (program, args, options) => {
    seen.push({ program, args, options });
    return result;
  };
  fn.seen = seen;
  return fn;
};

const cases = [];

// ── 1. BINARY ABSENT: no throw, and `present` says so — the skip path of the caller.
{
  const spawnSync = spawner({ status: 127, stdout: "", stderr: "not found" });
  const o = observeAgentCli({ spawnSync });
  assert.equal(o.present, false, "a non-zero probe means the binary is not usable");
  assert.equal(o.version, "", "and there is no version to report");
  assert.match(o.note, /not installed/, "the note must say WHY there is nothing to observe");
  cases.push("CLI absent → present:false, no throw, note explains");
}

// ── 2. 🔴 DRIFT IS NAMED, NOT INFERRED. The measured case from issue #7: the machine carries
//      2.1.273 while the assertions were written against 2.1.227.
{
  const spawnSync = spawner({ status: 0, stdout: "2.1.273 (Claude Code)\n", stderr: "" });
  const o = observeAgentCli({ spawnSync });
  assert.equal(o.present, true);
  assert.equal(o.version, "2.1.273", "the version must be PARSED out of the line, not left raw");
  assert.equal(o.raw, "2.1.273 (Claude Code)", "and the full line kept for the report");
  assert.equal(o.characterized, CHARACTERIZED_CLI, "the characterized number rides along as a value");
  assert.equal(o.drifted, true, "2.1.273 ≠ 2.1.227 is drift and must be computed, not eyeballed");
  assert.ok(
    o.note.includes("2.1.273") && o.note.includes(CHARACTERIZED_CLI),
    `the note must name BOTH numbers so a reader sees them diverge; got: ${o.note}`,
  );
  cases.push("drifted CLI → version parsed, drifted:true, note names BOTH numbers");
}

// ── 3. NO DRIFT: the same machinery must stay quiet when the numbers agree, or `drifted`
//      would be a constant rather than a comparison.
{
  const spawnSync = spawner({ status: 0, stdout: `${CHARACTERIZED_CLI} (Claude Code)\n`, stderr: "" });
  const o = observeAgentCli({ spawnSync });
  assert.equal(o.drifted, false, "matching versions are not drift");
  assert.equal(o.version, CHARACTERIZED_CLI);
  cases.push("CLI at the characterized version → drifted:false");
}

// ── 4. 🔴 THE DEFECT ITSELF: exit 0, nothing on stdout — what `stdio: "ignore"` produced.
//      Reporting `characterized against ""` would be issue #7 wearing new clothes, so this
//      must THROW rather than return an empty observation.
{
  const spawnSync = spawner({ status: 0, stdout: null, stderr: "" });
  assert.throws(
    () => observeAgentCli({ spawnSync }),
    /is not an observation/,
    "exit 0 with no version on stdout must fail loudly, not be reported as a version",
  );
  cases.push("exit 0 + empty stdout (the `stdio: \"ignore\"` shape) → throws, does not report a blank");
}

// ── 5. THE CALL SHAPE, asserted directly. Case 4 catches a discarding probe only because the
//      double returns nothing; a real `stdio: "ignore"` would ALSO have to be caught if some
//      other path happened to fill stdout. So the options handed to the spawner are checked.
{
  const spawnSync = spawner({ status: 0, stdout: "2.1.273 (Claude Code)\n", stderr: "" });
  observeAgentCli({ spawnSync });
  const { args, options } = spawnSync.seen[0];
  assert.deepEqual(args, ["--version"], "the observation must ask for the version");
  assert.equal(options.encoding, "utf8", "without an encoding the output is a Buffer nobody reads");
  assert.notEqual(options.stdio, "ignore", "`stdio: \"ignore\"` is the discarded-output defect itself");
  cases.push("the probe is spawned with encoding:utf8 and never stdio:ignore");
}

// ── 6. AND THE REAL BINARY, when this machine has one. Cases 1-5 are about the module; this
//      one is about reality — an observer that only ever meets a double proves nothing about
//      the output format of the tool it exists to read.
{
  const { spawnSync } = await import("node:child_process");
  const o = observeAgentCli({ spawnSync });
  if (o.present) {
    assert.match(o.version, /^\d+\.\d+\.\d+$/, `the real CLI's version must parse; raw was ${JSON.stringify(o.raw)}`);
    cases.push(`real \`claude\` binary present → observed ${o.version} (characterized ${o.characterized}${o.drifted ? ", DRIFTED" : ""})`);
  } else {
    cases.push("real `claude` binary absent on this machine → absent path exercised for real");
  }
}

recordCheck(cases.length);
console.log(`observeAgentCli: ${cases.length} cases:`);
for (const c of cases) console.log(`  ok  ${c}`);
