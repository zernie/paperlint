/**
 * The git ports over a scripted `RunProcess`: the commands they run and each answer git can give —
 * including each way git can fail to give one. The same ports over a real repository are in
 * `history.test.ts` beside this file.
 */
import { expect, it } from "vitest";
import { exitedWith, scriptedProcess } from "../memory/index.ts";
import { absolutePath } from "../../domain/paths.ts";
import type { Command, ProcessExit } from "../../ports/process.ts";
import { firstCommitsOf, gitHistory } from "./index.ts";

const PAPER = absolutePath("/repo/papers/p");
const FILE = absolutePath("/repo/papers/p/repro/S/decision.md");
const STUDY = absolutePath("/repo/papers/p/repro/S");
const D = "d".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const DATE = "2026-10-16T15:23:00+05:00";

/** HEAD's tree holds the decision, unless a test says otherwise. */
const IN_HEAD = exitedWith("repro/S/decision.md\n");

/**
 * The ports over git answering by its subcommand (`args[2]`, after `-c core.quotepath=false`); the
 * decision in HEAD's tree unless `ls-tree` is answered.
 */
const over = (answers: Readonly<Record<string, ProcessExit>>) => {
  const all: Readonly<Record<string, ProcessExit>> = {
    "ls-tree": IN_HEAD,
    ...answers,
  };
  const run = scriptedProcess(
    (c: Command) => all[String(c.args[2])] ?? exitedWith(""),
  );
  return { git: gitHistory(run, { PATH: "/usr/bin" }), calls: run.calls };
};

it("committed: the last commit and its date when the file is as committed — asked from the paper", () => {
  const { git, calls } = over({ log: exitedWith(`${D}\t${DATE}\n`) });
  // Guards: the answer, and that git runs in the paper's folder with the file's absolute path.
  expect(git.committed(PAPER, FILE)).toEqual({
    kind: "committed",
    commit: D,
    date: DATE,
  });
  expect(calls.map((c) => [c.args, c.cwd])).toEqual([
    [
      [
        "-c",
        "core.quotepath=false",
        "log",
        "-1",
        "--format=%H%x09%cI",
        "--",
        FILE,
      ],
      PAPER,
    ],
    [
      [
        "-c",
        "core.quotepath=false",
        "ls-tree",
        "--name-only",
        "HEAD",
        "--",
        FILE,
      ],
      PAPER,
    ],
    [
      ["-c", "core.quotepath=false", "status", "--porcelain=v1", "--", FILE],
      PAPER,
    ],
  ]);
});

it("committed: a decision whose last commit deleted it is not in HEAD — deleted, never committed", () => {
  // Guards: `log -1` names the deleting commit and the status is clean; only HEAD's tree tells.
  expect([
    over({
      log: exitedWith(`${D}\t${DATE}\n`),
      "ls-tree": exitedWith(""),
    }).git.committed(PAPER, FILE),
    over({
      log: exitedWith(`${D}\t${DATE}\n`),
      "ls-tree": { kind: "spawn-failed", message: "EIO" },
    }).git.committed(PAPER, FILE),
  ]).toEqual([
    { kind: "deleted", commit: D },
    { kind: "unknown", why: "EIO" },
  ]);
});

it("committed: changed since its commit, never committed, or git unable to say at either step", () => {
  // Guards: an edited decision is not the recorded one; a file only on disk records nothing.
  expect([
    over({
      log: exitedWith(`${D}\t${DATE}\n`),
      status: exitedWith(" M decision.md\n"),
    }).git.committed(PAPER, FILE),
    over({ log: exitedWith("") }).git.committed(PAPER, FILE),
    over({ log: { kind: "not-found", file: "git" } }).git.committed(
      PAPER,
      FILE,
    ),
    over({
      log: exitedWith(`${D}\t${DATE}\n`),
      status: { kind: "spawn-failed", message: "EACCES" },
    }).git.committed(PAPER, FILE),
  ]).toEqual([
    { kind: "changed", commit: D },
    { kind: "not-committed" },
    { kind: "unknown", why: "git is not installed" },
    { kind: "unknown", why: "EACCES" },
  ]);
});

it("every way git can fail is a reason, never an answer", () => {
  const ask = (x: ProcessExit) =>
    over({ "rev-parse": x }).git.order(STUDY, FILE);
  // Guards: no git, no repository, a hang, a kill — each named, none read as "no commits".
  expect([
    ask(exitedWith("", 128)),
    ask({
      kind: "exited",
      status: 128,
      stdout: "",
      stderr: "fatal: not a git repository\n",
    }),
    ask({ kind: "timed-out", afterMs: 1, stdout: "", stderr: "" }),
    ask({ kind: "signalled", signal: "SIGTERM", stdout: "", stderr: "" }),
  ]).toEqual([
    { kind: "unknown", why: "git exited 128" },
    { kind: "unknown", why: "fatal: not a git repository" },
    { kind: "unknown", why: "git did not finish (timed-out)" },
    { kind: "unknown", why: "git did not finish (signalled)" },
  ]);
});

it("order: a shallow clone is said, not judged", () => {
  // Guards: in a shallow clone every file starts at the clone — no order can be read.
  expect(
    over({ "rev-parse": exitedWith("true\n") }).git.order(STUDY, FILE),
  ).toEqual({ kind: "shallow" });
});

