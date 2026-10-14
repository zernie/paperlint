/**
 * grid-guard.mjs, run as a process the way a driver or a commit hook runs it. Each check is shown
 * BOTH ways: silent (exit 0) on correct input, and firing on a planted defect — a live lock
 * holder, a stale one, two attempts sharing a root, an uncommitted registry change, a staged key.
 * Every expectation is the whole result: exit code, stdout and stderr.
 *
 * No model, no network. Needs `git`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import {
  parseJson,
  runNode,
  useTempDir,
  writeTree,
  type ScriptResult,
} from "../../../test/support.ts";

const SCRIPT = join(import.meta.dirname, "grid-guard.mjs");
const WORK = useTempDir("grid-guard-");
const GIT_ENV = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};
const guard = (args: readonly string[], cwd?: string): ScriptResult =>
  runNode(SCRIPT, args, { cwd: cwd ?? WORK, env: GIT_ENV });
const ok = (stdout: string): ScriptResult => ({
  status: 0,
  stdout: `${stdout}\n`,
  stderr: "",
});
const no = (status: number, stderr: string): ScriptResult => ({
  status,
  stdout: "",
  stderr: `grid-guard: ${stderr}\n`,
});
const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const repo = (
  name: string,
  files: Readonly<Record<string, string>>,
): string => {
  const dir = writeTree(join(WORK, name), files);
  git(dir, "init", "-q");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
};
const lockFile = (root: string): Record<string, unknown> =>
  z
    .record(z.string(), z.unknown())
    .parse(parseJson(readFileSync(`${root}.lock`, "utf8")));
const USAGE =
  "usage: grid-guard.mjs <lock|release|gate|overlap|env-probe|scan-keys|precommit> … (see the header of this file)";

test("usage: no command, an unknown one, an unknown flag, a missing option, a missing path", () => {
  assert.deepEqual(guard([]), no(2, USAGE));
  assert.deepEqual(guard(["fly"]), no(2, USAGE));
  assert.deepEqual(
    guard(["lock", "x", "--owner", "a", "--colour", "red"]),
    no(
      2,
      `Unknown option '--colour'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--colour"\n${USAGE}`,
    ),
  );
  assert.deepEqual(
    guard(["lock", "x"]),
    no(2, `lock: needs --owner\n${USAGE}`),
  );
  assert.deepEqual(
    guard(["lock", "--owner", "a"]),
    no(2, `lock: wrong number of paths\n${USAGE}`),
  );
  assert.deepEqual(
    guard(["scan-keys"]),
    no(2, `scan-keys: wrong number of paths\n${USAGE}`),
  );
});

test("lock and release: a free root is locked; a second driver is refused while the holder lives", () => {
  const root = join(WORK, "wc-live");
  // This test's own process is the holder: alive for as long as the assertion runs.
  const first = guard([
    "lock",
    root,
    "--owner",
    "driver-a",
    "--pid",
    String(process.pid),
  ]);
  assert.deepEqual(
    first,
    ok(`locked ${root}.lock for driver-a (pid ${String(process.pid)})`),
  );
  const held = lockFile(root);
  assert.deepEqual(held, {
    owner: "driver-a",
    pid: process.pid,
    host: hostname(),
    at: held.at,
  });
  assert.deepEqual(
    guard(["lock", root, "--owner", "driver-b"]),
    no(
      1,
      `${root}.lock is held by driver-a (pid ${String(process.pid)} on ${hostname()} since ${String(held.at)}). Wait for it, or give this driver its own working-copy root.`,
    ),
  );
  assert.deepEqual(
    lockFile(root),
    held,
    "the refused driver must not touch the lock",
  );
});

test("lock and release: a lock whose process is gone on this host is taken over; one from another host is not", () => {
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  const root = join(WORK, "wc-stale");
  writeTree(WORK, {
    "wc-stale.lock": JSON.stringify({
      owner: "crashed",
      pid: dead,
      host: hostname(),
      at: "x",
    }),
  });
  assert.deepEqual(
    guard(["lock", root, "--owner", "driver-b", "--pid", String(process.pid)]),
    ok(
      `took over a stale lock on ${root}.lock (holder crashed, pid ${String(dead)}, is gone)`,
    ),
  );
  assert.equal(lockFile(root).owner, "driver-b");

  const far = join(WORK, "wc-far");
  writeTree(WORK, {
    "wc-far.lock": JSON.stringify({
      owner: "remote",
      pid: dead,
      host: "elsewhere",
      at: "x",
    }),
  });
  assert.deepEqual(
    guard(["lock", far, "--owner", "driver-b"]),
    no(
      1,
      `${far}.lock is held by remote (pid ${String(dead)} on elsewhere since x). Wait for it, or give this driver its own working-copy root.`,
    ),
  );
});

test("lock and release: without --pid the lock records the caller's process", () => {
  const root = join(WORK, "wc-ppid");
  const r = guard(["lock", root, "--owner", "a"]);
  assert.equal(r.status, 0, r.stderr);
  // The caller here is this test process, which spawned node directly.
  assert.equal(lockFile(root).pid, process.pid);
});

test("lock and release: release: only by the owner, only when held", () => {
  const root = join(WORK, "wc-release");
  assert.equal(
    guard(["lock", root, "--owner", "a", "--pid", String(process.pid)]).status,
    0,
  );
  assert.deepEqual(
    guard(["release", root, "--owner", "b"]),
    no(1, `${root}.lock is held by a, not b`),
  );
  assert.deepEqual(
    guard(["release", root, "--owner", "a"]),
    ok(`released ${root}.lock`),
  );
  assert.equal(existsSync(`${root}.lock`), false);
  assert.deepEqual(
    guard(["release", root, "--owner", "a"]),
    no(1, `${root}.lock is not held`),
  );
});

test("lock and release: a root whose parent does not exist is an error, not a lock", () => {
  const root = join(WORK, "no-such-dir", "wc");
  const r = guard(["lock", root, "--owner", "a"]);
  assert.deepEqual(
    r,
    no(1, `ENOENT: no such file or directory, open '${root}.lock'`),
  );
});

const REGISTRY = {
  author: "the-author",
  draw: { seed: 20240101, population: "every unit of the measured kind" },
  arms: ["control", "treatment"],
  seeds: [1, 2],
  budget: { cap: 10, currency: "USD" },
  models: [
    {
      id: "m1",
      smoke: { timeoutSec: 1800, costPerRun: 2, readBy: "the-author" },
    },
    { id: "m2" },
  ],
  units: [
    {
      id: "u1",
      role: "counted",
      requirement: "the unit as the author asked for it, verbatim",
      approval: {
        by: "the-author",
        at: "2026-01-02T10:00:00Z",
        channel: "chat",
      },
      proof: { toolVisible: true, firesOnPinned: true, acceptsReference: true },
    },
    { id: "u-smoke", role: "smoke" },
    {
      id: "u-agent",
      role: "counted",
      approval: { by: "the-agent", at: "x", channel: "x" },
      proof: {},
    },
    {
      id: "u-out",
      role: "excluded",
      reason: "the pinned state does not build",
    },
  ],
};
const CELL = [
  "--unit",
  "u1",
  "--arm",
  "control",
  "--model",
  "m1",
  "--seed",
  "1",
];

const dir = repo("gate", { "grid.json": JSON.stringify(REGISTRY, null, 2) });
const reg = join(dir, "grid.json");
const ledger = join(dir, "attempts.jsonl");
const gate = (cell: readonly string[], ledgerPath = ledger): ScriptResult =>
  guard(["gate", "--registry", reg, "--ledger", ledgerPath, ...cell]);

test("gate: a declared, approved, proven, smoked cell under the cap runs, with its timeout", () => {
  assert.deepEqual(
    gate(CELL),
    ok(
      JSON.stringify({
        allowed: true,
        cell: { unit: "u1", arm: "control", model: "m1", seed: "1" },
        counted: true,
        timeoutSec: 1800,
        spent: 0,
      }),
    ),
  );
});

test("gate: a smoke unit needs no approval and no smoke result", () => {
  assert.deepEqual(
    gate([
      "--unit",
      "u-smoke",
      "--arm",
      "treatment",
      "--model",
      "m2",
      "--seed",
      "2",
    ]),
    ok(
      JSON.stringify({
        allowed: true,
        cell: { unit: "u-smoke", arm: "treatment", model: "m2", seed: "2" },
        counted: false,
        timeoutSec: null,
        spent: 0,
      }),
    ),
  );
});

test("gate: everything wrong with a cell is named at once", () => {
  const refused = (cell: string, why: string[]): ScriptResult =>
    no(1, `refused ${cell}:\n  - ${why.join("\n  - ")}`);
  assert.deepEqual(
    gate(["--unit", "u9", "--arm", "x", "--model", "m9", "--seed", "7"]),
    refused('{"unit":"u9","arm":"x","model":"m9","seed":"7"}', [
      'unit "u9" is not in the registry',
      'arm "x" is not declared',
      'model "m9" is not declared',
      'seed "7" is not declared',
    ]),
  );
  // Approval written by the agent, no sandbox proof, a model never smoked.
  assert.deepEqual(
    gate([
      "--unit",
      "u-agent",
      "--arm",
      "control",
      "--model",
      "m2",
      "--seed",
      "1",
    ]),
    refused('{"unit":"u-agent","arm":"control","model":"m2","seed":"1"}', [
      'unit "u-agent" has no approval by the author (approval.by = author, with at and channel)',
      'unit "u-agent" has no sandbox proof (toolVisible, firesOnPinned, acceptsReference)',
      'model "m2" has no smoke result (smoke.timeoutSec, smoke.costPerRun)',
    ]),
  );
  assert.deepEqual(
    gate([
      "--unit",
      "u-out",
      "--arm",
      "control",
      "--model",
      "m1",
      "--seed",
      "1",
    ]),
    refused('{"unit":"u-out","arm":"control","model":"m1","seed":"1"}', [
      'unit "u-out" has role "excluded" (the pinned state does not build); only "counted" and "smoke" units run',
    ]),
  );
});

test("gate: a counted cell is skipped, not re-run; spend counts every attempt, against the cap", () => {
  writeTree(dir, {
    "attempts.jsonl": [
      {
        attempt: "a1",
        unit: "u1",
        arm: "control",
        model: "m1",
        seed: 1,
        start: "t0",
      },
      { attempt: "a1", end: "t1", status: "complete", cost: 3 },
      {
        attempt: "a2",
        unit: "u1",
        arm: "treatment",
        model: "m1",
        seed: 1,
        cost: 4,
        status: "harness-error",
      },
      // Crashed before it reported a cost: on record, costs nothing known.
      {
        attempt: "a3",
        unit: "u-smoke",
        arm: "control",
        model: "m2",
        seed: 2,
        start: "t2",
      },
      "",
    ]
      .map((r) => (r === "" ? "" : JSON.stringify(r)))
      .join("\n"),
  });
  assert.deepEqual(
    gate(CELL),
    no(
      3,
      '{"unit":"u1","arm":"control","model":"m1","seed":"1"} is already counted; skip it',
    ),
  );
  // 3 + 4 spent, next 2 → 9, under 10: runs. A harness error is not counted, so a2 runs again.
  assert.equal(
    gate(["--unit", "u1", "--arm", "treatment", "--model", "m1", "--seed", "1"])
      .status,
    0,
  );
  writeTree(dir, {
    "more.jsonl": `${JSON.stringify({ attempt: "b", cost: 9 })}\n`,
  });
  assert.deepEqual(
    gate(CELL, join(dir, "more.jsonl")),
    no(
      1,
      'refused {"unit":"u1","arm":"control","model":"m1","seed":"1"}:\n  - budget: spent 9 + next 2 exceeds the cap 10',
    ),
  );
});

test("gate: only the COMMITTED registry allows anything", () => {
  const d = repo("gate-dirty", { "grid.json": JSON.stringify(REGISTRY) });
  writeTree(d, {
    "grid.json": JSON.stringify({
      ...REGISTRY,
      models: [...REGISTRY.models, { id: "m3" }],
    }),
  });
  const r = guard([
    "gate",
    "--registry",
    join(d, "grid.json"),
    "--ledger",
    ledger,
    ...CELL,
  ]);
  assert.deepEqual(
    r,
    no(
      1,
      `${join(d, "grid.json")} differs from its committed version; commit the change (a dated addendum) before any run it allows`,
    ),
  );
  writeTree(d, { "new.json": "{}" });
  assert.deepEqual(
    guard([
      "gate",
      "--registry",
      join(d, "new.json"),
      "--ledger",
      ledger,
      ...CELL,
    ]),
    no(
      1,
      `${join(d, "new.json")} is not committed; commit it before any run it allows`,
    ),
  );
  const loose = writeTree(join(WORK, "no-git"), { "grid.json": "{}" });
  // WORK is a temp directory outside any repository, so git finds none above it either.
  assert.deepEqual(
    guard([
      "gate",
      "--registry",
      join(loose, "grid.json"),
      "--ledger",
      ledger,
      ...CELL,
    ]),
    no(
      1,
      `${join(loose, "grid.json")} is not inside a git repository; the registry must be committed`,
    ),
  );
});

test("gate: an empty registry: no budget, no draw, an excluded unit without a reason", () => {
  const d = repo("gate-empty", {
    "grid.json": JSON.stringify({
      units: [
        { id: "u1", role: "counted" },
        { id: "x", role: "excluded" },
      ],
    }),
  });
  assert.deepEqual(
    guard([
      "gate",
      "--registry",
      join(d, "grid.json"),
      "--ledger",
      ledger,
      ...CELL,
    ]),
    no(
      1,
      [
        'refused {"unit":"u1","arm":"control","model":"m1","seed":"1"}:',
        'arm "control" is not declared',
        'model "m1" is not declared',
        'seed "1" is not declared',
        "an excluded unit has no reason",
        "the registry declares no budget.cap",
        'unit "u1" has no approval by the author (approval.by = author, with at and channel)',
        'unit "u1" has no sandbox proof (toolVisible, firesOnPinned, acceptsReference)',
        "the registry records no draw seed",
      ].join("\n  - "),
    ),
  );
});

const ledgerFile = (name: string, recs: readonly object[]): string =>
  join(
    writeTree(WORK, {
      [name]: recs.map((r) => JSON.stringify(r)).join("\n"),
    }),
    name,
  );

test("overlap: sequential attempts on one root, and parallel ones on two roots, are clean", () => {
  const f = ledgerFile("clean.jsonl", [
    {
      attempt: "a",
      root: "/w/1",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-01T01:00:00Z",
      status: "complete",
    },
    {
      attempt: "b",
      root: "/w/1",
      start: "2026-01-01T01:00:00Z",
      end: "2026-01-01T02:00:00Z",
      status: "complete",
    },
    {
      attempt: "c",
      root: "/w/2",
      start: "2026-01-01T00:30:00Z",
      end: "2026-01-01T01:30:00Z",
      status: "complete",
    },
    // Two harness errors overlapping: already marked, nothing counted is at risk.
    {
      attempt: "d",
      root: "/w/3",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-01T02:00:00Z",
      status: "harness-error",
    },
    {
      attempt: "e",
      root: "/w/3",
      start: "2026-01-01T01:00:00Z",
      end: "2026-01-01T03:00:00Z",
      status: "harness-error",
    },
  ]);
  assert.deepEqual(guard(["overlap", f]), ok("no overlap among 5 attempts"));
});

test("overlap: two attempts on one root at once are flagged, an unfinished one overlaps everything after it", () => {
  const f = ledgerFile("dirty.jsonl", [
    {
      attempt: "a",
      root: "/w/1",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-01T02:00:00Z",
      status: "complete",
    },
    {
      attempt: "b",
      root: "/w/1/",
      start: "2026-01-01T01:00:00Z",
      end: "2026-01-01T03:00:00Z",
      status: "complete",
    },
    { attempt: "c", root: "/w/2", start: "2026-01-01T00:00:00Z" },
    {
      attempt: "d",
      root: "/w/2",
      start: "2026-06-01T00:00:00Z",
      end: "2026-06-01T01:00:00Z",
      status: "complete",
    },
    {
      attempt: "e",
      root: "/w/9",
      start: "yesterday",
      end: "2026-01-01T00:00:00Z",
    },
  ]);
  assert.deepEqual(
    guard(["overlap", f]),
    no(
      1,
      [
        "e: start or end is not a date",
        "a and b shared /w/1",
        "c and d shared /w/2",
        'mark each contaminated attempt "harness-error" (keep it) and run the cell again',
      ].join("\n"),
    ),
  );
});

test("overlap: a missing ledger is an error, not a clean audit", () => {
  const f = join(WORK, "absent.jsonl");
  assert.deepEqual(guard(["overlap", f]), no(1, `no ledger at ${f}`));
});

/** A hand-built environment: nothing inherited but what node, git and coverage need. */
const probe = (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): ScriptResult => {
  const keep = ["PATH", "HOME", "NODE_V8_COVERAGE", "NODE_OPTIONS"].filter(
    (k) => process.env[k] !== undefined,
  );
  const r = spawnSync(process.execPath, [SCRIPT, "env-probe", ...args], {
    encoding: "utf8",
    env: {
      ...Object.fromEntries(keep.map((k) => [k, process.env[k]])),
      ...GIT_ENV,
      ...env,
    },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

test("env-probe: clean, and git commits", () => {
  assert.deepEqual(probe([], {}), ok("no secret-named variables"));
  assert.deepEqual(
    probe(["--git"], {}),
    ok("no secret-named variables; git init, add and commit work"),
  );
});

test("env-probe: secret-named variables are named, their values never printed; --allow accepts one by name", () => {
  const value = "do-not-print-this-value-123456";
  const r = probe([], {
    SERVICE_TOKEN: value,
    DB_PASSWORD: value,
    PLAIN: value,
  });
  assert.deepEqual(
    r,
    no(
      1,
      "secret-named variables reach this environment (names only): DB_PASSWORD, SERVICE_TOKEN",
    ),
  );
  assert.deepEqual(
    probe(["--allow", "SERVICE_TOKEN", "--allow", "DB_PASSWORD"], {
      SERVICE_TOKEN: value,
      DB_PASSWORD: value,
    }),
    ok("no secret-named variables"),
  );
});

test("env-probe: a policy that broke git is caught", () => {
  // Git told to read its configuration from a file that cannot parse: the shape of a sandbox
  // whose environment policy removed or mangled what git needs.
  const bad = writeTree(join(WORK, "badcfg"), { gitconfig: "[[[\n" });
  const r = probe(["--git"], { GIT_CONFIG_GLOBAL: join(bad, "gitconfig") });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(
    r.stderr,
    /^grid-guard: git init fails in this environment: .*bad config/s,
  );
});

test("env-probe: git missing altogether is caught", () => {
  const r = probe(["--git"], { PATH: "/nonexistent" });
  assert.deepEqual(
    r,
    no(1, "git init fails in this environment: Error: spawnSync git ENOENT"),
  );
});

// Planted values, assembled at run time so that this file itself carries none of them.
const FAKE = {
  aws: `AKIA${"Q".repeat(16)}`,
  sk: `sk-${"a1".repeat(16)}`,
  dump: `SERVICE_TOKEN=${"z9".repeat(10)}`,
  pem: ["-----BEGIN RSA", "PRIVATE", "KEY-----"].join(" "),
  gh: `ghp_${"b".repeat(36)}`,
  chat: `xoxb-${"1".repeat(12)}`,
  cloud: `AIza${"c".repeat(35)}`,
};

test("scan-keys: clean files, placeholders, binaries and skipped folders stay silent", () => {
  const d = writeTree(join(WORK, "clean-art"), {
    "README.md":
      "Set API_KEY=<your key here> or API_KEY=$FROM_ENV before running.\n",
    "data/results.csv": "unit,arm,outcome\nu1,control,pass\n",
    "blob.bin": `\0${FAKE.aws}`,
    "node_modules/x/leak.txt": FAKE.aws,
    ".git/leak.txt": FAKE.aws,
  });
  assert.deepEqual(
    guard(["scan-keys", d]),
    ok("no key-shaped strings in 3 files"),
  );
});

test("scan-keys: every planted shape fires, by file and line, and no value is printed", () => {
  const d = writeTree(join(WORK, "dirty-art"), {
    "transcript.log": ["ok", FAKE.dump, FAKE.aws, FAKE.sk].join("\n"),
    "keys/id": [FAKE.pem, FAKE.gh, FAKE.chat, FAKE.cloud].join("\n"),
  });
  const r = guard(["scan-keys", join(d, "transcript.log"), join(d, "keys")]);
  assert.deepEqual(
    r,
    no(
      1,
      [
        "key-shaped strings (values not shown):",
        `${d}/transcript.log:2: secret-named assignment`,
        `${d}/transcript.log:3: access key id`,
        `${d}/transcript.log:4: sk- api key`,
        `${d}/keys/id:1: private key block`,
        `${d}/keys/id:2: git host token`,
        `${d}/keys/id:3: chat bot token`,
        `${d}/keys/id:4: cloud api key`,
      ].join("\n"),
    ),
  );
  for (const v of Object.values(FAKE)) assert.ok(!r.stderr.includes(v));
});

test("precommit: a clean staged change passes; a staged fake key is refused without its value", () => {
  const d = repo("pc", { "README.md": "x\n" });
  writeTree(d, { "notes.md": "fine\n" });
  git(d, "add", "notes.md");
  assert.deepEqual(
    guard(["precommit"], d),
    ok("no key-shaped strings in 1 files"),
  );
  writeTree(d, { "run.log": `env dump\n${FAKE.dump}\n` });
  git(d, "add", "run.log");
  // The working copy is cleaned, the INDEX still holds the key: the index is what commits.
  writeTree(d, { "run.log": "env dump\n" });
  const r = guard(["precommit"], d);
  assert.deepEqual(
    r,
    no(
      1,
      "key-shaped strings (values not shown):\nrun.log:2: secret-named assignment",
    ),
  );
  assert.ok(!r.stderr.includes(FAKE.dump.split("=")[1] ?? "?"));
});

test("precommit: a staged run folder without its completion record is refused; a finished one passes", () => {
  const d = repo("pc-runs", { "README.md": "x\n" });
  writeTree(d, {
    "runs/c1/transcript.txt": "t\n",
    "runs/c1/done.json": "{}\n",
    "runs/c2/transcript.txt": "half\n",
    "runs/index.md": "list\n",
  });
  git(d, "add", "runs");
  assert.deepEqual(
    guard(["precommit", "--runs", "runs/"], d),
    no(
      1,
      "run folders without done.json are staged (commit only finished runs):\nruns/c2",
    ),
  );
  git(d, "rm", "-q", "--cached", "runs/c2/transcript.txt");
  assert.deepEqual(
    guard(["precommit", "--runs", "runs"], d),
    ok("no key-shaped strings in 3 files"),
  );
});

test("precommit: outside a repository it says so", () => {
  const d = writeTree(join(WORK, "pc-none"), { "x.txt": "x" });
  const r = guard(["precommit"], d);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^grid-guard: git rev-parse: fatal: not a git repository/,
  );
});
