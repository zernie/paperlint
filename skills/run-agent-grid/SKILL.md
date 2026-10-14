---
name: run-agent-grid
description: "Run a paid or counted agent experiment grid end to end — units × arms × seeds (× agent stacks), one agent CLI run per cell in a fresh working copy, scored by an outcome oracle — without the failures that silently spoil one: an unapproved or hand-picked sample, a timeout that kills a slower model, two drivers sharing a working copy, secrets in transcripts, a classifier that mislabels outcomes, a session cap that kills the run, results lost from scratch space. Use when a study design exists and you are about to spend money or count runs: the registry and approval gate, the sandbox and secret probe, the smoke per model, the locked detached driver, the overlap audit, hand labels and the commit of finished runs. Ships grid-guard.mjs (lock, gate, overlap audit, env probe, key scan, pre-commit). Composes with build-benchmark (the design, upstream), build-label-page (hand labels) and osf-artifact-upload (the artifact)."
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

<!-- vigiles:sha256:c048620377d3ad6c compiled from skills/run-agent-grid/SKILL.md.spec.ts -->

# run-agent-grid — running a counted agent grid without spoiling it

**What a grid is here.** Units under test × conditions (arms) × seeds, repeated per agent stack
(model + CLI). Each cell is one agent CLI run in a fresh working copy of the unit; a scorer reads
what the run left behind, and an outcome oracle decides the cell's result. `build-benchmark` designs
the study and the artifact; this skill is the **operational procedure for running it**, from the
first paid call to the last committed run.

Every rule below was paid for by a failure. Each is stated with that failure and with what HOLDS it:
a refusal in `scripts/grid-guard.mjs`, a commit hook, a probe — or, said plainly, **prose only**,
which means it holds only as long as someone reads this. The full catalog, one entry per failure:
[`references/failure-catalog.md`](references/failure-catalog.md). The registry, the attempt ledger
and a driver loop that calls the guard: [`references/registry-and-ledger.md`](references/registry-and-ledger.md).

**Exit codes of every guard command:** 0 allowed or clean · 1 refused or a finding · 2 usage ·
3 (`gate` only) the cell is already counted, skip it.

## The order — each gate is passed before the next phase starts

### 1. The registry: what may be measured, written as data (catalog 1, 3, 14)

- Every measurement is a row in a **machine-readable registry** (`grid.json`): each unit with its
  role (`counted`, `smoke`, `excluded`), the author's requirement on it **verbatim**, the arms, the
  seeds, the models, the budget cap. A requirement that lives only in a chat or a design note is not
  a requirement: a driver cannot read it, and a whole grid can run on one easy, hand-picked unit.
- **The frame is the whole population** of the measured kind. Never "where our instrument can
  fire": that filter shrinks the frame to trivial units. Allowed exclusions are listed per unit, each
  with a reason, and counted. The draw is seeded, its seed and script committed **before anyone looks
  at the drawn units**; a stratified draw is proportional to the frame.
- **Only the committed registry allows a run.** An added model, seed or arm is a dated addendum,
  committed before its first run. Report models as columns, never pooled.
- **Held by:** `gate` reads the registry from `HEAD` and refuses when the working copy differs from
  it, when the cell is not declared, when an excluded unit has no reason, when a counted run has no
  draw seed. **Prose only:** that the frame is the whole population, and that the draw is
  proportional; the guard sees the registry, not the population behind it.

### 2. The author's approval of the drawn units (catalog 2)

- The **author** approves the drawn units — in their own words, with the time and the channel
  (chat, message, review comment) recorded in `approval`. The agent that designed or drew the sample
  never fills this field, not even to "save a step".
- **Held by:** `gate` refuses a counted run unless `approval.by` equals the registry's `author` and
  `at` and `channel` are filled. **Prose only:** who typed it — the guard cannot tell the author
  from an agent writing the author's name. Make it reviewable: the approval lands in its own commit,
  quoting the author's message.

### 3. The sandbox: secrets out, tools in, per unit (catalog 8, 9, 10)

- The agent's environment **excludes secrets by name pattern**, and a names-only probe passes before
  any model call. Transcripts capture environment dumps; a secret in the environment ends up in a
  committed transcript.
- The same probe proves that **what the agent needs still works**: an exclude-by-pattern policy also
  strips variables git needs (`GIT_CONFIG_KEY_n` matches "KEY"). Prove git commits inside the sandbox.
- **Per unit, with no model call:** the tools the agent is meant to use are visible inside the
  sandbox, the instrument fires on the pinned state of the unit, and it accepts the reference fix.
  A shared tools directory that is invisible inside the sandbox turns every run of an arm into a
  run without the tool.
