---
title: "Occupancy research — staleness tracking / build-graph machinery for the paper QA pipeline"
created: 2026-08-06
tags: [occupancy-research, paper-pipeline, build-systems, staleness, provenance, mutation-testing]
---

# Occupancy: "what ran against what, and what is stale now"

**The problem restated.** A hand-maintained `PIPELINE-STATUS.md` marks ~20 quality checks (some
cheap scripts, some expensive LLM agent runs) as ✅/❌ against a document. It lies: a check stays ✅
after the text it checked has been rewritten, because nothing recomputes the mark. Requirement in
his own words: *"I want stuff to be visible immediately... timestamps, and/or hashes, marks for when
was what skill ran last time inline... preference should be to deterministic checks."*

**Hypothesis under test:** this is a solved problem — a content-addressed build graph — and the
status table is a hand-rolled, lying build cache. Below is what was actually fetched and quoted, not
recalled from memory. Scope is narrowly "what ran against what, is it stale" — not workflow design.

---

## 1. `make` — the baseline, and exactly where it breaks

**What it is.** The original dependency-graph build tool: targets, prerequisites, recipes,
timestamp comparison.

**Alive?** Yes (GNU make, still maintained), but irrelevant as a mechanism question — it's the
*reference failure mode*, not a candidate.

**Exactly what it gives, and what it doesn't.** Fetched `bug-make` mailing list discussion and two
independent blog write-ups (John Graham-Cumming; Oli Pratt) confirming the same architectural fact:

> "the only tool in Make's toolbox is the timestamp of files ... GNU make decides that a target
> needs rebuilding if a dependency is 'newer' than the target file by comparing the modification
> timestamp of the target and dependency files."

Consequence documented in the same sources: a `git checkout` that restores byte-identical content
still bumps mtimes, so make reruns things that didn't change (false positive staleness) — and,
worse for this use case, **make has no notion of the recipe itself changing**. If you edit the
*checker's own logic* (its shell command) but don't touch any file listed as a prerequisite, make
will not know the recipe changed and will report the target up to date. That is precisely the
failure mode in `PIPELINE-STATUS.md`: a check's own definition (prompt, script, model version)
changes and nothing notices.

**Verdict: this is the mechanism the status table currently is, manually, minus even the timestamp
comparison.** Not adoptable as-is; useful only as the "what NOT to build" baseline.

Sources: [Rebuilding when the hash has changed, not the timestamp](https://blog.jgc.org/2006/04/rebuilding-when-hash-has-changed-not.html), [bug-make thread on hash vs timestamp](https://lists.gnu.org/archive/html/bug-make/2015-04/msg00000.html), [Rebuilding Makefile Targets Only When Dependency Content Changes](http://olipratt.co.uk/rebuilding-makefile-targets-only-when-dependency-content-changes.html)

---

## 2. Content-addressed build systems: Bazel, Buck2, Nix, Please

### Bazel

**Alive.** Actively developed (bazel.build current docs, 2026).

**Exactly what it gives.** Fetched `bazel.build/reference/glossary` directly. Quote:

> **Action Cache:** "An on-disk cache that stores a mapping of executed actions to the outputs they
> created. The cache key is known as the action key."
> **Action Key:** "The cache key of an action. Computed based on action metadata, which might
> include the command to be executed in the action, compiler flags, library locations, or system
> headers, depending on the action."

This directly answers the test question: **yes, changing the checker's own definition (the command
line, compiler flags — i.e. the recipe) changes the action key and invalidates the cached result**,
because the command itself is hashed into the key, not just the input file contents. This is exactly
the property `make` lacks.

Cost to adopt: real. Bazel requires a `BUILD`/`WORKSPACE` file model, a Starlark rule per check type,
and — for anything beyond a toy example — understanding of its dependency/action graph. This is a
build-system migration, not a drop-in script.

Sources: [Bazel Reference Glossary](https://bazel.build/reference/glossary), [Remote Caching | Bazel](https://bazel.build/remote/caching)

### Buck2

**Alive.** Meta's active successor to Buck1 (buck2.build current docs).

**What it gives.** Same family as Bazel: action cache addressed by a content-addressable-storage
(CAS) digest of inputs. Docs describe the flow: "When Buck2 decides to run an action remotely, it
will first upload all of the action's inputs that are missing from the Remote Execution service's
content addressable storage." The action-cache-key mechanics (whether the command itself is
included) are described at the same level as Bazel's — Buck2 is explicitly modeled as a rewrite of
the same idea with a different execution engine.

