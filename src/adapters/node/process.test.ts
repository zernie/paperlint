/**
 * The `RunProcess` contract, against the real `spawnSync`: what each way a program can end comes
 * back as. The only process tests allowed real I/O — the core and app tests take `ProcessExit`
 * literals instead.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import type { Command } from "../../ports/process.ts";
import { spawnProcess } from "./process.io.ts";

const run = spawnProcess();
const sh = (script: string, timeoutMs = 10_000): Command => ({
  file: "/bin/sh",
  args: ["-c", script],
  env: { PATH: "/usr/bin:/bin" },
  timeoutMs,
});

test("a program that is not there is `not-found`, and names the program", () => {
  // Guards: ENOENT is the executable itself — "perl is missing" rather than "banal failed".
  assert.deepEqual(
    run.run({ ...sh(""), file: "paperlint-no-such-program-xyz", args: [] }),
    { kind: "not-found", file: "paperlint-no-such-program-xyz" },
  );
});

test("an exit status, stdout and stderr come back as they were", () => {
  assert.deepEqual(run.run(sh("echo out; echo err >&2; exit 3")), {
    kind: "exited",
    status: 3,
    stdout: "out\n",
    stderr: "err\n",
  });
});

test("a program that outlives its time is `timed-out`, not an exit", () => {
  const r = run.run(sh("sleep 5", 50));
  // Guards: a hang ends, and says it hung — not "exit null".
  assert.equal(r.kind, "timed-out");
});

test("the environment is the Command's, whole: nothing leaks in from the parent", () => {
  const r = run.run({ ...sh('echo "[$HOME][$X]"'), env: { X: "1" } });
  // Guards: `Command.env` is the child's entire environment — the adapter merges nothing.
  assert.deepEqual(r.kind === "exited" && r.stdout, "[][1]\n");
});

test("a program killed by a signal is `signalled`, with what it printed first", () => {
  assert.deepEqual(run.run(sh("echo before; kill -TERM $$")), {
    kind: "signalled",
    signal: "SIGTERM",
    stdout: "before\n",
    stderr: "",
  });
});

test("output past maxOutputBytes is a spawn failure, named by Node's own message", () => {
  const r = run.run({ ...sh("head -c 100000 /dev/zero"), maxOutputBytes: 10 });
  assert.equal(r.kind, "spawn-failed");
  assert.match(r.kind === "spawn-failed" ? r.message : "", /ENOBUFS/);
});

test("cwd is the Command's when it names one", () => {
  const r = run.run({ ...sh("pwd"), cwd: "/" });
  assert.deepEqual(r.kind === "exited" && r.stdout, "/\n");
});

test("a spawn that reports no status, no signal and no error reads as exit 1, not success", () => {
  const silent = spawnProcess((() => ({
    pid: 0,
    output: [],
    stdout: "",
    stderr: "",
    status: null,
    signal: null,
  })) as never);
  assert.deepEqual(silent.run(sh("true")), {
    kind: "exited",
    status: 1,
    stdout: "",
    stderr: "",
  });
});
