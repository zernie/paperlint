/**
 * check.ts's runGates — the one command run before a push — on every outcome, with an injected
 * spawn: a pass, a declared skip (77) and a failure, and THE TAIL that names what it does not cover.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { GATES, NOT_COVERED, runGates, type Gate } from "./check.ts";

const capture = () => {
  const out: string[] = [];
  const io = {
    log: (s: string) => out.push(s),
    err: (s: string) => out.push(`E ${s}`),
  };
  return { out, io };
};

test("runGates: a pass, a declared skip (77) and a failure, then the tail naming what is not covered", () => {
  const gates: Gate[] = [
    { name: "passes", job: "gates", run: ["true"] },
    { name: "skips", job: "gates", run: ["skipper", "--x"] },
    {
      name: "fails",
      job: null,
      reason: "runs only here, a reason long enough",
      run: ["false"],
    },
  ];
  const status: Record<string, number> = { true: 0, skipper: 77, false: 3 };
  const written: string[] = [];
  const { out, io } = capture();
  const code = runGates({
    gates,
    spawn: (cmd) => ({ status: status[cmd] ?? null }),
    write: (s) => written.push(s),
    ...io,
  });
  assert.deepEqual(
    { code, written, out },
    {
      code: 1,
      written: ["── passes\n", "── skips\n", "── fails\n"],
      out: [
        "",
        "E 🔴 gates failed:",
        "E    fails  (false → 3)",
        "⏳ skipped: skips  (skipper --x → 77)",
        "\nWhat this command does NOT cover:",
        ...Object.entries(NOT_COVERED).map(
          ([job, why]) => `  CI job «${job}» — ${why}`,
        ),
        "  (and «fails» runs ONLY here — runs only here, a reason long enough)",
      ],
    },
  );
});

test("runGates: all passing, with a skip, says how many passed and that the skip is not a pass", () => {
  const { out, io } = capture();
  const code = runGates({
    gates: [
      { name: "a", job: "gates", script: "build" },
      { name: "b", job: "gates", run: ["skipper"] },
    ],
    spawn: (cmd, args) => ({
      status: cmd === "npm" && args[2] === "build" ? 0 : 77,
    }),
    write: () => {},
    ...io,
  });
  assert.deepEqual(
    [code, out[1], out[2]],
    [
      0,
      "✓ 1 gate(s) passed, 1 SKIPPED — not run, not passed",
      "⏳ skipped: b  (skipper → 77)",
    ],
  );
  assert.ok(GATES.length > 0);
});

test("run as a program with every gate passing: the plain verdict, exit 0", () => {
  // spawnSync is replaced before check.ts loads, so the real file runs end to end — every gate
  // "passes" in microseconds instead of the eleven real ones running.
  const allPass = [
    'import cp from "node:child_process";',
    'import { syncBuiltinESMExports } from "node:module";',
    "cp.spawnSync = () => ({ status: 0 });",
    "syncBuiltinESMExports();",
  ].join("\n");
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      `data:text/javascript,${encodeURIComponent(allPass)}`,
      fileURLToPath(new URL("./check.ts", import.meta.url)),
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    new RegExp(`\\n✓ ${String(GATES.length)} gate\\(s\\) passed\\n`),
  );
});
