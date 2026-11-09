# repro/outputs-before-decision

**Level:** error · **Reads:** `repro/studies.json`, each study's `plan.json`, the files under a
decide-first study's folder, and git's history of them · **Reported on:** the first line of the
paper's `PIPELINE-STATUS.md`, once per finding

## What it catches

A study decided before its run — its plan's `mode` is `decide_before_run`, the default
`paperlint studies new` writes for a measurement — whose history does not show that order:

```json
{
  "mode": {
    "kind": "decide_before_run",
    "outputs": ["out/**", "RESULTS.md"],
    "decision": {
      "file": "repro/P1-S01-outcome/decision.md",
      "note": "exclusions, veto, and the sample approved"
    }
  }
}
```

- **`output-before-decision`** — an output (a file the `outputs` globs match, under the study's
  folder) whose FIRST commit is not a strict descendant of the decision file's FIRST commit: earlier,
  on a line of history the decision is not on, or in the very same commit, which says nothing about
  which came first. An output committed and later deleted still counts.
- **`undecided-output`** — an output in the tree, or one ever committed and since deleted, while the
  decision file has never been committed.
- **`decision-is-output`** — the decision file lies in the study's folder and an output glob matches
  it: the decision would be a file its own run produces.
- **`decision-deleted`** — the decision file was committed and later deleted: it is not in HEAD, so
  the study has no decision its outputs could follow, and the order is not judged against it.
- **`decision-not-file`** — the decision path names a directory or a symbolic link: git answers for
  a directory with the commits of anything under it, and records a link rather than the file it
  points to, so no order is read from either. (A path that names the paper's folder
  itself, `.`, or ends in `/` is refused when the plan is parsed.)
- **`decision-linked`** — the decision path passes through a symbolic link above the file: git
  records the link, not the files behind it, so no order is read from it, and the finding names the
  link.
- **`shallow`** — the clone is shallow, so every file's first commit is the clone's: no order can be
  read, and the rule says so instead of judging.
- **`no-history`** — git could not answer (not installed, not a repository).
- **`gates-changed`** — the plan is a plan v2 ([`docs/design/study-gates.md`](../../design/study-gates.md)),
  and one of its gates (`mode.we_lose_if`, `second_check`, `self_test`, `funnel`, `recall_audit`) differs from what
  the plan declared at the commit of the study's first output after its decision: a threshold moved
  after a result exists. One finding per changed gate, with its value then and now.
- **`gates-not-fixed`** — the plan v2 was not in history at that commit, or was a plan v1 or no
  readable plan there: its gates were not fixed before the run.

The study's own files — `plan.json`, `README.md` and the decision file — are never outputs. A symbolic
link in the study's folder is one entry, as git stores it, and is never followed: a link to the folder
itself cannot loop the walk, and one to a tree outside brings none of its files into the study.

## Why

A measurement's inputs — which runs count, which units are excluded, whether the sample is approved
— must be decided before anyone has seen an outcome; otherwise the decision can follow the result.
"Decide first, then compute" needs no key and no encryption: the decision is committed, the run
starts only after (`paperlint studies gate` exits 0 only then), and git's history is the proof of
order. This rule re-reads that proof on every lint, so a reviewer who clones the repository can run
the same check and get the same answer. The design is
[`docs/design/study-modes.md`](../../design/study-modes.md).

**It asks git for an order, never pins a sha**, which is why it can live as a lint rule (rules in
`eslint-rules/` may not run git: a pinned sha is deleted by a squash or a gc). A squash merge keeps
the order when the decision was merged before the run — the decide-first workflow — and a shallow
checkout is named, not read as a violation. A squash of a branch that held both the decision and the
run puts them in one commit, and that order is gone from the squashed history; merge such a branch
with a merge commit instead. History is read whole (`--full-history`): a merge whose first parent is
already identical to it (a squash of the branch it merges back) does not hide that branch's commits.

## Cost

The rule asks git once per paper, not once per study: five git processes whatever the number of
studies (`src/adapters/git/index.ts` says which, and why the findings are unchanged). It asked per
study before, and every `--full-history` call with a path walks the whole history of the repository.

| what                                                                               | before               | after            |
| ---------------------------------------------------------------------------------- | -------------------- | ---------------- |
| a real paper with about 115 studies, `paperlint lint`, the author's measurement    | 70 s, this rule 50 s | not re-measured  |
| a synthetic repository, 100 studies, 295 commits: this rule, `TIMING=10`, two runs | 13.2 s, 13.7 s       | 0.42 s, 0.44 s   |
| the same: git processes                                                            | 820                  | 5                |
| the first-commit log of a shallow clone (149 commits, ~500k paths), three runs     | 1.1 s to 1.2 s       | 0.56 s to 0.63 s |

The last row is `--no-renames`: a path's first commit lists its new name whether or not renames are
detected, so the first commit does not depend on them, and detecting them cost half the time (and
printed "exhaustive rename detection was skipped" on a large tree). The findings of the synthetic
repository, and of 500 random study histories with merges and deletions, were identical before and
after.

## Examples

Failing:

```text
papers/example/PIPELINE-STATUS.md
  1:1  error  `repro/P1-S01-outcome/RESULTS.md`, an output of `P1-S01`, entered history in
              4f2a9c0e1b7d (2026-10-16T10:00:00+05:00), the very commit that first recorded its
              decision, 4f2a9c0e1b7d (2026-10-16T10:00:00+05:00). The study is declared decided
              before its run, and its history does not show that order. What to do: if the decision
              really came first, nothing in this history can prove it — declare the study
              `exploratory` with the reason, or run it again after the decision; never rewrite the
              history to make it pass.
Rule repro/outputs-before-decision: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/outputs-before-decision.md  repro/outputs-before-decision
```

Passing: `decision.md` committed in one commit; `RESULTS.md` and `out/` committed in a later commit
that descends from it. An `exploratory` study is not this rule's.

## Options / preset fields

No rule options. The study declares its mode in its plan.

## What it does not check

- What the decision says. The gate is that it is committed, not its content.
- **A decision amended after the outputs**: the order is between FIRST commits. A later edit of the
  decision file is visible in its history (`git log -- <file>`) but not reported.
- A plan v1, or a plan v2's parts other than its four gates: the question, the source and the note
  may be reworded after the outputs. Only the gates are frozen.
- That nobody ran the study before the decision and kept the outputs out of git. History records
  what was committed; a run on a machine that never committed it leaves no trace.
- A study whose row names a folder that is not one inside `repro/` (`../x`), or a folder that is a
  symbolic link: nothing is read through it, so it is no study here;
  [`repro/study-registered`](study-registered.md) reports the row or reads its plan as missing.
- A study whose plan is still a draft: only a ready plan's mode decides anything, and
  [`repro/study-registered`](study-registered.md) reports an unfilled plan once the study runs.
- Commit dates. They are shown in the message, but the order is ancestry, which a rebase can
  rewrite only by making a new history that a reviewer comparing against the published one sees.

## How to fix

Commit the decision first, then let the run start:

```sh
git add papers/example/repro/P1-S01-outcome/decision.md && git commit -m "P1-S01: decision"
npx paperlint studies gate papers/example P1-S01 && ./run.sh
```

In CI, check out the whole history: `actions/checkout` with `fetch-depth: 0`. A study whose outputs
were made before its decision cannot be repaired by editing history; declare it exploratory:

```json
{
  "mode": {
    "kind": "exploratory",
    "reason": "outputs existed before the exclusions were fixed"
  }
}
```
