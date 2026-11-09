/**
 * The git ports over the git CLI, through `RunProcess`. Run from a folder of the paper (which exists),
 * with absolute pathspecs, so it answers for whichever repository holds the paper.
 *
 *   committed   the last commit that touched a file (`git log -1`), and whether the file changed since
 *               (`git status --porcelain`)
 *   paper       the order facts of ALL of a paper's decide-first studies, from five git processes
 *               whatever their number (below)
 *   fileAt      a file under the study's folder as it stood at a commit (`git ls-tree`, then `git show`)
 *
 * ── ONE QUERY PER PAPER, NOT PER STUDY ─────────────────────────────────────────
 * `repro/outputs-before-decision` used to ask git, per study: whether the clone is shallow, the
 * decision's `git log --full-history`, HEAD's tree, the study folder's `git log --name-only`, and one
 * `git rev-list --full-history <commit> -- <decision>` per distinct output commit. Every
 * `--full-history` call with a path walks the whole history of the repository. On a real paper with
 * about 115 studies that was ~110 walks and 50 s of a 70 s lint (89%); a spawn costs ~5 ms, the walks
 * are the cost. Now, per paper:
 *
 *   1. `rev-parse --is-shallow-repository --show-prefix`   shallow (then nothing is read) and where the paper sits
 *   2. `log --reverse --full-history -m --name-only`       over the decision files: every commit that touched each
 *   3. `ls-tree HEAD`                                       over the decision files: which are still in HEAD
 *   4. `log --reverse --full-history --name-only`          over `<paper>/repro`: the first commit of every path
 *   5. `log --full-history --parents`                       over both: the graph, whose ancestry `ancestry.ts` reads
 *
 * and each study's facts are read from those tables in memory.
 *
 * The invariant that keeps the findings identical to the per-study queries:
 *   - a path's first commit is the first commit that lists it, oldest first; a study's files are the
 *     paths under its folder, in the order the folder's own log listed them;
 *   - a decision's commits are those `git rev-list --full-history -- <decision>` names, which includes
 *     a merge that differs from any one parent — `-m --no-renames` lists exactly those, a plain
 *     `--name-only` prints nothing for a merge;
 *   - "after" means ANY commit that touched the decision is a strict ancestor of the output's first
 *     commit (a squash can copy the decision onto another line of history), the same when the output's
 *     first commit is one of them, and ancestry is the question `rev-list` answered, read from the
 *     parents-rewritten graph of the listed commits;
 *   - a commit git did not list where the tables need it is "unknown", never "not after".
 * Renames are not detected (`--no-renames`): a path's first commit lists its new name either way, so
 * the first commit does not depend on them, and the detection costs a walk of its own.
 */
import { relative } from "node:path";
import { filter, groupBy, map, pipe, uniqueBy } from "remeda";
import type { AbsolutePath } from "../../domain/paths.ts";
import { REPRO_DIR } from "../../domain/repro-layout.ts";
import type {
  CommitAt,
  Committed,
  FileAt,
  FirstCommit,
  GitHistory,
  GitOrder,
  Order,
  OrderFacts,
  PaperOrder,
} from "../../ports/git-history.ts";
import { ancestryOf, orderAmong, type Ancestry } from "./ancestry.ts";
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

/** Every (path, commit) pair of `git log --format=%x01%H%x09%cI --name-only` output, in the log's order. */
const listedPaths = (log: string): readonly (readonly [string, CommitAt])[] =>
  log
    .split("\x01")
    .slice(1)
    .flatMap((block) => {
      const lines = block.split("\n");
      const at = commitAt(nth(lines, 0));
      return lines
        .slice(1)
        .filter((n) => n !== "")
        .map((n) => [n, at] as const);
    });

/**
 * The first commit of each path in `git log --reverse --format=%x01%H%x09%cI --name-only` output:
 * a line starting with \x01 opens a commit, the lines after it name its files.
 */
export const firstCommitsOf = (log: string): ReadonlyMap<string, CommitAt> =>
  new Map(uniqueBy(listedPaths(log), ([name]) => name));

/**
 * Every commit that lists each path, in the log's order, a commit once: `-m` prints a merge once per
 * parent it differs from.
 */
