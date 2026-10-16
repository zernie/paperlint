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
const T1 = "2026-10-16T10:00:00+05:00";
const T2 = "2026-10-16T11:00:00+05:00";
const T3 = "2026-10-16T12:00:00+05:00";

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
    ports.order(
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

it("a shallow clone is named, not judged", () => {
  const repo = join(root, "deep");
  initRepo(repo);
  commit(repo, { "p/repro/S/decision.md": "d\n" }, T1);
  commit(repo, { "p/repro/S/out.csv": "1\n" }, T2);
  const shallow = join(root, "shallow");
  git(root, ["clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
  // Guards: a CI checkout of depth 1 says so instead of reading every file as born in one commit.
  expect(
    ports.order(
      absolutePath(join(shallow, "p/repro/S")),
      absolutePath(join(shallow, "p/repro/S/decision.md")),
    ),
  ).toEqual({ kind: "shallow" });
});

it("outside any repository, git's own refusal is the reason", () => {
  const r = ports.order(absolutePath("/"), absolutePath("/decision.md"));
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
    ports.order(absolutePath(join(repo, "p/repro/S")), file),
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
