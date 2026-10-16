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
- **`decision-not-file`** — the decision path names a directory: git answers for a directory with the
  commits of anything under it, so no order is read from it. (A path that names the paper's folder
  itself, `.`, or ends in `/` is refused when the plan is parsed.)
- **`shallow`** — the clone is shallow, so every file's first commit is the clone's: no order can be
  read, and the rule says so instead of judging.
- **`no-history`** — git could not answer (not installed, not a repository).

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
checkout is named, not read as a violation.

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
- That nobody ran the study before the decision and kept the outputs out of git. History records
  what was committed; a run on a machine that never committed it leaves no trace.
- A study whose row names a folder that is not one inside `repro/` (`../x`): nothing is read through
  it, so it is no study here; [`repro/study-registered`](study-registered.md) reports the row.
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
