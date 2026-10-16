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
const DATE = "2026-10-16T15:23:00+05:00";

/** The ports over git answering by its subcommand (`args[2]`, after `-c core.quotepath=false`). */
const over = (answers: Readonly<Record<string, ProcessExit>>) => {
  const run = scriptedProcess(
    (c: Command) => answers[String(c.args[2])] ?? exitedWith(""),
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
      ["-c", "core.quotepath=false", "status", "--porcelain=v1", "--", FILE],
      PAPER,
    ],
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
  const log = `\x01${D}\t${DATE}\nx.csv\n\x01${A}\t${DATE}\na.csv\nx.csv\n\x01${B}\t${DATE}\nb.csv\n`;
  // Guards: the decision's own commit is `same`; the others are ordered by ancestry.
  const result = gitHistory(
    scriptedProcess((c) => {
      const sub = String(c.args[2]);
      if (sub === "rev-parse") return exitedWith("false\n");
      if (sub === "log" && c.args.includes("--reverse")) return exitedWith(log);
      if (sub === "log") return exitedWith(`${A}\t${DATE}\n${D}\t${DATE}\n`);
      return exitedWith("", String(c.args[5]) === A ? 0 : 1);
    }),
    {},
  ).order(STUDY, FILE);
  expect(result).toEqual({
    kind: "read",
    decision: { commit: D, date: DATE },
    files: [
      { path: "x.csv", commit: D, date: DATE, order: "same" },
      { path: "a.csv", commit: A, date: DATE, order: "after" },
      { path: "b.csv", commit: B, date: DATE, order: "not-after" },
    ],
  });
});

it("order: no decision commit makes every file not-after; a failed ancestry question is a reason", () => {
  const log = `\x01${A}\t${DATE}\na.csv\n`;
  const answer = (mergeBase: ProcessExit, decisionLog: string) =>
    gitHistory(
      scriptedProcess((c) => {
        const sub = String(c.args[2]);
        if (sub === "rev-parse") return exitedWith("false\n");
        if (sub === "log" && c.args.includes("--reverse"))
          return exitedWith(log);
        if (sub === "log") return exitedWith(decisionLog);
        return mergeBase;
      }),
      {},
    ).order(STUDY, FILE);
  // Guards: an uncommitted decision orders nothing; git failing mid-way is not "not after".
  expect(answer(exitedWith(""), "")).toEqual({
    kind: "read",
    decision: null,
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

it("firstCommitsOf keeps each path's first commit and skips blank lines", () => {
  // Guards: the reverse log is read oldest first; a later commit of a path does not move it.
  expect([
    ...firstCommitsOf(`\x01${A}\t${DATE}\na\n\n\x01${B}\t${DATE}\na\nb\n`),
  ]).toEqual([
    ["a", { commit: A, date: DATE }],
    ["b", { commit: B, date: DATE }],
  ]);
});
