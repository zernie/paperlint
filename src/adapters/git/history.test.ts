/**
 * The git ports over a REAL repository in a scratch directory: the committed state of a decision,
 * and the order of every output's first commit against the decision's — after, the same commit, or
 * not after — a deleted output included, and a shallow clone named as such.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { spawnProcess } from "../node/index.ts";
import { commit, git, initRepo } from "../../../test/git-repo.ts";
import { useTempDir } from "../../../test/support.ts";
import { gitHistory } from "./index.ts";

const root = useTempDir("git-history-");
const ports = gitHistory(spawnProcess(), { PATH: String(process.env.PATH) });
/** The order facts of one study, asked as a paper of that one study: `p/` of the repository holds it. */
const orderOf = (
  paper: ReturnType<typeof absolutePath>,
  studyDir: ReturnType<typeof absolutePath>,
  decision: ReturnType<typeof absolutePath>,
) => ports.paper(paper, [decision]).order(studyDir, decision);
const T1 = "2026-10-16T10:00:00+05:00";
const T2 = "2026-10-16T11:00:00+05:00";
const T3 = "2026-10-16T12:00:00+05:00";
const T4 = "2026-10-16T13:00:00+05:00";
const T5 = "2026-10-16T14:00:00+05:00";

it("a decision committed, then changed, then never committed: three states", () => {
  const repo = join(root, "committed");
  initRepo(repo);
  const sha = commit(repo, { "p/decision.md": "exclusions: none\n" }, T1);
  const paper = absolutePath(join(repo, "p"));
  const file = absolutePath(join(repo, "p/decision.md"));
  // Guards: the commit and its date as git records them.
  expect(ports.committed(paper, file)).toEqual({
    kind: "committed",
    commit: sha,
    date: T1,
  });
  writeFileSync(file, "exclusions: run 7\n");
  // Guards: an edit after the commit is not the recorded decision.
  expect(ports.committed(paper, file)).toEqual({
    kind: "changed",
    commit: sha,
  });
  writeFileSync(join(repo, "p/new.md"), "x\n");
  expect(ports.committed(paper, absolutePath(join(repo, "p/new.md")))).toEqual({
    kind: "not-committed",
  });
});

it("outputs after the decision, in its commit, before it, and deleted since: each with its order", () => {
  const repo = join(root, "order");
  initRepo(repo);
  const early = commit(repo, { "p/repro/S/early.csv": "1\n" }, T1);
  const decided = commit(
    repo,
    { "p/repro/S/decision.md": "d\n", "p/repro/S/same.csv": "2\n" },
    T2,
  );
  const later = commit(
    repo,
    { "p/repro/S/later.csv": "3\n", "p/repro/S/early.csv": null },
    T3,
  );
  // Guards: the order is read from ancestry; a deleted early output is still evidence.
  expect(
    orderOf(
      absolutePath(join(repo, "p")),
      absolutePath(join(repo, "p/repro/S")),
      absolutePath(join(repo, "p/repro/S/decision.md")),
    ),
  ).toEqual({
    kind: "read",
    decision: { commit: decided, date: T2 },
    decisionDeleted: false,
    files: [
      { path: "early.csv", commit: early, date: T1, order: "not-after" },
      { path: "decision.md", commit: decided, date: T2, order: "same" },
      { path: "same.csv", commit: decided, date: T2, order: "same" },
      { path: "later.csv", commit: later, date: T3, order: "after" },
    ],
  });
});

it("a squash on the first parent does not hide the order its merged-in branch recorded", () => {
  const repo = join(root, "squashed");
  initRepo(repo);
  commit(repo, { "README.md": "r\n" }, T1);
  git(repo, ["checkout", "-q", "-b", "study"], T1);
  const decided = commit(repo, { "p/repro/S/decision.md": "d\n" }, T2);
  const ran = commit(repo, { "p/repro/S/out.csv": "1\n" }, T3);
  git(repo, ["checkout", "-q", "main"], T3);
  commit(
    repo,
    { "p/repro/S/decision.md": "d\n", "p/repro/S/out.csv": "1\n" },
    T4,
    "squash",
  );
  git(repo, ["merge", "-q", "--no-ff", "-m", "merge", "study"], T5);
  // Guards: the merge is TREESAME to the squash, its first parent, so git's default history
  // simplification walks only the squash and reads decision and output as born in one commit.
  expect(
    orderOf(
      absolutePath(join(repo, "p")),
      absolutePath(join(repo, "p/repro/S")),
      absolutePath(join(repo, "p/repro/S/decision.md")),
    ),
  ).toEqual({
    kind: "read",
    decision: { commit: decided, date: T2 },
    decisionDeleted: false,
    files: [
      { path: "decision.md", commit: decided, date: T2, order: "same" },
      { path: "out.csv", commit: ran, date: T3, order: "after" },
    ],
  });
});

