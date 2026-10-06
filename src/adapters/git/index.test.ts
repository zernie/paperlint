/**
 * Whether a file is committed — asked of git's index through the process port: scripted answers for
 * every exit, then one real repository.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { exitedWith, scriptedProcess } from "../memory/index.ts";
import { spawnProcess } from "../node/index.ts";
import { gitCommitted } from "./index.ts";

const ENV = { PATH: process.env.PATH ?? "" };
const FILE = absolutePath("/repo/papers/p/refs.bib");

describe("gitCommitted — scripted", () => {
  it("asks `git ls-files --error-unmatch` in the file's directory, about that file only, with the variables that are set", () => {
    const run = scriptedProcess(() => exitedWith(""));
    expect(
      gitCommitted(run, { ...ENV, UNSET: undefined }).isCommitted(FILE),
    ).toBe(true);
    expect(run.calls.map((c) => [c.file, c.args, c.env])).toEqual([
      [
        "git",
        [
          "-C",
          "/repo/papers/p",
          "ls-files",
          "--error-unmatch",
          "--",
          "refs.bib",
        ],
        ENV,
      ],
    ]);
  });

  it("git's own variables are not passed on: GIT_DIR=.git (a git hook's) would point git elsewhere", () => {
    const run = scriptedProcess(() => exitedWith(""));
    gitCommitted(run, {
      ...ENV,
      GIT_DIR: ".git",
      GIT_WORK_TREE: "/x",
    }).isCommitted(FILE);
    expect(run.calls.map((c) => c.env)).toEqual([ENV]);
  });

  it("untracked (exit 1) is not committed: a fresh checkout would not have it", () => {
    const run = scriptedProcess(() => exitedWith("", 1));
    expect(gitCommitted(run, ENV).isCommitted(FILE)).toBe(false);
  });

  it("no work tree, no git, or git failing: the disk is the only state there is — committed", () => {
    for (const exit of [
      exitedWith("", 128),
      { kind: "not-found", file: "git" } as const,
      { kind: "spawn-failed", message: "EACCES" } as const,
    ])
      expect(
        gitCommitted(
          scriptedProcess(() => exit),
          ENV,
        ).isCommitted(FILE),
      ).toBe(true);
  });
});

describe("gitCommitted — a real repository", () => {
  it("a tracked file is committed, an untracked and an ignored one are not, a file outside any repository is", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "git-committed-")));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "git-outside-")));
    try {
      const git = (...args: string[]) =>
        spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      git("init", "-q");
      writeFileSync(join(root, ".gitignore"), "ignored.bib\n");
      for (const f of ["tracked.bib", "untracked.bib", "ignored.bib"])
        writeFileSync(join(root, f), "@misc{a,}\n");
      writeFileSync(join(outside, "loose.bib"), "@misc{a,}\n");
      git("add", "tracked.bib");
      const committed = gitCommitted(spawnProcess(), ENV);
      const ask = (dir: string, f: string) =>
        committed.isCommitted(absolutePath(join(dir, f)));
      expect([
        ask(root, "tracked.bib"),
        ask(root, "untracked.bib"),
        ask(root, "ignored.bib"),
        ask(outside, "loose.bib"),
      ]).toEqual([true, false, false, true]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
