---
name: build-benchmark
description: Design and run the empirical study behind a measurement paper, and ship a reviewer-proof reproduction artifact. Covers the study design (invert the pitfall you're critiquing), honest statistics (paired/Welch t, CIs, Bonferroni, small-n spread as a result, not noise), a structural bound that outlives the specific artifacts tested, and a self-checking artifact that recomputes every headline number and exits non-zero on drift. Use when the paper's contribution is a way to MEASURE something and you're building the evidence + the thing reviewers will run. Compose with research-ideate (upstream), draft-paper, pc-panel-review (its artifact-runner executes this), submit-paper.
context: fork
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

<!-- vigiles:sha256:067ada6f8aa44d5b compiled from skills/build-benchmark/SKILL.md.spec.ts -->

# build-benchmark — the study + the artifact reviewers can run

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs build-benchmark <paper-dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

A measurement paper is only as strong as the artifact a reviewer can `cd` into and re-run. This skill
covers both halves: the study design that makes the finding true, and the self-checking artifact that
makes it *verifiable*. The contribution is the **method**, not the one tool you happened to test — build
so both survive review.

## 0. 🔴 READ THE STATED CLAIM FIRST — and refuse to design without it

**Before designing anything, open `<paper-dir>/PIPELINE-STATUS.md` and read row `frame`** — the one
paragraph saying what this paper will claim (written by `argument-arc` in **frame mode**, in SETUP).

🔴 **If `frame` is empty, stop. Do not design the study.** Go run `argument-arc` frame mode, get the
paragraph, then come back. This is a refusal, not a recommendation:

- **The frame decides which results matter.** A study designed without a stated claim measures
  whatever the available harness can already see, and the claim gets fitted afterwards to whatever
  came out. That is backwards, and it is expensive in exactly one direction — **reframing after the
  data is collected is how runs get thrown away**, observed on `compile-rules-2026`.
- **The claim is what makes §1 answerable.** "What would make the critiqued pitfall impossible here?"
  has no answer until you have written down what you are claiming.
- **It costs a paragraph and it saves a study.** There is no version of this trade that favours
  starting the runs first.

Cross-check the claim against the prevention rule in the `CLAUDE.md` beside the papers: if the claim is
about *preventing* something, write the one sentence saying **what physically stops the bad outcome in
the experimental arm**. "There is different text in it" means you are measuring persuasion, not
prevention, and the design is wrong before a single run.

## 1. Design that inverts the pitfall you're critiquing

The strongest measurement papers are a corrected version of the mistake they name. Pick the design that
is the *inverse* of the flaw:

- **Critiquing a proxy metric?** Measure the real thing, gated on correctness. The cost study is a
  **cost-aware, correctness-gated A/B**: two arms × two tools, every run scored pass/fail first, then
  the *dollar* bill compared — because the whole point was that the token-proxy and the dollar disagree.
  Never let a cheaper-but-broken run count as a win; correctness is the gate before cost is even read.
- **Measuring something that runs untrusted/destructive code?** **Parse, don't execute.** The guard eval
  is a **SAFE STATIC evaluation**: transcribe each guard's predicate by hand and reason over it against a
  disaster battery — never run the guard or the attack. See Safety below; this is non-negotiable.

Write the design as the answer to "what would make the critiqued pitfall impossible here?"

## 2. Honest statistics — the part reviewers attack first

- **Paired where the design is paired; Welch where variances differ.** Use a **paired-t** when the same
  task is run under both arms (blocks task difficulty); use **Welch's t** for unequal-variance unpaired
  comparisons. Do NOT label a test "paired" unless the pairing is real — a mislabeled test is a blocker.
- **Report CIs and k/n, never bare percentages over tiny n.** "2/10 guards covered" beats "20% coverage";
  "median 2/10 (range 0–5)" beats a single mean. A percentage over n=10 hides the n.
- **Report the SOURCE CONCENTRATION of a mined corpus — the single-source share is a number, not a
  caveat.** For any corpus mined from several repositories / trackers / vendors, compute and print
  **n per source and the max single-source share**, and put it in the paper (a table row or one
  sentence), not only in Threats. A corpus advertised as covering *k* sources but dominated by one is
  a top reason a mined-corpus paper gets rejected, and it is invisible to every other check — the
  totals, the percentages and the internal consistency all pass, because the cut was simply never
  made. **Mechanical leg:** the artifact emits `source, n, share` for the corpus and the top share
  appears in the paper. If the top source exceeds ~50%, say so in the abstract's scope or narrow the
  claimed population to what you actually sampled.
- **Inter-rater agreement is void if the rater was trained by, and scored against, the codebook's
  author.** Agreement with the person who wrote the scheme measures *trainability*, not construct
  reliability — it is the human form of the failure this suite already names in code (a checker and
  its self-test written in one pass by one model). Requirements, all mechanical: (i) reference labels
  come from a rater who did **not** author the codebook and did **not** see the hypothesis; (ii)
  report the agreement **denominator as a share of the full corpus** — "κ=0.93 on 69 of 547 (12.6%)",
  never a bare κ; (iii) use a coefficient that matches the design — Cohen's κ is single-label, so
  multi-label coding needs per-label κ or Krippendorff's α; (iv) treat **κ = 1.00 as a red flag to
  investigate, not a result to report** — perfect agreement on a many-category scheme usually means
  the validation set was easy or calibration was de-facto joint coding.
- **Correct for the family.** Multiple comparisons across a family of tasks/tools → **Bonferroni** (or
  state the correction you used). Report it; don't p-hack the one significant cell.
- **Small-n spread is a first-class result, not noise.** If five trials of the same task swing wildly,
  that variance IS the finding (the thing under test is unstable) — report it, don't average it away.
- Repeated trials: fix trial count up front (e.g. per-task × trials × arms × tools), report the full n,
  and treat every run — including failures — as data.

## 3. A structural bound that outlives the artifacts

Numbers about today's tools rot. A **mechanism or structural bound** doesn't. Give the paper one claim
that holds regardless of which specific tool/version you measured:

- the cost study's bound: token-efficiency and dollar cost are decoupled by pricing structure, so a
  token-optimizing tool *cannot* be assumed to cut the bill — a property of the pricing, not the tool.
- the guard eval's axes: **mutation-evasion** (does a trivial rephrase of the attack slip the guard?),
  **held-out generalization** (does coverage transfer to commands the guard wasn't written for?), and
  **per-step causal ablation** (remove one guard step, measure the coverage delta — which step actually
  does the work). These are properties of the *defense class*, reusable against the next guard set.

State the bound explicitly; it's what makes the paper a benchmark and not a product review.

## 4. Build a SELF-CHECKING artifact

This is the single biggest accept-probability lever, and pc-panel-review's artifact-runner WILL execute
it. Do **not** restate the requirements here — build to the canonical checklist:

→ **`paper-pipeline/references/artifact-checklist.md`** (self-recompute from raw data, exit non-zero on
drift, stdlib-only, no network, a README that maps each paper-number to where it prints, LICENSE, honest
badge scope, de-anon scanned).

The load-bearing property: each script **recomputes** every headline number from raw data and
**self-asserts** — exit non-zero the moment a cell drifts from the paper (`reproduce.py` on the cost
study; `evaluate.py`/`mutate.py`/`reproduce.mjs`/`ablation.mjs` on the guard eval). Derive from base
fields, never echo a stored/precomputed field — a reviewer calls that circular and they're right. For
de-anonymization before hosting, follow **`paper-pipeline/references/anonymization.md`**; host per
`submit-paper` (OSF anonymized view-only link; automation at `papers/osf_upload.py`).

## Safety — never execute untrusted or destructive commands to measure them

If the object of study is code that could delete, exfiltrate, or run attacker-controlled input, you
**transcribe and parse its predicate** — you never execute it, and you never run the attack against it.
The guard eval scores 46 real command-guards by reading each guard's logic against a 10-command disaster
battery statically; nothing in the battery is ever run. A benchmark that has to detonate the payload to
score it is a liability, not evidence. Same rule inside the artifact: no network, no shelling out to the
thing under test.

## Validate the transcription against real-code execution, not just a blind re-derivation

When you score third-party code by **transcribing its logic** (e.g. a guard's regexes) into your own
evaluator, a *blind re-derivation* (a second person re-reads the code and re-transcribes it) only checks
transcription-vs-human-reading — it does **not** check transcription-vs-real-behavior. There's a cheap,
zero-execution-risk way to close that gap: **run the actual scraped code against its REAL agent input
contract** and reconcile its live verdict with your static prediction.

- **Feed the real contract, not a bare string.** For Claude Code PreToolUse hooks, the command arrives as
  a **JSON envelope on stdin** with the command at `.tool_input.command`. Feed each battery/benign command
  as a **string inside that envelope** to the real guard's stdin and read its verdict (exit 2 = block; or
  stdout JSON `permissionDecision` deny/ask/block). The command is **never executed** — the guard only
  inspects the string.
- **SAFETY: sandbox + stub-PATH first.** Run inside a throwaway sandbox with a **stub PATH** (fake
  `rm`/`dd`/`git`/`curl`/… → `exit 0`) as defense-in-depth, so even a guard that shells out can't do
  damage. Invoke the real interpreters by absolute path.
- **Reconcile per code×input pair.** Every mismatch between live verdict and static prediction is a
  **finding** — either a transcription nit to fix, or a real behavior your static model structurally
  cannot capture.

**Concrete payoff (the motivating example):** this method surfaced a **"whole-stdin confound"** — a
widely-copied guard that greps its **entire raw stdin** rather than the extracted command. The JSON
envelope's trailing bytes defeated its anchored `rm …/$` rule, so it **FAILED TO BLOCK `rm -rf /`** live,
even though it "blocked" the bare string. A pure transcription/static model can't see this; only
real-code-through-real-contract execution reveals it.

Before submitting, verify the artifact you built with the reviewer-side reproduction protocol:
**`references/adversarial-cold-repro.md`** (cold re-run, three-way reconcile, robustness attacks).

## Record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record build-benchmark <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record build-benchmark <paper-dir> ABSTAINED <reason> "<one line>"
```

🔴 **There is no PASS.** An artifact that recomputes every headline number and exits 0 has produced
no finding; it has not certified the study. Record the absence, do not name it a success.

**FINDING** — `<count>` numbers did not reproduce, or reproduce only with caveats; `<report-path>`
is the artifact output. Add `--blocking` for the §0 refusal: `frame` is empty, so the study was not
designed.
**ABSTAINED** — `no-witness`: the artifact ran and every number reproduced. `input-missing`: the
raw data is not in the repo. `crashed`: the harness itself died.

🔴 That §0 refusal is a **finding, not an aborted run** — it is a fact about the work, so it is a
FINDING and not an abstention. Record it and stop. A study that was never designed leaves exactly
the same silence as one that is still running, and the difference costs a week to rediscover.

🔴 **THREE MECHANICAL CHECKS FILE UNDER THIS SKILL** and each has its own ledger row:
`build-benchmark/check-provenance`, `build-benchmark/arm-permutation`,
`build-benchmark/delivered-pdf` (see `.claude/skills/paper-pipeline/scripts/run-mechanical.mjs`). Until 2026-08-10 the
ledger keyed on the SKILL, so a clean run of one erased a finding of another from every derived
view — which is why two of the three sat unwired. This block records the JUDGEMENT pass, under the
bare key `build-benchmark`; never file a mechanical result here.

## Compose with
- **argument-arc (frame mode)** — 🔴 **hard input.** Owns row `frame`, the stated claim. No `frame`, no study.
- **research-ideate** (upstream) — supplies the contribution and the pitfall to invert; this skill turns
  it into evidence.
- **draft-paper** — the study's stats, bound, and artifact-number table feed Methods/Results/Availability.
- **pc-panel-review** — its artifact-runner reviewer `cd`s in and re-executes every harness; build so
  that pass is deterministic.
- **submit-paper** — hosts the scrubbed artifact anonymously and links it in Availability.

## Provenance
- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number":** a cost-aware, correctness-gated A/B harness
  over 140 runs (7 tasks × 5 trials × 2 arms × 2 tools); Welch t + paired-t CIs + Bonferroni; the finding
  that token-efficiency tools don't cut the dollar bill. Artifact = a stdlib-only `reproduce.py` that
  recomputes every headline number from raw data and exits non-zero on drift.
- **AISec 2026 @ ACM CCS — "Safety Theater":** a 10-command disaster battery against 46 real
  command-guards, SAFE STATIC evaluation (transcribe each predicate, never execute), median coverage
  2/10, plus mutation-evasion, held-out generalization, and per-step causal ablation axes. Artifact =
  `evaluate.py`/`mutate.py`/`reproduce.mjs`/`ablation.mjs`, each self-asserting on run. Both artifacts
  are hosted anonymized on OSF.