it("a decision squashed into main, then its branch merged back: outputs on main stay after it", () => {
  const repo = join(root, "decision-squashed");
  initRepo(repo);
  commit(repo, { "README.md": "r\n" }, T1);
  git(repo, ["checkout", "-q", "-b", "decide"], T1);
  const original = commit(repo, { "p/repro/S/decision.md": "d\n" }, T2);
  git(repo, ["checkout", "-q", "main"], T2);
  commit(repo, { "p/repro/S/decision.md": "d\n" }, T3, "squash");
  const ran = commit(repo, { "p/repro/S/out.csv": "1\n" }, T4);
  git(repo, ["merge", "-q", "--no-ff", "-m", "merge", "decide"], T5);
  // Guards: the earliest decision commit is on the merged-back branch and is no ancestor of the run,
  // but the squash that carried the same decision is; any commit holding the decision before counts.
  expect(
    orderOf(
      absolutePath(join(repo, "p")),
      absolutePath(join(repo, "p/repro/S")),
      absolutePath(join(repo, "p/repro/S/decision.md")),
    ),
  ).toEqual({
    kind: "read",
    decision: { commit: original, date: T2 },
    decisionDeleted: false,
    files: [
      { path: "decision.md", commit: original, date: T2, order: "same" },
      { path: "out.csv", commit: ran, date: T4, order: "after" },
    ],
  });
});

