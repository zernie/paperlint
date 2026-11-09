/**
 * The git ports over a scripted `RunProcess`: the commands they run and each answer git can give —
 * including each way git can fail to give one. The same ports over a real repository are in
 * `history.test.ts` beside this file.
 */
import { expect, it } from "vitest";
import { exitedWith, scriptedProcess } from "../memory/index.ts";
import { absolutePath } from "../../domain/paths.ts";
import type { Command, ProcessExit } from "../../ports/process.ts";
import { firstCommitsOf, gitHistory, touchingOf } from "./index.ts";

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

/** The paper's tables as the five git processes print them, each replaceable by a test. */
const PAPER_KEY = "papers/p/repro/S/decision.md";
const TABLES: Readonly<Record<string, ProcessExit>> = {
  where: exitedWith("false\npapers/p/\n"),
  // The decision: first in D, copied by a squash onto another line of history in C.
  touched: exitedWith(
    `\x01${D}\t${DATE}\n${PAPER_KEY}\n\x01${C}\t${DATE}\n${PAPER_KEY}\n\x01${C}\t${DATE}\n${PAPER_KEY}\n`,
  ),
  head: exitedWith(`${PAPER_KEY}\n`),
  files: exitedWith(
    `\x01${D}\t${DATE}\nrepro/S/x.csv\nrepro/T/other.csv\n\x01${A}\t${DATE}\nrepro/S/a.csv\nrepro/S/x.csv\n\x01${B}\t${DATE}\nrepro/S/b.csv\n\x01${C}\t${DATE}\nrepro/S/c.csv\n`,
  ),
  // B and C are roots, A descends from D.
  graph: exitedWith(`${B} \n${D} \n${A} ${D}\n${C} \n`),
};

/** The ports over git printing `tables` (by what each process is: its subcommand and flags). */
const paperOver = (tables: Readonly<Record<string, ProcessExit>>) => {
  const all = { ...TABLES, ...tables };
  const run = scriptedProcess((c: Command) => {
    const sub = String(c.args[2]);
    if (sub === "rev-parse") return all["where"] ?? exitedWith("");
    if (sub === "ls-tree") return all["head"] ?? exitedWith("");
    if (c.args.includes("--parents")) return all["graph"] ?? exitedWith("");
    return (
      (c.args.includes("-m") ? all["touched"] : all["files"]) ?? exitedWith("")
    );
  });
  return { git: gitHistory(run, {}), calls: run.calls };
};

it("paper: five git processes, whatever the number of studies, each from the paper's folder", () => {
  const { git, calls } = paperOver({});
  const other = absolutePath("/repo/papers/p/repro/T/decision.md");
  const p = git.paper(PAPER, [FILE, other]);
  p.order(STUDY, FILE);
  p.order(absolutePath("/repo/papers/p/repro/T"), other);
  // Guards: asking per study again costs no process, and every process is a single question.
  expect(calls.map((c) => [c.cwd, ...c.args.slice(2)])).toEqual([
    [PAPER, "rev-parse", "--is-shallow-repository", "--show-prefix"],
    [
      PAPER,
      "log",
      "--reverse",
      "--full-history",
      "--no-renames",
      "-m",
      "--format=%x01%H%x09%cI",
      "--name-only",
      "--",
      FILE,
      other,
    ],
    [PAPER, "ls-tree", "--full-name", "--name-only", "HEAD", "--", FILE, other],
    [
      PAPER,
      "log",
      "--reverse",
      "--full-history",
      "--no-renames",
      "--format=%x01%H%x09%cI",
      "--name-only",
      "--relative",
      "--",
      "/repo/papers/p/repro",
    ],
    [
      PAPER,
      "log",
      "--full-history",
      "--no-renames",
      "--topo-order",
      "--reverse",
      "--parents",
      "--format=%H %P",
      "--",
      "/repo/papers/p/repro",
      FILE,
      other,
    ],
  ]);
});

it("paper: no decision asked, no process and no claim", () => {
  const { git, calls } = paperOver({});
  // Guards: a paper with no decide-first study costs git nothing.
  expect([git.paper(PAPER, []).order(STUDY, FILE), calls]).toEqual([
    { kind: "read", decision: null, decisionDeleted: false, files: [] },
    [],
  ]);
});

