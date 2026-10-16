/**
 * A real git repository in a scratch directory, for the tests that read history: commits made with a
 * fixed author and a date the test chooses, so the order is the test's and not the clock's.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** git in `dir`, its exit status checked: a test's setup that fails is a failed test. */
export const git = (
  dir: string,
  args: readonly string[],
  date = "2026-10-16T10:00:00+05:00",
): string => {
  const r = spawnSync("git", [...args], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.org",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.org",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: dir,
    },
  });
  if (r.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
};

/** A new repository at `dir`, on branch main. */
export const initRepo = (dir: string): void => {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
};

/** Write `files` (relative to `dir`; null removes one) and commit them at `date`; the new commit's sha. */
export const commit = (
  dir: string,
  files: Readonly<Record<string, string | null>>,
  date: string,
  message = "c",
): string => {
  Object.entries(files).forEach(([rel, body]) => {
    const p = join(dir, rel);
    if (body === null) rmSync(p, { force: true });
    else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
  });
  git(dir, ["add", "-A", "."], date);
  git(dir, ["commit", "-q", "--allow-empty", "-m", message], date);
  return git(dir, ["rev-parse", "HEAD"], date).trim();
};