it("order: each file's first commit against the decision's — after, the same, not after", () => {
  const log = `\x01${D}\t${DATE}\nx.csv\n\x01${A}\t${DATE}\na.csv\nx.csv\n\x01${B}\t${DATE}\nb.csv\n\x01${C}\t${DATE}\nc.csv\n`;
  // The commits that touched the decision and are reachable from each one, as `rev-list` names them.
  const touching: Readonly<Record<string, string>> = {
    [A]: `${D}\n`,
    [B]: "",
    [C]: `${C}\n`,
  };
  // Guards: the decision's own commit is `same`, and so is another that first carries it (a squash);
  // a commit with a decision commit among its strict ancestors is `after`; the rest are `not-after`.
  const result = gitHistory(
    scriptedProcess((c) => {
      const sub = String(c.args[2]);
      if (sub === "rev-parse") return exitedWith("false\n");
      if (sub === "ls-tree") return IN_HEAD;
      if (sub === "log" && c.args.includes("--reverse")) return exitedWith(log);
      if (sub === "log") return exitedWith(`${A}\t${DATE}\n${D}\t${DATE}\n`);
      return exitedWith(touching[String(c.args[4])] ?? "");
    }),
    {},
  ).order(STUDY, FILE);
  expect(result).toEqual({
    kind: "read",
    decision: { commit: D, date: DATE },
    decisionDeleted: false,
    files: [
      { path: "x.csv", commit: D, date: DATE, order: "same" },
      { path: "a.csv", commit: A, date: DATE, order: "after" },
      { path: "b.csv", commit: B, date: DATE, order: "not-after" },
      { path: "c.csv", commit: C, date: DATE, order: "same" },
    ],
  });
});

it("order: no decision commit makes every file not-after; a failed ancestry question is a reason", () => {
  const log = `\x01${A}\t${DATE}\na.csv\n`;
  const answer = (revList: ProcessExit, decisionLog: string) =>
    gitHistory(
      scriptedProcess((c) => {
        const sub = String(c.args[2]);
        if (sub === "rev-parse") return exitedWith("false\n");
        if (sub === "ls-tree") return IN_HEAD;
        if (sub === "log" && c.args.includes("--reverse"))
          return exitedWith(log);
        if (sub === "log") return exitedWith(decisionLog);
        return revList;
      }),
      {},
    ).order(STUDY, FILE);
  // Guards: an uncommitted decision orders nothing; git failing mid-way is not "not after".
  expect(answer(exitedWith(""), "")).toEqual({
    kind: "read",
    decision: null,
    decisionDeleted: false,
    files: [{ path: "a.csv", commit: A, date: DATE, order: "not-after" }],
  });
  expect(
    answer(
      {
        kind: "exited",
        status: 128,
        stdout: "",
        stderr: "fatal: bad object\n",
      },
      `${D}\t${DATE}\n`,
    ),
  ).toEqual({ kind: "unknown", why: "fatal: bad object" });
});

it("order: git failing on the decision's log or the folder's log is a reason", () => {
  const fail = {
    kind: "exited",
    status: 128,
    stdout: "",
    stderr: "fatal: x\n",
  } as const;
  const answer = (decision: ProcessExit, folder: ProcessExit) =>
    gitHistory(
      scriptedProcess((c) => {
        const sub = String(c.args[2]);
        if (sub === "rev-parse") return exitedWith("false\n");
        return c.args.includes("--reverse") ? folder : decision;
      }),
      {},
    ).order(STUDY, FILE);
  // Guards: each step's failure surfaces.
  expect([answer(fail, exitedWith("")), answer(exitedWith(""), fail)]).toEqual([
    { kind: "unknown", why: "fatal: x" },
    { kind: "unknown", why: "fatal: x" },
  ]);
});

it("order: a decision not in HEAD is said deleted; git failing on HEAD's tree is a reason", () => {
  const answer = (lsTree: ProcessExit) =>
    gitHistory(
      scriptedProcess((c) => {
        const sub = String(c.args[2]);
        if (sub === "rev-parse") return exitedWith("false\n");
        if (sub === "ls-tree") return lsTree;
        if (c.args.includes("--reverse"))
          return exitedWith(`\x01${D}\t${DATE}\ndecision.md\n`);
        return exitedWith(`${D}\t${DATE}\n`);
      }),
      {},
    ).order(STUDY, FILE);
  // Guards: the decision's first commit is still read, and its absence from HEAD is carried with it.
  expect([
    answer(exitedWith("")),
    answer({ kind: "spawn-failed", message: "EIO" }),
  ]).toEqual([
    {
      kind: "read",
      decision: { commit: D, date: DATE },
      decisionDeleted: true,
      files: [{ path: "decision.md", commit: D, date: DATE, order: "same" }],
    },
    { kind: "unknown", why: "EIO" },
  ]);
});

it("firstCommitsOf keeps each path's first commit and skips blank lines", () => {
  // Guards: the reverse log is read oldest first; a later commit of a path does not move it.
  expect([
    ...firstCommitsOf(`\x01${A}\t${DATE}\na\n\n\x01${B}\t${DATE}\na\nb\n`),
  ]).toEqual([
    ["a", { commit: A, date: DATE }],
    ["b", { commit: B, date: DATE }],
  ]);
});