export const touchingOf = (
  log: string,
): ReadonlyMap<string, readonly CommitAt[]> =>
  new Map(
    Object.entries(groupBy(listedPaths(log), ([name]) => name)).map(
      ([name, pairs]) => [
        name,
        uniqueBy(
          pairs.map(([, at]) => at),
          (at) => at.commit,
        ),
      ],
    ),
  );

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
      // `git log -1` names a deleting commit too, and a deleted file leaves a clean status.
      const head = inHead(git, paper, file);
      if ("why" in head) return { kind: "unknown", why: head.why };
      if (!head.present) return { kind: "deleted", commit };
      const status = git(paper, ["status", "--porcelain=v1", "--", file]);
      if ("why" in status) return { kind: "unknown", why: status.why };
      return status.out.trim() === ""
        ? { kind: "committed", commit, date }
        : { kind: "changed", commit };
    },
    paper: (paper, decisions) => paperOrder(git, paper, decisions),
    fileAt: (studyDir, commit, path) => fileAtIn(git, studyDir, commit, path),
  };
}

/** `path` (relative to `studyDir`) at `commit`: `ls-tree` says whether it is there, `show` gives its text. */
const fileAtIn = (
  git: Git,
  studyDir: AbsolutePath,
  commit: string,
  path: string,
): FileAt => {
  const listed = git(studyDir, ["ls-tree", "--name-only", commit, "--", path]);
  if ("why" in listed) return { kind: "unknown", why: listed.why };
  if (listed.out.trim() === "") return { kind: "absent" };
  const shown = git(studyDir, ["show", `${commit}:./${path}`]);
  return "why" in shown
    ? { kind: "unknown", why: shown.why }
    : { kind: "text", text: shown.out };
};

type Git = ReturnType<typeof gitIn>;

/** Whether `file` is in HEAD's tree (`git ls-tree`, which takes an absolute path in the worktree). */
const inHead = (
  git: Git,
  cwd: AbsolutePath,
  file: AbsolutePath,
): { readonly present: boolean } | { readonly why: string } => {
  const t = git(cwd, ["ls-tree", "--name-only", "HEAD", "--", file]);
  return "why" in t ? t : { present: t.out.trim() !== "" };
};

/** No decision was asked about: nothing is read, and nothing is claimed of any study. */
const NOTHING_ASKED: OrderFacts = {
  kind: "read",
  decision: null,
  decisionDeleted: false,
  files: [],
};

/** What git said of the paper, once: its tables, or why there are none. */
type Asked =
  | { readonly kind: "unknown"; readonly why: string }
  | { readonly kind: "shallow" }
  | {
      readonly kind: "tables";
      /** Where the paper's folder sits in the repository, "" at its top, else ending in `/`. */
      readonly prefix: string;
      /** The commits that touched each decision, oldest first, by path from the repository's top. */
      readonly touching: ReadonlyMap<string, readonly CommitAt[]>;
      /** The decisions HEAD's tree still holds, by path from the repository's top. */
      readonly inHead: ReadonlySet<string>;
      /** The first commit of every path under `<paper>/repro`, by path from the paper. */
      readonly firsts: ReadonlyMap<string, CommitAt>;
      readonly ancestry: Ancestry;
    };

const COMMIT = "--format=%x01%H%x09%cI";

/** Whole history, not git's simplified one: a squash of the branch it merges would hide that branch. */
const WHOLE = ["--full-history", "--no-renames"] as const;

/** `path` from the paper as a path from the repository's top, `/`-separated. */
const fromTop = (prefix: string, paper: AbsolutePath, path: string): string =>
  `${prefix}${relative(paper, path).split("\\").join("/")}`;

/** What the decision files' own history asks: every commit that touched them, and whether HEAD holds them. */
const decisionLogs = (decisions: readonly AbsolutePath[]) =>
  [
    [
      "log",
      "--reverse",
      ...WHOLE,
      "-m",
      COMMIT,
      "--name-only",
      "--",
      ...decisions,
    ],
    ["ls-tree", "--full-name", "--name-only", "HEAD", "--", ...decisions],
  ] as const;

/** What `<paper>/repro` asks: the first commit of every path, and the graph the ancestry is read from. */
const reproLogs = (repro: string, decisions: readonly AbsolutePath[]) =>
  [
    [
      "log",
      "--reverse",
      ...WHOLE,
      COMMIT,
      "--name-only",
      "--relative",
      "--",
      repro,
    ],
    [
      "log",
      ...WHOLE,
      "--topo-order",
      "--reverse",
      "--parents",
      "--format=%H %P",
      "--",
      repro,
      ...decisions,
    ],
  ] as const;

