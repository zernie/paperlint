/**
 * The git `GitHistory` over a scripted `RunProcess`: the commands it runs, in the file's own
 * directory, and each answer — committed, changed, not committed, or git unable to say. The real git
 * runs in test/e2e/age/.
 */
import { describe, expect, it } from "vitest";
import { exitedWith, scriptedProcess } from "../memory/index.ts";
import { absolutePath } from "../../domain/paths.ts";
import type { ProcessExit } from "../../ports/process.ts";
import { gitHistory } from "./index.ts";

const FILE = absolutePath("/repo/papers/p/repro/S/exclusions.md");
const SHA = "f".repeat(40);
const DATE = "2026-10-16T15:23:00+05:00";

/** git answering `log` then `status` with these exits; what it was asked. */
const ask = (log: ProcessExit, status: ProcessExit = exitedWith("")) => {
  const run = scriptedProcess((c) => (c.args[0] === "log" ? log : status));
  return {
    answer: gitHistory(run, { PATH: "/usr/bin" }).committed(FILE),
    calls: run.calls,
  };
};

describe("committed", () => {
  it("the last commit and its date, when the file is as committed — asked in the file's directory", () => {
    const { answer, calls } = ask(exitedWith(`${SHA}\n${DATE}\n`));
    // Guards: the answer, and that git runs where the file is, naming only the file.
    expect(answer).toEqual({ kind: "committed", commit: SHA, date: DATE });
    expect(calls.map((c) => [c.args, c.cwd])).toEqual([
      [
        ["log", "-1", "--format=%H%n%cI", "--", "exclusions.md"],
        "/repo/papers/p/repro/S",
      ],
      [
        ["status", "--porcelain=v1", "--ignored=no", "--", "exclusions.md"],
        "/repo/papers/p/repro/S",
      ],
    ]);
  });

  it("changed since its commit, and never committed", () => {
    // Guards: an edited decision is not the recorded one; a file only on disk records nothing.
    expect(
      ask(exitedWith(`${SHA}\n${DATE}\n`), exitedWith(" M exclusions.md\n"))
        .answer,
    ).toEqual({
      kind: "changed",
      commit: SHA,
    });
    expect(ask(exitedWith("")).answer).toEqual({ kind: "not-committed" });
  });

  it("git unable to answer, in each way, at either step", () => {
    // Guards: no git, no repository, a hang — each a reason, never "not committed".
    expect([
      ask({ kind: "not-found", file: "git" }).answer,
      ask(exitedWith("", 128)).answer,
      ask({
        kind: "exited",
        status: 128,
        stdout: "",
        stderr: "fatal: not a git repository\n",
      }).answer,
      ask({ kind: "spawn-failed", message: "EACCES" }).answer,
      ask({ kind: "timed-out", afterMs: 1, stdout: "", stderr: "" }).answer,
      ask(exitedWith(`${SHA}\n${DATE}\n`), {
        kind: "signalled",
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      }).answer,
    ]).toEqual([
      { kind: "unknown", why: "git is not installed" },
      { kind: "unknown", why: "git exited 128" },
      { kind: "unknown", why: "fatal: not a git repository" },
      { kind: "unknown", why: "EACCES" },
      { kind: "unknown", why: "git did not finish (timed-out)" },
      { kind: "unknown", why: "git did not finish (signalled)" },
    ]);
  });
});