it("order: each file's first commit against the decision's — after, the same, not after — only the study's own files", () => {
  const { git } = paperOver({});
  // Guards: the decision's own commit and one that first carries it again (a squash) are `same`, a
  // descendant of a decision commit is `after`, the rest `not-after`; the other study's file is not listed.
  expect(git.paper(PAPER, [FILE]).order(STUDY, FILE)).toEqual({
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

it("order: a decision never committed makes every file not-after; one not in HEAD is said deleted", () => {
  const never = paperOver({ touched: exitedWith("") }).git.paper(PAPER, [FILE]);
  const gone = paperOver({ head: exitedWith("") }).git.paper(PAPER, [FILE]);
  // Guards: an uncommitted decision orders nothing; a committed, since deleted one still orders.
  expect([never.order(STUDY, FILE), gone.order(STUDY, FILE)]).toEqual([
    {
      kind: "read",
      decision: null,
      decisionDeleted: false,
      files: [
        { path: "x.csv", commit: D, date: DATE, order: "not-after" },
        { path: "a.csv", commit: A, date: DATE, order: "not-after" },
        { path: "b.csv", commit: B, date: DATE, order: "not-after" },
        { path: "c.csv", commit: C, date: DATE, order: "not-after" },
      ],
    },
    {
      kind: "read",
      decision: { commit: D, date: DATE },
      decisionDeleted: true,
      files: [
        { path: "x.csv", commit: D, date: DATE, order: "same" },
        { path: "a.csv", commit: A, date: DATE, order: "after" },
        { path: "b.csv", commit: B, date: DATE, order: "not-after" },
        { path: "c.csv", commit: C, date: DATE, order: "same" },
      ],
    },
  ]);
});

it("order: a shallow clone is said, not judged", () => {
  // Guards: in a shallow clone every file starts at the clone — no order can be read.
  expect(
    paperOver({ where: exitedWith("true\n\n") })
      .git.paper(PAPER, [FILE])
      .order(STUDY, FILE),
  ).toEqual({ kind: "shallow" });
});

it("order: a commit git did not list in its graph is a reason, never `not-after`", () => {
  // Guards: the graph lacks A, so A's ancestry is unknown.
  expect(
    paperOver({ graph: exitedWith(`${B} \n${D} \n${C} \n`) })
      .git.paper(PAPER, [FILE])
      .order(STUDY, FILE),
  ).toEqual({
    kind: "unknown",
    why: "git did not list a commit of this paper's history",
  });
});

it("every way git can fail, at any of the five steps, is a reason, never an answer", () => {
  const exit128 = (stderr: string): ProcessExit => ({
    kind: "exited",
    status: 128,
    stdout: "",
    stderr,
  });
  const ask = (step: string, x: ProcessExit) =>
    paperOver({ [step]: x })
      .git.paper(PAPER, [FILE])
      .order(STUDY, FILE);
  // Guards: no git, no repository, a hang, a kill — each named, none read as "no commits".
  expect([
    ask("where", exitedWith("", 128)),
    ask("where", exit128("fatal: not a git repository\n")),
    ask("touched", { kind: "timed-out", afterMs: 1, stdout: "", stderr: "" }),
    ask("head", {
      kind: "signalled",
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    }),
    ask("files", exit128("fatal: x\n")),
    ask("graph", { kind: "spawn-failed", message: "EIO" }),
  ]).toEqual([
    { kind: "unknown", why: "git exited 128" },
    { kind: "unknown", why: "fatal: not a git repository" },
    { kind: "unknown", why: "git did not finish (timed-out)" },
    { kind: "unknown", why: "git did not finish (signalled)" },
    { kind: "unknown", why: "fatal: x" },
    { kind: "unknown", why: "EIO" },
  ]);
});

it("touchingOf lists each path's commits oldest first, a merge printed once per parent only once", () => {
  // Guards: `-m` repeats a merge for each parent it differs from.
  expect([
    ...touchingOf(
      `\x01${A}\t${DATE}\nd\n\x01${B}\t${DATE}\nd\n\x01${B}\t${DATE}\nd\ne\n`,
    ),
  ]).toEqual([
    [
      "d",
      [
        { commit: A, date: DATE },
        { commit: B, date: DATE },
      ],
    ],
    ["e", [{ commit: B, date: DATE }]],
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

it("fileAt: the text at a commit, absent when ls-tree lists nothing, and each failure a reason", () => {
  const fail = {
    kind: "exited",
    status: 128,
    stdout: "",
    stderr: "fatal: bad object\n",
  } as const;
  const { git, calls } = over({
    "ls-tree": exitedWith("plan.json\n"),
    show: exitedWith('{"question": "q"}\n'),
  });
  const text = git.fileAt(STUDY, A, "plan.json");
  const at = (lsTree: ProcessExit, show: ProcessExit = exitedWith("")) =>
    over({ "ls-tree": lsTree, show }).git.fileAt(STUDY, A, "plan.json");
  // Guards: the commands, from the study's folder; and every answer git can give.
  expect([
    calls.map((c) => [c.cwd, ...c.args.slice(2)]),
    text,
    at(exitedWith("")),
    at(fail),
    at(exitedWith("plan.json\n"), fail),
  ]).toEqual([
    [
      [STUDY, "ls-tree", "--name-only", A, "--", "plan.json"],
      [STUDY, "show", `${A}:./plan.json`],
    ],
    { kind: "text", text: '{"question": "q"}\n' },
    { kind: "absent" },
    { kind: "unknown", why: "fatal: bad object" },
    { kind: "unknown", why: "fatal: bad object" },
  ]);
});
