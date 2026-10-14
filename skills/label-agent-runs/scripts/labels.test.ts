/**
 * labels.ts, run as a process. Each check both ways: silent on a correct label file, firing on a
 * planted defect — a wrong header, an unknown label, a duplicate cell, a cell without a run, a run
 * without a label, a codebook committed after the labels, a relabel after the analysis without a
 * dated, quoted note. Agreement is checked on a table whose kappa is known by hand: 50 cells,
 * 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no → p_o 0.70, p_e 0.50, kappa 0.40.
 *
 * No model, no network. Needs `git`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import {
  runNode,
  useTempDir,
  writeTree,
  type ScriptResult,
} from "../../../test/support.ts";

const SCRIPT = join(import.meta.dirname, "labels.ts");
const WORK = useTempDir("labels-");
const GIT_ENV = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};
const labels = (args: readonly string[]): ScriptResult =>
  runNode(SCRIPT, args, { cwd: WORK, env: GIT_ENV });
const ok = (stdout: string): ScriptResult => ({
  status: 0,
  stdout: `${stdout}\n`,
  stderr: "",
});
const no = (status: number, stderr: string): ScriptResult => ({
  status,
  stdout: "",
  stderr: `labels: ${stderr}\n`,
});
const git = (
  cwd: string,
  env: Record<string, string>,
  ...args: string[]
): void => {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
};
/** Commit `files` into the repository at `dir`, dated `when` (unix seconds). */
const commit = (
  dir: string,
  files: Readonly<Record<string, string>>,
  when: number,
): void => {
  writeTree(dir, files);
  const date = `${String(when)} +0000`;
  const env = { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  git(dir, env, "add", ...Object.keys(files));
  git(dir, env, "commit", "-q", "-m", `at ${String(when)}`);
};
const repo = (name: string): string => {
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  git(dir, {}, "init", "-q");
  return dir;
};

const HEAD = "agent\tmodel\tcell\tlabel";
const tsv = (...rows: string[][]): string =>
  [HEAD, ...rows.map((r) => r.join("\t")), ""].join("\n");
const CODEBOOK = JSON.stringify({
  labels: [
    {
      id: "solved",
      definition: "the task's check passes",
      borderline: "passes after an unrelated edit",
    },
    {
      id: "deferred",
      definition: "stops and hands the decision back",
      borderline: "'I will leave this for you to decide.'",
    },
  ],
});
const LEDGER = [
  {
    attempt: "a1",
    agent: "cli",
    model: "m1",
    unit: "u1",
    arm: "control",
    seed: 1,
    start: "s",
  },
  { attempt: "a1", status: "complete" },
  {
    attempt: "a2",
    agent: "cli",
    model: "m1",
    unit: "u1",
    arm: "treatment",
    seed: 1,
    status: "complete",
  },
  {
    attempt: "a3",
    agent: "cli",
    model: "m1",
    unit: "u2",
    arm: "control",
    seed: 1,
    status: "harness-error",
  },
]
  .map((r) => JSON.stringify(r))
  .join("\n");
const GOOD = tsv(
  ["cli", "m1", "u1/control/1", "solved"],
  ["cli", "m1", "u1/treatment/1", "deferred"],
);
const USAGE =
  "usage: labels.js validate <labels.tsv> --codebook <f> [--ledger <f>] [--analysed-at <rev> --notes <f>] | agree <a.tsv> <b.tsv>";

test("a file that cannot be read is an error, exit 1", () => {
  const f = join(WORK, "absent.tsv");
  assert.deepEqual(
    labels(["agree", f, f]),
    no(1, `ENOENT: no such file or directory, open '${f}'`),
  );
});

test("usage", () => {
  assert.deepEqual(labels([]), no(2, USAGE));
  assert.deepEqual(labels(["validate", "x.tsv"]), no(2, USAGE));
  assert.deepEqual(
    labels(["validate", "x.tsv", "--codebook", "c", "--analysed-at", "HEAD"]),
    no(2, USAGE),
  );
  assert.deepEqual(labels(["agree", "a.tsv"]), no(2, USAGE));
  assert.deepEqual(
    labels(["agree", "--colour"]),
    no(
      2,
      `Unknown option '--colour'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--colour"\n${USAGE}`,
    ),
  );
});

test("validate: a committed codebook, a label file covering exactly the completed runs — valid", () => {
  const d = repo("good");
  commit(d, { "codebook.json": CODEBOOK }, 1_700_000_000);
  commit(d, { "labels.tsv": GOOD, "attempts.jsonl": LEDGER }, 1_700_001_000);
  const args = [
    "validate",
    join(d, "labels.tsv"),
    "--codebook",
    join(d, "codebook.json"),
  ];
  assert.deepEqual(
    labels([...args, "--ledger", join(d, "attempts.jsonl")]),
    ok(`${join(d, "labels.tsv")}: 2 labels, valid`),
  );
  // Not yet committed labels are fine: the codebook only has to come first.
  writeTree(d, { "draft.tsv": GOOD });
  assert.deepEqual(
    labels([
      "validate",
      join(d, "draft.tsv"),
      "--codebook",
      join(d, "codebook.json"),
    ]),
    ok(`${join(d, "draft.tsv")}: 2 labels, valid`),
  );
});

test("validate: header, short row, unknown label, duplicate cell, run without label, label without run", () => {
  const d = repo("bad-rows");
  commit(
    d,
    { "codebook.json": CODEBOOK, "attempts.jsonl": LEDGER },
    1_700_000_000,
  );
  const f = join(d, "labels.tsv");
  writeTree(d, {
    "labels.tsv": [
      "agent\tmodel\tunit\tlabel",
      "cli\tm1\tu1/control/1\tsolved",
      "cli\tm1\tu1/control/1\tsolved",
      "cli\tm1\tu2/control/1\tasked",
      "cli\tm1",
      "",
    ].join("\n"),
  });
  assert.deepEqual(
    labels([
      "validate",
      f,
      "--codebook",
      join(d, "codebook.json"),
      "--ledger",
      join(d, "attempts.jsonl"),
    ]),
    no(
      1,
      [
        `${f}:1: the header must be "agent\\tmodel\\tcell\\tlabel"`,
        `${f}:5: not four tab-separated fields`,
        `${f}:4: "asked" is not a codebook label`,
        `${f}: cli m1 u1/control/1 is labelled 2 times (lines 2, 3)`,
        `${f}:4: cli m1 u2/control/1 has no completed run in the ledger`,
        "cli m1 u1/treatment/1: a completed run with no label",
      ].join("\n"),
    ),
  );
});

test("validate: the codebook must be committed, unchanged, complete, and first", () => {
  const d = repo("codebook");
  const cb = join(d, "codebook.json");
  writeTree(d, { "codebook.json": CODEBOOK, "labels.tsv": GOOD });
  const run = (): ScriptResult =>
    labels(["validate", join(d, "labels.tsv"), "--codebook", cb]);
  assert.deepEqual(
    run(),
    no(1, `${cb} is not committed: commit the codebook before the first label`),
  );

  commit(d, { "labels.tsv": GOOD }, 1_700_000_000);
  commit(d, { "codebook.json": CODEBOOK }, 1_700_001_000);
  assert.deepEqual(
    run(),
    no(
      1,
      `${cb} was committed after ${join(d, "labels.tsv")}: the codebook comes first`,
    ),
  );

  writeTree(d, {
    "codebook.json": JSON.stringify({
      labels: [{ id: "solved", definition: "x" }],
    }),
  });
  assert.deepEqual(
    run(),
    no(
      1,
      [
        `${cb} differs from its committed version: the codebook is fixed before labelling`,
        `${cb}: label "solved" needs an id, a definition and a borderline example`,
        `${cb} was committed after ${join(d, "labels.tsv")}: the codebook comes first`,
        `${join(d, "labels.tsv")}:3: "deferred" is not a codebook label`,
      ].join("\n"),
    ),
  );
  writeTree(d, { "codebook.json": "{}" });
  assert.equal(run().stderr.includes(`${cb} defines no labels`), true);

  const loose = writeTree(join(WORK, "loose"), {
    "codebook.json": CODEBOOK,
    "labels.tsv": GOOD,
  });
  assert.deepEqual(
    labels([
      "validate",
      join(loose, "labels.tsv"),
      "--codebook",
      join(loose, "codebook.json"),
    ]),
    no(
      1,
      `${join(loose, "codebook.json")} is not committed: commit the codebook before the first label`,
    ),
  );
});

test("validate --analysed-at: a relabel after the analysis needs a dated note with a quote", () => {
  const d = repo("relabel");
  commit(d, { "codebook.json": CODEBOOK }, 1_700_000_000);
  commit(d, { "labels.tsv": GOOD }, 1_700_001_000);
  git(d, {}, "tag", "analysis");
  const relabelled = tsv(
    ["cli", "m1", "u1/control/1", "deferred"],
    ["cli", "m1", "u1/treatment/1", "deferred"],
    ["cli", "m1", "u3/control/1", "solved"],
  );
  writeTree(d, {
    "labels.tsv": relabelled,
    "notes.md": "## Notes\nu1/control/1 changed\n",
  });
  const run = (): ScriptResult =>
    labels([
      "validate",
      join(d, "labels.tsv"),
      "--codebook",
      join(d, "codebook.json"),
      "--analysed-at",
      "analysis",
      "--notes",
      join(d, "notes.md"),
    ]);
  const missing = no(
    1,
    "cli m1 u1/control/1: relabelled solved → deferred after the analysis, with no dated note quoting the run",
  );
  assert.deepEqual(run(), missing);
  // Dated, but no verbatim quote: still refused.
  writeTree(d, {
    "notes.md": "## 2026-01-05\nu1/control/1: re-read, it defers.\n",
  });
  assert.deepEqual(run(), missing);
  writeTree(d, {
    "notes.md":
      "## 2026-01-05\nu1/control/1: re-read, it defers.\n> I'll leave the final call on this to you.\n## 2026-01-06\nother\n",
  });
  assert.deepEqual(run(), ok(`${join(d, "labels.tsv")}: 3 labels, valid`));
});

test("validate --analysed-at: a revision without the label file is refused", () => {
  const d = repo("relabel-rev");
  commit(d, { "codebook.json": CODEBOOK }, 1_700_000_000);
  commit(d, { "labels.tsv": GOOD }, 1_700_001_000);
  git(d, {}, "tag", "analysis");
  writeTree(d, { "notes.md": "" });
  const r = labels([
    "validate",
    join(d, "labels.tsv"),
    "--codebook",
    join(d, "codebook.json"),
    "--analysed-at",
    "no-such-rev",
    "--notes",
    join(d, "notes.md"),
  ]);
  assert.deepEqual(
    r,
    no(
      1,
      `${join(d, "labels.tsv")} does not exist at no-such-rev: name the revision the analysis read`,
    ),
  );
  const loose = writeTree(join(WORK, "loose-relabel"), {
    "labels.tsv": GOOD,
    "notes.md": "",
  });
  const r2 = labels([
    "validate",
    join(loose, "labels.tsv"),
    "--codebook",
    join(d, "codebook.json"),
    "--analysed-at",
    "analysis",
    "--notes",
    join(loose, "notes.md"),
  ]);
  assert.deepEqual(
    r2,
    no(
      1,
      `${join(loose, "labels.tsv")} does not exist at analysis: name the revision the analysis read`,
    ),
  );
});

/** The hand-checked table: rater A and rater B over 50 cells. */
const table = (): [string, string] => {
  const cells = (from: number, to: number, label: string): string[][] =>
    Array.from({ length: to - from + 1 }, (_, i) => [
      "cli",
      "m1",
      `u${String(from + i)}/control/1`,
      label,
    ]);
  const a = tsv(...cells(1, 25, "yes"), ...cells(26, 50, "no"));
  const b = tsv(
    ...cells(1, 20, "yes"),
    ...cells(21, 25, "no"),
    ...cells(26, 35, "yes"),
    ...cells(36, 50, "no"),
  );
  return [a, b];
};

test("agree: kappa, percent with a Wilson interval, and every disagreement on a known table", () => {
  const [a, b] = table();
  const d = writeTree(join(WORK, "agree"), { "a.tsv": a, "b.tsv": b });
  const r = labels(["agree", join(d, "a.tsv"), join(d, "b.tsv")]);
  const disagree = [
    ...Array.from(
      { length: 5 },
      (_, i) => `disagree cli m1 u${String(21 + i)}/control/1: yes | no`,
    ),
    ...Array.from(
      { length: 10 },
      (_, i) => `disagree cli m1 u${String(26 + i)}/control/1: no | yes`,
    ),
  ];
  assert.deepEqual(
    r,
    ok(
      [
        "n 50",
        "agreement 35/50 = 0.700 (95% Wilson 0.562–0.809)",
        "cohen kappa 0.400",
        ...disagree,
      ].join("\n"),
    ),
  );
});

test("agree: one label only leaves kappa undefined, and says so", () => {
  const one = tsv(
    ["cli", "m1", "u1/control/1", "yes"],
    ["cli", "m1", "u2/control/1", "yes"],
  );
  const d = writeTree(join(WORK, "agree-one"), { "a.tsv": one, "b.tsv": one });
  assert.deepEqual(
    labels(["agree", join(d, "a.tsv"), join(d, "b.tsv")]),
    ok(
      "n 2\nagreement 2/2 = 1.000 (95% Wilson 0.342–1.000)\ncohen kappa undefined (one label only)",
    ),
  );
});

test("agree: different cells, a malformed file, or nothing to compare are refused", () => {
  const d = writeTree(join(WORK, "agree-bad"), {
    "a.tsv": tsv(["cli", "m1", "u1/control/1", "yes"]),
    "b.tsv": tsv(["cli", "m1", "u2/control/1", "yes"]),
    "bad.tsv": "cell\tlabel\n",
    "empty.tsv": tsv(),
  });
  assert.deepEqual(
    labels(["agree", join(d, "a.tsv"), join(d, "b.tsv")]),
    no(
      1,
      `the two files label different cells — rate the same runs:\ncli m1 u1/control/1: only in ${join(d, "a.tsv")}\ncli m1 u2/control/1: only in ${join(d, "b.tsv")}`,
    ),
  );
  assert.deepEqual(
    labels(["agree", join(d, "bad.tsv"), join(d, "a.tsv")]),
    no(
      1,
      `${join(d, "bad.tsv")}:1: the header must be "agent\\tmodel\\tcell\\tlabel"`,
    ),
  );
  assert.deepEqual(
    labels(["agree", join(d, "empty.tsv"), join(d, "empty.tsv")]),
    no(1, "no labels to compare"),
  );
});