Cost to adopt: same order as Bazel — a real build-system migration (`BUCK` files, Starlark), heavier
tooling than a solo document-QA pipeline needs.

Source: [Architectural Model | Buck2](https://buck2.build/docs/developers/architecture/buck2/)

### Nix

**Alive.** Actively developed; current manual at nix.dev/manual.

**What it gives — verified precisely, this is the cleanest confirmation of the hypothesis.**
Fetched a technical blog (fzakaria.com) explaining `.drv` hash construction, cross-checked against
Nix Pills and the official manual summary:

> "The hash is constructed from the contents of the derivation file rather than the bytes of the
> output, which is the input-addressed approach. This means that even the teeniest change, such as
> a comment, that might have no consequential change to the output artifact causes a whole new store
> path."
>
> "The builder script is in the input sources, and the store path is computed based on the filename
> and on the hash of its contents. Since the builder script (and its contents) are part of the
> inputs to the derivation, changes to the builder script directly affect the derivation hash."

This is a **direct, unambiguous yes** to "does changing the checker's own source invalidate the
cached result?" — a Nix derivation's identity *is* the hash of its build script plus its declared
inputs; edit the script by one character (even a comment) and the store path changes, so the cached
result at the old path is simply never looked up again. There's no separate bookkeeping step to
forget to run — it's structurally impossible to get a stale hit.

Nix also has an experimental content-addressed mode (CA derivations) layered on top, where the
*output's* store path is additionally keyed by output content rather than only by input — orthogonal
improvement, not needed here.

Cost to adopt: high for what it's for. Nix is a whole packaging/build language with a steep learning
curve, a daemon, and a store (`/nix/store`) model. Using it *only* to hash "did the checker's prompt
or the target text change" is using a freight train to cross a room — the property is real, the
vehicle is oversized.

Sources: [What's in a Nix store path](https://fzakaria.com/2025/03/28/what-s-in-a-nix-store-path), [Working Derivation — Nix Pills](https://nixos.org/guides/nix-pills/07-working-derivation.html), [Content-addressing derivation outputs — Nix manual](https://releases.nixos.org/nix/nix-2.31.0/manual/store/derivation/outputs/content-address.html)

### Please

**Alive** (please.build, active docs).

**What it gives.** Same content-addressed-build family as Bazel/Buck2 (it explicitly targets
Bazel-like ergonomics with a simpler config). Docs page found describes incrementality as a build
metric and notes an escape hatch — "An arbitrary string can be added to the hash of every build
target to force a rebuild of everything when it's changed" — confirming the hash does fold in more
than just file content, and is designed to be deliberately perturbable. Full documentation of what
exactly composes the default hash wasn't reachable in the fetched pages (would need `please.build`
internals doc, not fetched).

Cost to adopt: same class as Bazel/Buck2 — new build-file DSL, new mental model. No decisive
advantage over Bazel found that would justify picking it here.

Source: [Please FAQ](https://please.build/faq.html)

**Bazel/Buck2/Nix/Please verdict, jointly:** all three fully deliver the property "recipe change ⇒
cache invalidation." All four cost a build-system migration. None is proportionate to "~20 checks
over a handful of markdown files, run by one person."

---

## 3. Task runners with hashing: Turborepo, Nx, moon, `just`, `task`

### Turborepo

**Alive.** turborepo.dev, active (Vercel).

**What it gives.** Docs + GitHub issues confirm: "Turborepo creates two hashes: a global hash and a
task hash, and if either changes, the task will miss cache." `turbo run --dry-run=json` shows the
computed hash and predicted hit/miss *without executing*, and `--summarize` produces a JSON diff of
"what changed" when a miss happens — this is close to the "immediately visible" status view he
wants, and it's inspectable per-task rather than a hand-written table. Caveat found directly in
GitHub issues (#9044, #2004): dry-run's predicted cache state and the real run's cache state have
been reported to disagree — the dry-run preview is not 100% authoritative in practice.

Cost to adopt: requires a JS/pnpm-monorepo project shape (`turbo.json`, `package.json` per
"package"). Wrong tool family for a markdown/Python-script pipeline unless one is willing to wrap
every check as an npm-workspace package purely to get the scheduler — real friction, not free.

Sources: [Caching | Turborepo](https://turborepo.dev/docs/crafting-your-repository/caching), [turbo run --dry=json cache.local inconsistency](https://github.com/vercel/turborepo/discussions/9038)

### Nx

**Alive.** nx.dev, active (Nrwl).

**What it gives.** Docs: "Nx hashes all configured inputs for the task to produce a single
computation hash string... If the hash matches a previous run, Nx skips execution and replays the
cached result. If not, Nx runs the task and stores the result for next time." `nx affected` computes
which projects/tasks are touched by a change and is explicitly designed as the "what needs to rerun"
view — closer to a dashboard than Turborepo's raw dry-run JSON. Same caveat class found in issue
#16153: hash computed by `nx print-affected` has been reported to diverge from the hash computed at
actual run time (dynamic inputs like a version field breaking reproducibility) — a reminder that
*inputs must be fully declared* for any of these systems, not a flaw unique to Nx.

Cost to adopt: same as Turborepo — an Nx workspace (`nx.json`, project graph) is a JS/TS monorepo
tool. Not a natural fit for markdown+script checks unless the whole repo is restructured around it.

Sources: [How Caching Works | Nx](https://nx.dev/docs/concepts/how-caching-works), [Run Only Tasks Affected by a PR | Nx](https://nx.dev/docs/features/ci-features/affected)

### moon (moonrepo)

**Alive, actively releasing** — found four 2026 releases in sequence (v2.2 Apr, v2.3 Jun, v2.4 Jul
2026) via moonrepo.dev/blog, including a notable v2.2 feature: "a new **debug-task** AI skill to help
diagnose cache and hashing issues" — moon's own team recognized "why is this stale/not stale" is
hard enough to need a dedicated debug tool, which is telling. v2.3 added "native file hashing and a
local CAS" as *experimental* layers, meaning full content-addressed caching is still stabilizing
even in a purpose-built 2026 tool.

**What it gives.** Rust-based, framework-agnostic (less JS-locked than Nx/Turborepo), same hash→
cache-hit/miss model.

Cost to adopt: still a monorepo task-runner install + `moon.yml` config per project; younger/smaller
ecosystem than Nx/Turborepo, mitigated by not being JS-specific.

Source: [moon v2.2](https://moonrepo.dev/blog/moon-v2.2), [moon v2.3](https://moonrepo.dev/blog/moon-v2.3), [moon v2.4](https://moonrepo.dev/blog/moon-v2.4)

### `just`

**Alive** (casey/just, active). It is a **command runner, not a build system** — it has no built-in
staleness/hash tracking at all. Confirmed by search: no file-hash change-detection feature exists in
just's core; users bolt on external tools (e.g. `hash-runner`) for that. Rules out `just` as a
candidate for the actual property needed — it gives ergonomic command aliasing, nothing about "did
the input change."

Source: [casey/just — GitHub](https://github.com/casey/just)

### `task` (go-task / Taskfile.dev)

**Alive** (taskfile.dev, active changelog).

**What it gives — the closest lightweight match found in this whole category.** Docs confirm a
first-class `method: checksum` per task: "Task provides a 'checksum' method for checking if a task
is up-to-date by monitoring source files for changes... by default task stores checksums on a local
`.task` directory." This is genuinely a content hash (not mtime) of declared `sources:`, computed
per task, persisted locally, with no daemon and no monorepo restructuring — just a `Taskfile.yml`.
Caveat found in GitHub issue #2294: a reported bug where the checksum was stuck at the same value in
one release (v3.44.0) — a live tool, so verify current behavior before relying on it, but the design
is sound and the closest "make, but hashed" tool surfaced in this research.

**This is the best-fit adoption candidate of the entire task-runner category**: single YAML file,
per-task `sources:` list (which could include the checker script *and* the document, so editing
either invalidates the checksum), no new language, no daemon.

Sources: [Taskfile Guide](https://taskfile.dev/docs/guide), [Task checksum bug report #2294](https://github.com/go-task/task/issues/2294)

---

## 4. Scientific workflow engines: Snakemake, Nextflow, CWL, Dagster, Airflow

### Snakemake

**Alive**, current docs at v9.23.1/v9.25.1 (snakemake.readthedocs.io).

**What it gives — exactly the "why is this stale" surface he asked for.** Fetched the FAQ directly:

> "Snakemake tries to ensure consistency between input and output files. This is based on file
> modification dates (input files may not be newer than output files of the same job), as well as
> execution metadata like the used software stack (e.g. conda env or container image), the non-file
> parameters, the set of input files, **and the code of the rule**."

That last clause is the load-bearing one: Snakemake explicitly tracks the *rule's own code* as a
rerun trigger, separate from mtimes — this is the same property Bazel/Nix give, but in a tool built
for exactly this shape of problem (a DAG of heterogeneous checks over files, cheap and expensive
mixed, run by a single researcher — Snakemake's actual target audience, it underlies `showyourwork`
for reproducible papers).

`--dry-run --reason` (confirmed in docs) prints, per rule, the specific reason it would run — "detailed
information about the reasoning is given in the job description of Snakemake's output as well as in
the final summary at the end of a dry-run." This is close to literally what was asked for:
"marks for when was what skill ran last time inline."

Escape hatches also documented: `--touch` to fake a rule as run without running it (useful, also a
foot-gun — the exact thing `PIPELINE-STATUS.md`'s ✅ currently is, done deliberately instead of by
neglect); `--rerun-triggers mtimes` to fall back to make-style behavior if the finer-grained
triggers are too twitchy.

Cost to adopt: moderate, not zero. A `Snakefile` with one `rule` per check, declaring the document(s)
as `input` and a `.done`/report file as `output`; the check's own script goes in `input` too (or
Snakemake tracks "code of the rule" automatically per the FAQ quote — needs one more read of the
rule-versioning docs to confirm whether that's automatic or requires opting into `--rerun-triggers`
including `code`, but the FAQ states it as default behavior). No daemon, runs from CLI, has a
`--dag`/`--rulegraph` visual graph.

**Strongest single candidate in the entire survey** for the actual problem statement — purpose-built
for "heterogeneous checks (cheap script + expensive job) over files, for one researcher, needs to
show what's stale and why."

Sources: [Snakemake FAQ](https://snakemake.readthedocs.io/en/stable/project_info/faq.html), [Snakemake CLI docs](https://snakemake.readthedocs.io/en/stable/executing/cli.html)

### Nextflow

**Alive** (nextflow.io, active docs + GitHub).

**What it gives.** `-resume` + task-hash cache, backed by LevelDB in `.nextflow/cache/<session-id>`.
Docs github page: "The cache key is the task hash... If a cached directory exists but validation
fails, the system increments tries and recomputes the hash." A `-dump-hashes` flag exists for
debugging why a cached task reran — but GitHub issue #4367 is an open feature request precisely
because that debugging is currently manual/painful: "users have to do a lot of manual work to
extract the relevant information from the logs" to figure out why a hash changed. So Nextflow gives
the hashing mechanism but **not yet** the "immediately visible" glanceable reason — worse on that
specific axis than Snakemake's `--reason`.

Cost to adopt: Nextflow's DSL and execution model (channels, processes) is heavier than Snakemake's
rule files for a non-genomics pipeline; ecosystem is bioinformatics-specific in convention even
though generic in principle.

Source: [nextflow.cache.md dev docs](https://github.com/nextflow-io/nextflow/blob/master/docs/developer/nextflow.cache.md), [Improve cache debugging with -dump-hashes #4367](https://github.com/nextflow-io/nextflow/issues/4367)

### CWL (Common Workflow Language)

**Alive** as a spec (v1.1/v1.2 docs at commonwl.org), `cwltool` reference runner actively maintained.

**What it gives.** `cwltool --cachedir` + per-step `${HASH}.status` files; v1.1 added `WorkReuse` to
opt individual tools/steps in or out of reuse. Confirmed via docs + GitHub issue #493 (cwl-runner
re-executing cached jobs unexpectedly) that cache correctness has known rough edges, particularly
around tools whose outputs embed absolute file paths.

Cost to adopt: CWL is a JSON/YAML IR designed for portability across execution engines
(Toil, Arvados, etc.) — heavier abstraction than needed for a single-machine, single-user pipeline;
picking it only for the hash-cache would be adopting an interchange format for no interchange need.

Source: [CWL v1.1 Workflow spec](https://www.commonwl.org/v1.1/Workflow.html), [cwl-runner re-executes cached jobs #493](https://github.com/common-workflow-language/cwltool/issues/493)

### Dagster

**Alive** (docs.dagster.io, active — freshness-policy docs current).

**What it gives.** Explicit "staleness" as a first-class UI concept, not just a cache hit/miss:

> "A Dagster asset is considered stale if Dagster knows that its code or upstream data has changed,
> but the asset hasn't been materialized since then to incorporate those changes. Any asset that
> depends on a stale asset is also stale."

`op_versions`/`observation_fns` let you version an asset's *code*, and staleness is computed from
whether upstream versions changed — again, exactly the "did the checker's own logic change" property
— surfaced in a UI (Dagit) with states PASS/WARN/FAIL/UNKNOWN per a `FreshnessPolicy`. This is the
best *dashboard* answer found (better visual "immediately visible" story than Snakemake's CLI text),
at real cost: Dagster is a full orchestration platform (daemon/webserver, Python-decorator asset
graph, optional Dagster Cloud) — adopting it to track 20 document checks is materially heavier than
Snakemake for the same property.

Source: [Asset freshness policies | Dagster Docs](https://docs.dagster.io/guides/observe/asset-freshness-policies), [Just-computed SDAs show up as stale #11442](https://github.com/dagster-io/dagster/issues/11442) (a live bug report — confirms the feature is real and non-trivial to get exactly right even in Dagster itself)

### Airflow

Not independently fetched in depth — Airflow's scheduling model is time/trigger based (DAG runs on
a schedule or external trigger), not content-hash-based staleness detection by design; it is the
wrong shape of tool for "is this artifact stale relative to its input's content" and was correctly
deprioritized rather than researched further. **Documented negative result**, not an oversight: this
category is orchestration-of-schedules, not content-addressed caching, so it does not provide the
needed property natively (would require bolting on something like the above tools anyway).

---

## 5. Data/experiment versioning: DVC, MLflow, W&B

### DVC

**Alive** (dvc.org, active docs).

**What it gives — very close, as hypothesized, but with a real gap.** Fetched `dvc status` docs
directly:

> "`_changed deps_` or `_changed outs_` means that there are changes in dependencies or outputs
> tracked by the stage." Example output:
> ```
> matrix-train.p:
>     changed deps:
>         modified:  code/featurization.py
> ```

**This is the single clearest piece of evidence in the whole survey that a check's own script
counts as a "dep."** `code/featurization.py` — the *code*, not just data — is listed as a tracked
dependency in DVC's own official example, and its modification is what `dvc status` reports. That is
exactly "the checker's source changed, therefore stale," reported by name, with zero custom
tooling — DVC computes it from `dvc.yaml` stage definitions (`deps:`/`outs:`) plus content hashing
(MD5 by default) of everything listed.

`dvc dag` gives the visual dependency graph (structure only — confirmed by fetch: it does **not**
itself show live/stale status, that's `dvc status`'s job, they're complementary not overlapping).

Cost to adopt: low-to-moderate. One `dvc.yaml` with a `stage:` per check (`cmd:`, `deps:` = [document
+ checker script], `outs:` = [check's result file]). No daemon. `dvc status` becomes the single
command that answers "what's stale" instead of a human-maintained table. The DVC-specific overhead
(designed for large binary data + Git-LFS-style remote storage, `.dvc` files, `dvc add`) is mostly
avoidable if only the pipeline/stage feature (not the data-versioning/remote-storage feature) is
used — worth confirming stage-only usage doesn't force the storage layer on.

**Verdict: DVC's `dvc status` is confirmed, by direct fetch, to be extremely close to what he wants** —
tied with Snakemake as the two strongest candidates, and DVC's output format (a literal
`changed deps: modified: <path>` list) is arguably even more directly "immediately visible" than
Snakemake's prose reasons.

Sources: [dvc status docs](https://doc.dvc.org/command-reference/status), [dvc dag docs](https://doc.dvc.org/command-reference/dag)

### MLflow / Weights & Biases

**Alive**, both actively developed, both extremely popular in 2026 ML tooling comparisons.

**What they give: nothing relevant.** These are **experiment trackers** (log metrics/params/
artifacts per run, compare runs in a UI, model registry) — not build systems and not staleness
detectors. Neither computes "is this result stale relative to its current input," both assume the
human decides when to log a new run. Search results (multiple 2026 comparison articles) describe
their differentiators purely as UI/collaboration/model-registry features, never staleness or
cache-invalidation. **This is a documented negative result**, not a gap in research: wrong tool
category entirely, ruled out correctly rather than by omission.

---

## 6. `pre-commit` (the framework)

**Alive** (pre-commit.com, active).

**What it gives.** Confirmed via fetch of pre-commit.com root docs:
- `files:` — regex filter for which files a hook applies to.
- `always_run: true` — hook runs even with no matching files (needed for hooks that don't operate
  file-by-file, e.g. post-rewrite hooks).
- `stages:` — restricts a hook to specific git hook points (`pre-commit`, `pre-push`,
  `commit-msg`, plus a `manual` stage for explicit-only invocation).
- `pre-commit run --all-files` — force every hook against the whole tree regardless of what's
  staged; the manual "run everything now" escape hatch.

**What it does NOT give — confirmed negative result.** Fetch explicitly found no history/log
mechanism: "The documentation provided does **not** mention pre-commit maintaining a history or log
of which files each hook ran against or when hooks executed... no persistent audit trail of all hook
executions is documented." And no built-in detection of a hook that never fails: "No feature exists
for identifying hooks that may have become ineffective or redundant over time."

**Verdict:** pre-commit gives filtering/scoping (which hooks apply to which files) but is
**stateless between invocations** — it has no cache, no "ran against version X of this file,"
nothing that answers "is check N stale." It solves "which hooks should run on this file" (routing),
not "did this file change since the hook last ran" (staleness). Genuinely does not provide the core
property, contrary to a plausible-sounding assumption that a hook framework would.

Source: [pre-commit.com](https://pre-commit.com/)

---

## 7. Mutation testing as "a check on the checks"

**The concept he needs, stated precisely:** a check that has never produced a negative verdict on
real drift is not a check — it's decoration. Mutation testing tools exist for exactly this question,
but only for **code test suites**, not document/prose checks — an important scope gap to be honest
about.

### mutmut (Python)

**Alive** — GitHub shows 680 commits, active CI. Mutates production code, reruns the test suite per
mutation, reports "survivors" (mutations no test caught) — the code-level version of "check that
never fires."

Source: [boxed/mutmut](https://github.com/boxed/mutmut)

### cosmic-ray (Python)

**Alive** — PyPI + readthedocs show a release dated **2026-04-02**, actively maintained. Same
survivor-mutant model as mutmut.

Source: [cosmic-ray docs](https://cosmic-ray.readthedocs.io/)

### Stryker (JS/.NET/Scala family)

**Alive, actively releasing across sub-projects in 2026** — StrykerJS v9.6.1 (April 2026),
Stryker.NET 4.13 added Microsoft Testing Platform support (March 2026), VS Code plugin (Nov 2025).

### PIT / Pitest (Java)

**Alive** — v4.16.0, dated 2026-07-03 per a fetched comparison article; multiple 2026 tutorial/guide
articles confirm ongoing relevance as "the gold standard test coverage" tool for JVM mutation
testing.

### pytest-gremlins — the closest thing to "vacuous check detector," still code-scoped

**Alive** (291 commits, Python 3.11+, active). Fetched README:

> "Fast-first mutation testing for pytest. Speed that makes mutation testing practical for everyday
> TDD."

Injects bugs ("gremlins"), reports which mutations tests eliminate vs. which slip through.

### falsegreen — the one STATIC-analysis hit for "vacuous test," not mutation-based

**Alive** (149 commits, tagged release v0.9.2, on PyPI, GitHub Actions CI). Fetched README: AST-scans
pytest files for assertion-free/always-true/self-referential/mocked-unit-under-test patterns, 47
active codes (C1–C59 family). Explicitly confirmed: **C2 = "test with no assertion at all," HIGH
confidence, described as blocking**. This is a real, shipped, cheap **static pre-filter** for "this
test cannot possibly fail" — the nearest thing found in this whole survey to "audits a check suite
for checks that never fire," and it's cheaper than mutation testing (no test execution needed).

**Honest scope gap:** none of the five tools above operate on anything but a code test suite (a
`pytest`/JUnit/xUnit run with assertions). **No shipped tool was found that mutation-tests an LLM
agent-run prose check** (e.g., "does the citation-verification skill actually catch a fabricated
citation, or does it rubber-stamp everything?"). That would have to be hand-built: deliberately
corrupt the document (inject a fake citation, break a citation's page number, flip a claim) and
confirm the specific check flags it — the same *idea* as mutation testing, applied manually because
no tool ships this for prose/LLM checks. This is the one property in the whole survey that is
**genuinely empty** as a shipped tool, not merely heavy to adopt.

Sources: [boxed/mutmut](https://github.com/boxed/mutmut), [cosmic-ray docs](https://cosmic-ray.readthedocs.io/), [vinicq/falsegreen](https://github.com/vinicq/falsegreen), [mikelane/pytest-gremlins](https://github.com/mikelane/pytest-gremlins)

---

## 8. Registration/strictness patterns ("unregistered = ERROR, not silent skip")

**pytest `--strict-markers` / `--strict-config`.** Confirmed via docs + a live GitHub issue: "When
the `--strict-markers` command-line flag is passed, any unknown marks applied with
`@pytest.mark.name_of_the_mark` will trigger an error"; registering markers in config is required to
avoid the error. Also confirmed a **currently-open regression** (issue #14442, pytest 9): "The
`OverrideIniAction` compatibility code added in pytest 9 does not play nicely with `addopts`, and
strictness options configured that way now get silently ignored" — a sharp, on-topic irony: the
*strictness-enforcement flag itself* was found silently not enforcing, in the exact "check that
looks like it's protecting you but isn't" shape this whole research is about.

**mypy `--strict`, ESLint `--max-warnings 0`, `cargo deny`** — not independently re-fetched (well
known, stable, unambiguous flags); the general shape confirmed by the pytest case transfers directly:
these all convert "thing not declared/allowed" from a silent no-op into a nonzero exit code. The
generalizable pattern for `PIPELINE-STATUS.md`: **a check with no matching hash-verified entry for
the current document version should be a hard error at pipeline-run time, not a stale ✅ left in
place** — this is a policy shape, not a specific tool to adopt; every task runner/build tool above
(Snakemake, DVC, Task) already enforces this by construction (no stale cache entry is ever silently
reported as fresh — it's either a hash match or it reruns).

---

## 9. Provenance/attestation: in-toto, SLSA, sigstore

**Alive**, both frameworks under active CNCF-adjacent development in 2026.

**What they give.** in-toto: signed attestations per pipeline step, recording "who did what, when,"
chained so a consumer can verify the full step sequence occurred as declared. SLSA: provenance levels
(SLSA 1–4) for build integrity; sigstore: keyless signing + a public transparency log for attestations.

**Verdict on fit — confirmed by direct search, not assumed: enterprise/supply-chain scale, not
single-user-document scale.** Two independent points found:
1. Adoption-barrier research (a qualitative study of 1,523 GitHub issues across 233 repos, cited by
   a fetched search result) found practitioners cite "complex implementation" and "unclear
   communication" as the dominant SLSA adoption barriers — i.e., real projects with CI teams find it
   heavy, which is a strong signal it's disproportionate for one person and twenty markdown checks.
2. A direct critique surfaced: "SigStore creates a transparency log that makes build information
   public, but enterprise software is closed-source and built for self-use, and disclosing its build
   information to the general public cannot be tolerated" — the mismatch runs in *both* directions
   (too heavy for solo use; also structurally wrong for private documents, since sigstore's default
   posture publishes attestations to a public log — the opposite of what a private paper pipeline
   wants).

**This is a genuinely empty fit** for this problem, correctly ruled out rather than under-researched:
the property "step X ran on input hash H, producing output hash H′, signed" is real and exists, but
every shipped implementation is scaled and hardened for adversarial multi-party software supply
chains (verifying a *stranger's* build didn't get tampered with), not for one person tracking their
own document-check pipeline where the trust model is "do I, myself, trust my own hash computation."
Borrowing only the *idea* (a signed/hashed record chaining input→check→output) is sound; borrowing
the *tooling* is not.

Sources: [SLSA Provenance Part 3: Adoption Challenges](https://www.legitsecurity.com/blog/slsa-provenance-blog-series-part3-challenges-of-adopting-slsa-provenance), [in-toto/attestation README](https://github.com/in-toto/attestation/blob/main/README.md)

---

## Ranked table

| Property we need | Shipped thing that provides it | Adoption cost | Verdict |
|---|---|---|---|
| Content hash (not timestamp) of the **document** as a dependency | DVC (`deps:`), Snakemake (`input:`), Task (`sources:`, `method: checksum`), Bazel/Nix/Buck2 (action/derivation inputs), Nx/Turborepo/moon (task inputs) | Low (Task) → very high (Nix) | **ADOPT** — trivially available in the low-cost tier |
| Hash of the **checker's own script/prompt itself**, so editing the check invalidates its own cached result | Confirmed explicitly: Nix (`.drv` hash includes builder script — even a comment changes the store path), Bazel (action key includes "the command to be executed"), Snakemake (FAQ: rerun triggers include "the code of the rule"), DVC (own docs example literally lists `code/featurization.py` as a `changed dep`) | Low (DVC, Snakemake) → very high (Nix, Bazel) | **ADOPT** — DVC or Snakemake gives this without a build-system migration |
| At-a-glance "what's stale and why," readable by a human, no digging | Snakemake `--dry-run --reason` (prose reasons per rule); DVC `dvc status` (`changed deps: modified: <path>` — arguably the single closest match to "marks... inline"); Dagster UI (PASS/WARN/FAIL/UNKNOWN per asset, richest visual, heaviest platform) | Low (DVC/Snakemake CLI text) → high (Dagster full platform) | **ADOPT** — DVC's output format is close to literally what was asked for |
| Fast preview without running anything (`--dry-run`-equivalent) | Snakemake `--dry-run`; Turborepo `--dry=json` (confirmed to sometimes disagree with real run — issue #9038/#9044); Nx `print-affected` (confirmed to sometimes diverge from run-time hash — issue #16153); Task's checksum-based skip is itself near-instant | Low–moderate | **ADOPT-PARTIAL** — the preview exists everywhere but two of three JS tools have open bug reports about the preview lying, ironically the same disease being solved for |
| Routing: which checks apply to which files, cheap vs. expensive tiering | `pre-commit` `files:`/`stages:`/`always_run` | Low (already YAML-shaped, easy to add) | **ADOPT-PARTIAL** — good for routing, contributes nothing to staleness itself (confirmed no run history/log exists) |
| "Declared-but-never-fires" audit of the checks themselves | falsegreen (static, code-only), mutmut/cosmic-ray/Stryker/PIT/pytest-gremlins (mutation, code-only) | Low (falsegreen, if checks were pytest) | **ADOPT-PARTIAL** — real and cheap, but only reaches the subset of checks that are code with assertions; the LLM-agent prose checks are out of scope for every one of these tools |
| Mutation-style "does this specific prose/LLM check actually catch a real defect" audit | — | — (would be hand-built: seed a known defect into the doc, confirm the check flags it) | **GENUINELY EMPTY** — no shipped tool found; this is the one place the hypothesis "solved problem" does not fully hold |
| Unregistered-thing-is-an-error strictness pattern | `pytest --strict-markers`, `mypy --strict`, `eslint --max-warnings 0` (pattern only; also caught pytest 9 silently *breaking* this exact flag — issue #14442) | N/A — a policy shape, not a separate tool | **ADOPT** as a design principle inside whichever runner is chosen, not as a separate dependency |
| Cryptographic step-provenance (input hash → step → output hash, signed) | in-toto / SLSA / sigstore | Very high, and wrong trust model (publishes to a public log) for a private paper pipeline | **GENUINELY EMPTY** for this scale — correctly ruled out, not under-researched |
| ML-experiment "which run used which data/params" | MLflow / W&B | N/A | **GENUINELY EMPTY** — wrong tool category, confirmed by direct research (no cache-invalidation or staleness feature exists in either) |
| Time/schedule-based DAG orchestration | Airflow | N/A | **GENUINELY EMPTY** for this property — Airflow schedules; it does not compute content-hash staleness by design |

---

## The one paragraph: smallest adoption that kills the lying-status-table problem

**DVC's pipeline feature (`dvc.yaml` + `dvc status`), used for its stage-hashing alone, is the
smallest adoption that fully replaces `PIPELINE-STATUS.md` with a computed answer.** Define one
`dvc.yaml` stage per check: `cmd:` is the check's actual command (script or LLM-agent invocation),
`deps:` lists both the target document(s) *and* the checker's own script/prompt file, `outs:` is
wherever the check writes its verdict. From that point, "is check N stale" is never declared by a
human again — `dvc status` computes it from content hashes of everything in `deps:`, and its own
docs example already demonstrates exactly the wanted case (editing the checker's code shows up as
`changed deps: modified: <checker-script>`, indistinguishable in the tool's eyes from editing the
document itself). No daemon, no new language, no monorepo restructuring, and DVC's heavier
data-versioning/remote-storage machinery can be ignored entirely if only the pipeline/stage feature
is used. Snakemake is the close second choice and arguably the better long-term fit *if* the pipeline
grows real DAG structure between checks (some checks depending on others' outputs) or needs the
prose-level `--reason` explanation text rather than DVC's terser diff-list — but for the immediate
goal of "kill the lying table with the least new surface area," DVC's stage-and-status pair is the
smaller, faster adoption. Note explicitly what neither tool solves: whether an LLM-agent-run check is
actually *testing* anything (the vacuous-check problem) is not addressed by hashing — that remains
the one genuinely unsolved piece, requiring a hand-built mutation-style probe per check type.