/** The four logs of the paper, as git arguments: steps 2 to 5 of the header. */
const logsOf = (paper: AbsolutePath, decisions: readonly AbsolutePath[]) => [
  ...decisionLogs(decisions),
  ...reproLogs(`${paper}/${REPRO_DIR}`, decisions),
];

/** The paper's history, in the five git processes the header names; the first that fails is the reason. */
const askPaper = (
  git: Git,
  paper: AbsolutePath,
  decisions: readonly AbsolutePath[],
): Asked => {
  const where = git(paper, [
    "rev-parse",
    "--is-shallow-repository",
    "--show-prefix",
  ]);
  if ("why" in where) return { kind: "unknown", why: where.why };
  const [shallow = "", prefix = ""] = where.out.split("\n");
  if (shallow.trim() === "true") return { kind: "shallow" };
  const answers = logsOf(paper, decisions).map((args) => git(paper, args));
  const failed = answers.flatMap((a) => ("why" in a ? [a.why] : [])).at(0);
  const text = answers.map((a) => ("out" in a ? a.out : ""));
  return failed !== undefined
    ? { kind: "unknown", why: failed }
    : {
        kind: "tables",
        prefix,
        touching: touchingOf(nth(text, 0)),
        inHead: new Set(nth(text, 1).split("\n")),
        firsts: firstCommitsOf(nth(text, 2)),
        ancestry: ancestryOf(nth(text, 3)),
      };
};

/** The order facts of the studies of `paper`, from one asking of git. */
const paperOrder = (
  git: Git,
  paper: AbsolutePath,
  decisions: readonly AbsolutePath[],
): PaperOrder => {
  if (decisions.length === 0) return { order: () => NOTHING_ASKED };
  const asked = askPaper(git, paper, decisions);
  return {
    order: (studyDir, decision) =>
      asked.kind === "tables"
        ? orderIn(asked, paper, studyDir, decision)
        : asked,
  };
};

/** The tables' answer for the study in `studyDir`, decided by `decision`. */
const orderIn = (
  t: Extract<Asked, { readonly kind: "tables" }>,
  paper: AbsolutePath,
  studyDir: AbsolutePath,
  decision: AbsolutePath,
): OrderFacts => {
  const key = fromTop(t.prefix, paper, decision);
  const touching = t.touching.get(key) ?? [];
  const first = touching.slice(0, 1).at(0) ?? null;
  const folder = `${relative(paper, studyDir).split("\\").join("/")}/`;
  const mine = pipe(
    [...t.firsts],
    filter(([name]) => name.startsWith(folder)),
    map(([name, at]) => [name.slice(folder.length), at] as const),
  );
  const ordered = ordersOf(
    t.ancestry,
    { at: first, touching: touching.map((c) => c.commit) },
    new Map(mine),
  );
  return "why" in ordered
    ? { kind: "unknown", why: ordered.why }
    : {
        kind: "read",
        decision: first,
        decisionDeleted: first !== null && !t.inHead.has(key),
        files: ordered.files,
      };
};

/** The order of `commit` against the decision: not after anything when it was never committed. */
const orderOf = (
  a: Ancestry,
  decision: {
    readonly at: CommitAt | null;
    readonly touching: readonly string[];
  },
  commit: string,
): Order | undefined => {
  if (decision.at === null) return "not-after";
  // The decision's own first commit is the same one whatever else touched it.
  if (commit === decision.at.commit) return "same";
  return orderAmong(a, commit, decision.touching);
};

/** Each file's first commit with its order against the decision's; the commits in the order they first appear. */
const ordersOf = (
  a: Ancestry,
  decision: {
    readonly at: CommitAt | null;
    readonly touching: readonly string[];
  },
  firsts: ReadonlyMap<string, CommitAt>,
): { readonly files: readonly FirstCommit[] } | { readonly why: string } => {
  const commits = [...new Set([...firsts.values()].map((c) => c.commit))];
  const orders = commits.flatMap((c) => {
    const order = orderOf(a, decision, c);
    return order === undefined ? [] : [[c, order] as const];
  });
  if (orders.length !== commits.length)
    return { why: "git did not list a commit of this paper's history" };
  return {
    files: orders.flatMap(([commit, order]) =>
      [...firsts]
        .filter(([, c]) => c.commit === commit)
        .map(([path, c]) => ({ path, ...c, order })),
    ),
  };
};