- **Held by:** run inside the sandbox, as the agent would run —

  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs env-probe --git
  ```

  It prints secret-looking variable NAMES (never values) and exits 1; `--allow NAME` accepts one by
  name after you have looked at it. `gate` refuses a counted unit without `proof` (`toolVisible`,
  `firesOnPinned`, `acceptsReference`, all `true`). **Prose only:** how the proof is taken — the
  three facts are recorded by your proof script; the guard only refuses their absence.

### 4. The smoke, per agent stack (catalog 5, 13)

- Before each model's grid: **one run per arm**, each **read end to end** — the transcript, the diff,
  the scorer's output — not only its exit code. A timeout fit for one model kills a slower one
  mid-task, and a killed run reads as a failure of the arm.
- From the smoke, write into the registry, per model, `smoke.timeoutSec` and `smoke.costPerRun`
  (measured, with reserve), and commit it **before the grid**. A model can cost a multiple of its
  planned price; the cap and the stop rule are written down before the first counted run.
- **Held by:** `gate` refuses a counted run on a model without `smoke.timeoutSec` and
  `smoke.costPerRun`, hands the driver `timeoutSec` in its output, and refuses when the spend in the
  ledger plus the next run's cost would pass `budget.cap`. **Prose only:** that the smoke runs were
  actually read.

### 5. The run: locked, detached, resumable (catalog 6, 7, 12, 13)

- **One lock per working-copy root.** Two drivers on one scratch path delete each other's trees;
  one crashes, the other's runs are silently contaminated. A second concurrent driver gets **its own
  root**.

  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs lock <root> --owner <driver-id> --pid $$
  node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs release <root> --owner <driver-id>
  ```

  The lock is a file beside the root. A live holder → refused. A holder whose process is gone on
  the same host → taken over, and said so. A holder on another host → refused (it cannot be judged).
- **Before every cell, ask the gate** and obey its exit code; 3 means the cell is already counted —
  skip it. That makes a killed driver resumable: run it again and it continues.

  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs gate --registry grid.json --ledger attempts.jsonl --unit <u> --arm <a> --model <m> --seed <s>
  ```

- **Never delete shared inputs from a step.** Templates, fixtures and pinned states are read-only
  (`chmod -R a-w` them); a packing step that deletes what it packed removes what another driver
  still reads. **Prose only**, held by file permissions where you set them.
- **Run the driver detached** (`setsid nohup … &`, its log to a file), never as a task tracked by
  the agent session: a session's time cap kills a long grid. A separate waiter (a scheduled wake-up,
  a loop that polls the ledger) brings the session back. **Prose only**; the resume is mechanical.
- The driver appends a ledger line when an attempt starts and another when it ends (same `attempt`
  id, `root`, `start`/`end`, `status`, `cost`). Format: `references/registry-and-ledger.md`.

### 6. After any incident — and before reporting — the overlap audit (catalog 6)

```bash
node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs overlap attempts.jsonl
```

Lists every pair of attempts that shared a root at the same time (an attempt with no end overlaps
everything after its start), where at least one is counted. Each contaminated attempt is marked
`"status": "harness-error"` — the record is **kept**, not deleted, and not counted — and its cell
runs again as a **new** attempt. Run it after any crash, kill or harness change, and before the
numbers are reported.

### 7. Scoring and labels (catalog 4, 11)

- **A check reads every stratum's expectation file.** When a new stratum's expected values live in a
  second file, a proof or precondition check that reads only the first reports false FAILs. Load
  expectations through one function that enumerates them, and fail when a unit's stratum has none.
  A precondition failure is investigated before it is trusted — either way. **Prose only.**
- **Every run whose outcome is not mechanically certain is read in full and labelled by hand.** An
  automatic outcome classifier misses classes (a deferral phrased without a question mark); its
  label is a pre-sort, and the disagreements between it and the hand labels are reported. Use
  `build-label-page` for the labelling. **Prose only.**

### 8. Commit finished runs, often (catalog 15, 8)

- Results in scratch space vanish. Commit **finished** runs — those with a completion record —
  frequently; never a half-written run folder.
- Every committed artifact is scanned for key-shaped strings, by a pre-commit hook:

  ```bash
  node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs precommit --runs runs --done done.json
  ```

  It reads the **staged** content (the index is what commits), refuses key-shaped strings by file and
  line without printing them, and refuses a staged run folder that has no completion record. Before
  an artifact leaves the repository: `node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs scan-keys <dir>`.
- **Report the spend**: total, per model, against the cap.

## When something goes wrong mid-grid

Stop the driver; do not fix forward on a running grid. Write the incident down (what, when, which
attempts), run the overlap audit, mark contaminated attempts, fix the harness, re-run the smoke for
any stack the fix touched, then resume. A harness change is an addendum like any other.

## Compose with

- **build-benchmark** (upstream) — the design, the statistics and the artifact this run feeds.
- **build-label-page** — the hand labels of every run whose outcome is not mechanically certain.
- **osf-artifact-upload** — the artifact, after `scan-keys` is clean.
- An **independent refutation pass** (a second agent framed to refute, not to confirm) on the
  registry and the smoke before the first counted run.
