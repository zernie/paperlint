/**
 * `GitHistory` over the git CLI, through `RunProcess`: the last commit that touched a file
 * (`git log -1`), and whether the file has changed since (`git status --porcelain`). Run in the
 * file's own directory, so it answers for whichever repository holds the file.
 */
import { basename, dirname } from "node:path";
import { absolutePath } from "../../domain/paths.ts";
import type { Committed, GitHistory } from "../../ports/git-history.ts";
import type { ProcessExit, RunProcess } from "../../ports/process.ts";

const TIMEOUT_MS = 30_000;

/** git's stdout, or why it gave none. */
const stdoutOf = (
  x: ProcessExit,
): { readonly out: string } | { readonly why: string } => {
  switch (x.kind) {
    case "exited":
      return x.status === 0
        ? { out: x.stdout }
        : { why: x.stderr.trim() || `git exited ${String(x.status)}` };
    case "not-found":
      return { why: "git is not installed" };
    case "spawn-failed":
      return { why: x.message };
    case "signalled":
    case "timed-out":
      return { why: `git did not finish (${x.kind})` };
  }
};

/** git, run through `run` with `env` as its whole environment. */
export function gitHistory(
  run: RunProcess,
  env: Readonly<Record<string, string>>,
): GitHistory {
  return {
    committed: (file): Committed => {
      const git = (args: readonly string[]) =>
        stdoutOf(
          run.run({
            file: "git",
            args: [...args, "--", basename(file)],
            env,
            timeoutMs: TIMEOUT_MS,
            cwd: absolutePath(dirname(file)),
          }),
        );
      const log = git(["log", "-1", "--format=%H%n%cI"]);
      if ("why" in log) return { kind: "unknown", why: log.why };
      const [commit = "", date = ""] = log.out.trim().split("\n");
      if (commit === "") return { kind: "not-committed" };
      const status = git(["status", "--porcelain=v1", "--ignored=no"]);
      if ("why" in status) return { kind: "unknown", why: status.why };
      return status.out.trim() === ""
        ? { kind: "committed", commit, date }
        : { kind: "changed", commit };
    },
  };
}
