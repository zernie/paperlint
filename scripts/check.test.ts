/**
 * check.ts's runGates — the one command run before a push — on every outcome, with an injected
 * spawn: a pass, a skip (counted in a vitest gate's JSON report) and a failure, and THE TAIL that
 * names what it does not cover.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, vi } from "vitest";
import {
  GATES,
  NOT_COVERED,
  reportArgs,
  runGates,
  type Gate,
} from "./check.ts";

const capture = () => {
  const out: string[] = [];
  const io = {
    log: (s: string) => out.push(s),
    err: (s: string) => out.push(`E ${s}`),
  };
  return { out, io };
};

const SKIPPED_2 = JSON.stringify({ numPendingTests: 2, numTodoTests: 0 });

test("runGates: a pass, a vitest gate that skipped tests, and a failure, then the tail naming what is not covered", () => {
  const gates: Gate[] = [
    { name: "passes", job: "gates", run: ["true"] },
    { name: "skips", job: "gates", script: "test:e2e:x", vitest: true },
    {
      name: "fails",
      job: null,
      reason: "runs only here, a reason long enough",
      run: ["false"],
    },
  ];
  const status: Record<string, number> = { true: 0, npm: 0, false: 3 };
  const calls: string[][] = [];
  const written: string[] = [];
  const { out, io } = capture();
  const code = runGates({
    gates,
    spawn: (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status: status[cmd] ?? null };
    },
    write: (s) => written.push(s),
    reportOf: () => SKIPPED_2,
    ...io,
  });
  // The vitest gate is asked for its JSON report, beside its usual output.
  const vitestCall = calls[1] ?? [];
  const file = (vitestCall.at(-1) ?? "").replace("--outputFile.json=", "");
  assert.deepEqual(vitestCall, [
    "npm",
    "run",
    "-s",
    "test:e2e:x",
    ...reportArgs(file),
  ]);
  assert.deepEqual(
    { code, written, out },
    {
      code: 1,
      written: ["── passes\n", "── skips\n", "── fails\n"],
      out: [
        "",
        "E 🔴 gates failed:",
        "E    fails  (false → 3)",
        "⏳ skipped: skips  (npm run -s test:e2e:x → 2 test(s) skipped)",
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
      { name: "b", job: "gates", script: "test:e2e:x", vitest: true },
    ],
    spawn: () => ({ status: 0 }),
    write: () => {},
    reportOf: () => SKIPPED_2,
    ...io,
  });
  assert.deepEqual(
    [code, out[1], out[2]],
    [
      0,
      "✓ 1 gate(s) passed, 1 SKIPPED — not run, not passed",
      "⏳ skipped: b  (npm run -s test:e2e:x → 2 test(s) skipped)",
    ],
  );
  assert.ok(GATES.length > 0);
});

test("🔴 runGates: a vitest gate that exits 0 but leaves no report is a FAILURE, not a pass", () => {
  const { out, io } = capture();
  const code = runGates({
    gates: [{ name: "v", job: "gates", script: "test:e2e:x", vitest: true }],
    spawn: () => ({ status: 0 }),
    write: () => {},
    ...io,
  });
  assert.deepEqual(
    [code, out[1], out[2]],
    [
      1,
      "E 🔴 gates failed:",
      "E    v  (npm run -s test:e2e:x → exit 0, but no vitest JSON report to read skips from)",
    ],
  );
});

test("🔴 every gate runs with CI=true, as CI runs it — a local check is the CI check", () => {
  // Libraries change behaviour under CI=true (typescript-eslint infers a single run and parses from
  // disk): a gate run without it passed locally and failed in CI on 2026-10-07.
  // Whatever the caller's shell says: on CI it is already "true", so the test sets it otherwise.
  vi.stubEnv("CI", "false");
  const seen: (string | undefined)[] = [];
  runGates({
    gates: [
      { name: "a", job: "gates", run: ["true"] },
      { name: "b", job: "gates", script: "build" },
    ],
    spawn: (_cmd, _args, options) => {
      seen.push(options.env["CI"]);
      return { status: 0 };
    },
    write: () => {},
    ...capture().io,
  });
  vi.unstubAllEnvs();
  assert.deepEqual(seen, ["true", "true"]);
});

test("run as a program with every gate passing: the plain verdict, exit 0", () => {
  // spawnSync is replaced before check.ts loads, so the real file runs end to end — every gate
  // "passes" in microseconds instead of the eleven real ones running.
  const allPass = [
    'import cp from "node:child_process";',
    'import { syncBuiltinESMExports } from "node:module";',
    'import fs from "node:fs";',
    // A vitest gate writes its report where check.ts asked; a real run of none of them happens.
    "cp.spawnSync = (cmd, args = []) => {",
    '  const o = args.find((a) => a.startsWith("--outputFile.json="));',
    "  if (o) fs.writeFileSync(o.slice(18), JSON.stringify({ numPendingTests: 0, numTodoTests: 0 }));",
    "  return { status: 0 };",
    "};",
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
