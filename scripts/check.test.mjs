/**
 * check.mjs's runGates — the one command run before a push — on every outcome, with an injected
 * spawn: a pass, a declared skip (77) and a failure, and THE TAIL that names what it does not cover.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { GATES, NOT_COVERED, runGates } from "./check.mjs";

const capture = () => {
  const out = [];
  const io = { log: (s) => out.push(s), err: (s) => out.push(`E ${s}`) };
  return { out, io };
};

test("runGates: a pass, a declared skip (77) and a failure, then the tail naming what is not covered", () => {
  const gates = [
    { name: "passes", job: "gates", run: ["true"] },
    { name: "skips", job: "gates", run: ["skipper", "--x"] },
    {
      name: "fails",
      job: null,
      reason: "runs only here, a reason long enough",
      run: ["false"],
    },
  ];
  const status = { true: 0, skipper: 77, false: 3 };
  const written = [];
  const { out, io } = capture();
  const code = runGates({
    gates,
    spawn: (cmd) => ({ status: status[cmd] }),
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
