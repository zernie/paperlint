/**
 * `npm test`'s runner: both suites run whatever the first returned, each failure is named, and
 * the harness arguments reach the harness runner only.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { runSuites, SUITES } from "./test.mjs";

const fake = (status) => {
  const calls = [];
  return {
    calls,
    spawn: (file, args) => {
      calls.push([file, ...args]);
      return { status: status[file] };
    },
  };
};

test("a failing vitest does not skip the harnesses, and is named as the failure", () => {
  const { calls, spawn } = fake({ vitest: 1, vigiles: 0 });
  const said = [];
  assert.equal(
    runSuites(["--no-skip"], { spawn, err: (s) => said.push(s) }),
    1,
  );
  assert.deepEqual(calls, [
    ["vitest", "run"],
    ["vigiles", "test", "--min=1", "--no-skip"],
  ]);
  assert.deepEqual(said, [
    "✗ vitest failed (exit 1) — its own report is above",
  ]);
});

test("both passing is 0 and silent; a harness killed by a signal is exit 1, named", () => {
  const ok = fake({ vitest: 0, vigiles: 0 });
  assert.equal(runSuites([], { spawn: ok.spawn, err: assert.fail }), 0);
  const killed = fake({ vitest: 0, vigiles: null });
  const said = [];
  assert.equal(
    runSuites([], { spawn: killed.spawn, err: (s) => said.push(s) }),
    1,
  );
  assert.deepEqual(said, [
    "✗ harnesses failed (exit 1) — its own report is above",
  ]);
  assert.deepEqual(
    SUITES.map((s) => s.name),
    ["vitest", "harnesses"],
  );
});