it("a shallow clone is named, not judged", () => {
  const repo = join(root, "deep");
  initRepo(repo);
  commit(repo, { "p/repro/S/decision.md": "d\n" }, T1);
  commit(repo, { "p/repro/S/out.csv": "1\n" }, T2);
  const shallow = join(root, "shallow");
  git(root, ["clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
  // Guards: a CI checkout of depth 1 says so instead of reading every file as born in one commit.
  expect(
    orderOf(
      absolutePath(join(shallow, "p")),
      absolutePath(join(shallow, "p/repro/S")),
      absolutePath(join(shallow, "p/repro/S/decision.md")),
    ),
  ).toEqual({ kind: "shallow" });
});

it("outside any repository, git's own refusal is the reason", () => {
  const r = orderOf(
    absolutePath("/"),
    absolutePath("/"),
    absolutePath("/decision.md"),
  );
  // Guards: no repository is "unknown", never an empty history.
  expect(r.kind).toBe("unknown");
});

it("a decision committed and deleted in a later commit is not in HEAD: never `committed`", () => {
  const repo = join(root, "deleted");
  initRepo(repo);
  const sha = commit(repo, { "p/repro/S/decision.md": "d\n" }, T1);
  const gone = commit(repo, { "p/repro/S/decision.md": null }, T2);
  const paper = absolutePath(join(repo, "p"));
  const file = absolutePath(join(repo, "p/repro/S/decision.md"));
  // Guards: `git log -1` names the deletion and the tree is clean, yet there is no decision to gate on;
  // the order still reads the decision's first commit, and says it is gone.
  expect([
    ports.committed(paper, file),
    orderOf(
      absolutePath(join(repo, "p")),
      absolutePath(join(repo, "p/repro/S")),
      file,
    ),
  ]).toEqual([
    { kind: "deleted", commit: gone },
    {
      kind: "read",
      decision: { commit: sha, date: T1 },
      decisionDeleted: true,
      files: [{ path: "decision.md", commit: sha, date: T1, order: "same" }],
    },
  ]);
});

/** Six studies on one repository: shared commits, a squash that copies decisions, a merge, an amended decision. */
const sixStudies = (repo: string) => {
  initRepo(repo);
  const S = (n: number) => `p/repro/S${String(n)}`;
  const T = (h: number) =>
    `2026-10-16T${String(h).padStart(2, "0")}:00:00+05:00`;
  commit(repo, { "README.md": "r\n" }, T(1));
  const early = commit(repo, { [`${S(6)}/out.csv`]: "early\n" }, T(2));
  git(repo, ["checkout", "-q", "-b", "decide"], T(3));
  const d1 = commit(repo, { [`${S(1)}/decision.md`]: "d1\n" }, T(3));
  const d2 = commit(repo, { [`${S(2)}/decision.md`]: "d2\n" }, T(4));
  const d3 = commit(repo, { [`${S(3)}/decision.md`]: "d3\n" }, T(5));
  git(repo, ["checkout", "-q", "main"], T(6));
  // The decisions of S1..S3 copied onto main by a squash: the original commits are on another line.
  commit(
    repo,
    Object.fromEntries(
      [1, 2, 3].map((n) => [`${S(n)}/decision.md`, `d${String(n)}\n`]),
    ),
    T(7),
    "squash",
  );
  const r1 = commit(
    repo,
    {
      [`${S(1)}/out/a.csv`]: "1\n",
      [`${S(2)}/RESULTS.md`]: "2\n",
      [`${S(2)}/out/b.csv`]: "2\n",
    },
    T(8),
  );
  const r2 = commit(
    repo,
    { [`${S(3)}/RESULTS.md`]: "3\n", [`${S(4)}/decision.md`]: "d4\n" },
    T(9),
  );
  const r3 = commit(
    repo,
    {
      [`${S(4)}/RESULTS.md`]: "4\n",
      [`${S(5)}/decision.md`]: "d5\n",
      [`${S(5)}/RESULTS.md`]: "5\n",
    },
    T(10),
  );
  git(repo, ["merge", "-q", "--no-ff", "-m", "merge", "decide"], T(11));
  const r4 = commit(
    repo,
    { [`${S(6)}/decision.md`]: "d6\n", [`${S(1)}/out/c.csv`]: "9\n" },
    T(12),
  );
  commit(repo, { [`${S(2)}/decision.md`]: "d2 amended\n" }, T(13));
  return { early, d1, d2, d3, r1, r2, r3, r4 };
};

/** The ports over real git, recording the subcommand of every process they start. */
const countingPorts = () => {
  const calls: string[] = [];
  const real = spawnProcess();
  const counting = gitHistory(
    {
      run: (c) => {
        calls.push(String(c.args[2]));
        return real.run(c);
      },
    },
    { PATH: String(process.env.PATH) },
  );
  return { counting, calls };
};

it("a paper of six studies sharing commits: the same facts as asking per study, from five git processes", () => {
  const repo = join(root, "six");
  const { early, d1, d2, d3, r1, r2, r3, r4 } = sixStudies(repo);
  const S = (n: number) => `p/repro/S${String(n)}`;
  const T = (h: number) =>
    `2026-10-16T${String(h).padStart(2, "0")}:00:00+05:00`;
  const { counting, calls } = countingPorts();
  const paper = absolutePath(join(repo, "p"));
  const studies = [1, 2, 3, 4, 5, 6].map((n) => ({
    dir: absolutePath(join(repo, S(n))),
    decision: absolutePath(join(repo, S(n), "decision.md")),
  }));
  const asked = counting.paper(
    paper,
    studies.map((s) => s.decision),
  );
  const facts = studies.map((s) => asked.order(s.dir, s.decision));
  const at = (commit: string, hour: number) => ({ commit, date: T(hour) });
  // Guards: facts equal to what one query per study gave (30 git processes on this repository,
  // measured before the change), and five processes for the paper, however many studies ask.
  expect(calls).toHaveLength(5);
  expect(
    facts.map((f) =>
      f.kind === "read" ? f.files.map((x) => [x.path, x.commit, x.order]) : f,
    ),
  ).toEqual([
    [
      ["decision.md", d1, "same"],
      ["out/a.csv", r1, "after"],
      ["out/c.csv", r4, "after"],
    ],
    [
      ["decision.md", d2, "same"],
      ["RESULTS.md", r1, "after"],
      ["out/b.csv", r1, "after"],
    ],
    [
      ["decision.md", d3, "same"],
      ["RESULTS.md", r2, "after"],
    ],
    [
      ["decision.md", r2, "same"],
      ["RESULTS.md", r3, "after"],
    ],
    [
      ["RESULTS.md", r3, "same"],
      ["decision.md", r3, "same"],
    ],
    [
      ["out.csv", early, "not-after"],
      ["decision.md", r4, "same"],
    ],
  ]);
  expect(facts.map((f) => (f.kind === "read" ? f.decision : f))).toEqual([
    at(d1, 3),
    at(d2, 4),
    at(d3, 5),
    at(r2, 9),
    at(r3, 10),
    at(r4, 12),
  ]);
});

it("a file renamed inside the study is listed under its new name from the renaming commit, and under its old one from the first", () => {
  const repo = join(root, "renamed");
  initRepo(repo);
  const decided = commit(repo, { "p/repro/S/decision.md": "d\n" }, T1);
  const added = commit(repo, { "p/repro/S/old.csv": "same body\n" }, T2);
  git(repo, ["mv", "p/repro/S/old.csv", "p/repro/S/new.csv"], T3);
  git(repo, ["commit", "-q", "-m", "rename"], T3);
  const renamed = git(repo, ["rev-parse", "HEAD"], T3).trim();
  const order = orderOf(
    absolutePath(join(repo, "p")),
    absolutePath(join(repo, "p/repro/S")),
    absolutePath(join(repo, "p/repro/S/decision.md")),
  );
  // Guards: rename detection is off (`--no-renames`), and the first commit of each path is the same
  // with it on: the new name is listed in the renaming commit either way.
  expect(order).toEqual({
    kind: "read",
    decision: { commit: decided, date: T1 },
    decisionDeleted: false,
    files: [
      { path: "decision.md", commit: decided, date: T1, order: "same" },
      { path: "old.csv", commit: added, date: T2, order: "after" },
      { path: "new.csv", commit: renamed, date: T3, order: "after" },
    ],
  });
});
