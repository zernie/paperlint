/**
 * `npm test`'s runner: both suites run whatever the first returned, each failure is named, and
 * the harness arguments reach the harness runner only.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { runSuites, SUITES, type Spawn } from "./test.ts";

/** A spawn that records every call and exits with `status[file]` (`null` for a signal). */
const fake = (status: Record<string, number | null>) => {
  const calls: string[][] = [];
  const spawn: Spawn = (file, args) => {
    calls.push([file, ...args]);
    return { status: status[file] ?? null };
  };
  return { calls, spawn };
};

test("a failing vitest does not skip the harnesses, and is named as the failure", () => {
  const { calls, spawn } = fake({ vitest: 1, vigiles: 0 });
  const said: string[] = [];
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
  const said: string[] = [];
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

test("every suite runs the SOURCES: the paperlint-source condition is in NODE_OPTIONS, the caller's kept", () => {
  const seen: (string | undefined)[] = [];
  const spawn: Spawn = (_file, _args, options) => {
    seen.push(options.env.NODE_OPTIONS);
    return { status: 0 };
  };
  assert.equal(
    runSuites([], {
      spawn,
      err: assert.fail,
      env: { NODE_OPTIONS: "--import=./x.ts" },
    }),
    0,
  );
  assert.deepEqual(seen, [
    "--conditions=paperlint-source --import=./x.ts",
    "--conditions=paperlint-source --import=./x.ts",
  ]);
  // Without a caller's NODE_OPTIONS there is no stray trailing space.
  seen.length = 0;
  runSuites([], { spawn, err: assert.fail, env: {} });
  assert.deepEqual(seen, [
    "--conditions=paperlint-source",
    "--conditions=paperlint-source",
  ]);
});
