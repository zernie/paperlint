/**
 * The git ports over the git CLI, through `RunProcess`. Run from a folder of the paper (which exists),
 * with absolute pathspecs, so it answers for whichever repository holds the paper.
 *
 *   committed   the last commit that touched a file (`git log -1`), and whether the file changed since
 *               (`git status --porcelain`)
 *   order       whether the clone is shallow; the decision file's first commit; every file's first
 *               commit under the study's folder (`git log --reverse --name-only`); and for each, whether
 *               the decision's first commit is its strict ancestor (`git merge-base --is-ancestor`)
 */
import type { AbsolutePath } from "../../domain/paths.ts";
import type {
  CommitAt,
  Committed,
  FirstCommit,
  GitHistory,
  GitOrder,
  Order,
  OrderFacts,
} from "../../ports/git-history.ts";
import type { ProcessExit, RunProcess } from "../../ports/process.ts";

const TIMEOUT_MS = 60_000;

/** git's stdout, or why it gave none; `allowed` lists the exit statuses that are answers. */
const stdoutOf = (
  x: ProcessExit,
  allowed: readonly number[] = [0],
):
  | { readonly out: string; readonly status: number }
  | { readonly why: string } => {
  switch (x.kind) {
    case "exited":
      return allowed.includes(x.status)
        ? { out: x.stdout, status: x.status }
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

/** git, run through `run` in `cwd` with `env` as its whole environment. */
const gitIn =
  (run: RunProcess, env: Readonly<Record<string, string>>) =>
  (cwd: AbsolutePath, args: readonly string[], allowed?: readonly number[]) =>
    stdoutOf(
      run.run({
        file: "git",
        args: ["-c", "core.quotepath=false", ...args],
        env,
        timeoutMs: TIMEOUT_MS,
        cwd,
        maxOutputBytes: 64 * 1024 * 1024,
      }),
      allowed,
    );

/** `<sha>\t<date>` as a commit. */
const commitAt = (line: string): CommitAt => {
  const parts = line.split("\t");
  return { commit: nth(parts, 0), date: nth(parts, 1) };
};

/** The `i`th of `parts`, "" when there are fewer. */
const nth = (parts: readonly string[], i: number): string =>
  parts.slice(i, i + 1).join("");

/**
 * The first commit of each path in `git log --reverse --format=%x01%H%x09%cI --name-only` output:
 * a line starting with \x01 opens a commit, the lines after it name its files.
 */
export const firstCommitsOf = (log: string): ReadonlyMap<string, CommitAt> =>
  log
    .split("\x01")
    .slice(1)
    .reduce((seen, block) => {
      const lines = block.split("\n");
      const at = commitAt(nth(lines, 0));
      const names = lines.slice(1);
      return names
        .filter((n) => n !== "" && !seen.has(n))
        .reduce((m, n) => new Map([...m, [n, at]]), seen);
    }, new Map<string, CommitAt>());

/** The committed state of files. */
export function gitHistory(
  run: RunProcess,
  env: Readonly<Record<string, string>>,
): GitHistory & GitOrder {
  const git = gitIn(run, env);
  return {
    committed: (paper, file): Committed => {
      const log = git(paper, ["log", "-1", "--format=%H%x09%cI", "--", file]);
      if ("why" in log) return { kind: "unknown", why: log.why };
      const { commit, date } = commitAt(log.out.trim());
      if (commit === "") return { kind: "not-committed" };
      const status = git(paper, ["status", "--porcelain=v1", "--", file]);
      if ("why" in status) return { kind: "unknown", why: status.why };
      return status.out.trim() === ""
        ? { kind: "committed", commit, date }
        : { kind: "changed", commit };
    },
    order: (studyDir, decision) => orderIn(git, studyDir, decision),
  };
}

type Git = ReturnType<typeof gitIn>;

/** The order facts of the study in `studyDir`, decided by `decision`. */
function orderIn(
  git: Git,
  studyDir: AbsolutePath,
  decision: AbsolutePath,
): OrderFacts {
  const shallow = git(studyDir, ["rev-parse", "--is-shallow-repository"]);
  if ("why" in shallow) return { kind: "unknown", why: shallow.why };
  if (shallow.out.trim() === "true") return { kind: "shallow" };
  const d = git(studyDir, ["log", "--format=%H%x09%cI", "--", decision]);
  if ("why" in d) return { kind: "unknown", why: d.why };
  const lines = d.out.trim().split("\n");
  const first = commitAt(nth(lines, lines.length - 1));
  const files = git(studyDir, [
    "log",
    "--reverse",
    "--format=%x01%H%x09%cI",
    "--name-only",
    "--relative",
    "--",
    ".",
  ]);
  if ("why" in files) return { kind: "unknown", why: files.why };
  const at = first.commit === "" ? null : first;
  const ordered = ordersOf(git, studyDir, at, firstCommitsOf(files.out));
  return "why" in ordered
    ? { kind: "unknown", why: ordered.why }
    : { kind: "read", decision: at, files: ordered.files };
}

/** git's answer for one commit: its order, or why git could not say. */
type Answer =
  | { readonly commit: string; readonly order: Order }
  | { readonly commit: string; readonly why: string };
const isFailed = (
  a: Answer,
): a is { readonly commit: string; readonly why: string } => "why" in a;
const isOrdered = (
  a: Answer,
): a is { readonly commit: string; readonly order: Order } => "order" in a;

/** The order of `commit` against `decision`'s first commit. */
const answerFor = (
  git: Git,
  cwd: AbsolutePath,
  decision: CommitAt | null,
  commit: string,
): Answer => {
  if (decision === null) return { commit, order: "not-after" };
  if (commit === decision.commit) return { commit, order: "same" };
  const a = git(
    cwd,
    ["merge-base", "--is-ancestor", decision.commit, commit],
    [0, 1],
  );
  if ("why" in a) return { commit, why: a.why };
  return { commit, order: a.status === 0 ? "after" : "not-after" };
};

/** Each file's first commit with its order against `decision`'s; git asked once per distinct commit. */
function ordersOf(
  git: Git,
  cwd: AbsolutePath,
  decision: CommitAt | null,
  firsts: ReadonlyMap<string, CommitAt>,
): { readonly files: readonly FirstCommit[] } | { readonly why: string } {
  const answers = [...new Set([...firsts.values()].map((c) => c.commit))].map(
    (c) => answerFor(git, cwd, decision, c),
  );
  const failed = answers.find(isFailed);
  if (failed !== undefined) return { why: failed.why };
  return {
    files: answers
      .filter(isOrdered)
      .flatMap(({ commit, order }) =>
        [...firsts]
          .filter(([, c]) => c.commit === commit)
          .map(([path, c]) => ({ path, ...c, order })),
      ),
  };
}
