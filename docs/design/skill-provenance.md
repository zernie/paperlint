# Where each skill came from

Each skill's provenance: the papers and incidents it was distilled from. The skills keep only their
instructions.

## analyze-sibling-paper

Built from the **AISec 2026 GateBench** run: `verify-citations` flagged **AgentTrust** (yang2026agenttrust,
arXiv:2606.08539) as making the same lexical-vs-semantic split the paper's spelling→grammar→effect framing
builds on — the sharpest "isn't this just X?" in the paper. Citing it from the abstract was not enough to
know whether the framing was a repackaging; only a deep read of the actual paper, classified by
contribution type (their trust-_system_ vs our _measurement + benchmark + existence result_) and dated
against submission, could settle the delta and produce the head-on positioning clause. That is exactly
the workflow this skill encodes.

**Extended 2026-07-29** — _What Breaks When LLMs Code?_ (arXiv:2605.30777) was cited into the
`the reference paper` introduction **from its abstract**, and a card was written saying so. Two gaps
surfaced immediately: the full text was never read (so the "no scoop" verdict rested on an abstract),
and its reference list — assembled by authors who had just screened 68,816 papers across 22 venues —
was never opened at all. Both are now steps 1–2, and both are machine-checked in the saved card, because
the previous version of this rule already said "read the paper, not the abstract" in prose and that did
not stop it happening. Prose isn't policy.

## argument-arc

Built 2026-07-30 after a full-day rewrite of `the reference paper` in which the author said the same
thing five times — _"does not guide the reader sequentially through the ideas, but simply throws a bunch of
different ideas, references, and benchmarks at them"_ — and got five local edits in reply. The pipeline had a skill
for length, a skill for sentences and a skill for defects; the question _does this paper carry the
reader to one conclusion_ belonged to nobody, and that is the one that failed.

## build-benchmark

- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number":** a cost-aware, correctness-gated A/B harness
  over 140 runs (7 tasks × 5 trials × 2 arms × 2 tools); Welch t + paired-t CIs + Bonferroni; the finding
  that token-efficiency tools don't cut the dollar bill. Artifact = a stdlib-only `reproduce.py` that
  recomputes every headline number from raw data and exits non-zero on drift.
- **AISec 2026 @ ACM CCS — "Safety Theater":** a 10-command disaster battery against 46 real
  command-guards, SAFE STATIC evaluation (transcribe each predicate, never execute), median coverage
  2/10, plus mutation-evasion, held-out generalization, and per-step causal ablation axes. Artifact =
  `evaluate.py`/`mutate.py`/`reproduce.mjs`/`ablation.mjs`, each self-asserting on run. Both artifacts
  are hosted anonymized on OSF.

## camera-ready

Both portfolio papers are anonymized-for-review and **defer de-anonymization + the public artifact to
camera-ready by design**: AgenticDev "Measuring the Wrong Number" (submitted, camera-ready 28 Aug if
accepted) and AISec "Safety Theater" (ships an anonymized artifact; hook names anonymized; responsible
disclosure to named maintainers owed before any de-anonymized public release). ORCID is identical
across both so every indexed version resolves to one researcher.

## cold-read-diff

Built 2026-08-05, the day before the `the reference paper` deadline, after the corpus owner read the built PDF and
found eleven unreadable passages in twenty minutes — none of which any automated check had flagged,
and several of which had been introduced that same morning by fixes to other automated checks.

## draft-paper

- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number."** The thesis IS the construct-validity frame:
  the field optimizes a metric that isn't the thing anyone cares about. The method (how to measure the
  _right_ number) is the contribution; the tool verdict is just the demonstration. Its "what we do NOT
  claim" paragraph and lower-bound-not-point-estimate threats framing are what moved it through review.
- **AISec 2026 @ ACM CCS — "Safety Theater."** A security-venue measurement paper: a defense that
  _looks_ like safety without measurably being it. Needs the explicit threat model + ethics/disclosure
  sections above, and dunks on the _defense pattern_, never the maintainers who shipped it — the
  credit-the-humans rule is load-bearing at a top-tier security venue where a hostile framing draws a
  hostile review. Both papers win on precise claim-sizing and an honest threats section, not on the
  size of the effect.

## extend-paper

The AgenticDev 2026 "Measuring the Wrong Number" workshop paper's **planned** extension to **MSR 2027**
(deadline ~Oct 23, 2026) or **NeurIPS 2027 Evaluations & Datasets** (~May 2027) — a second, stronger,
higher-prestige indexed publication. AgenticDev's CFP
explicitly invites journal extensions; the same ORCID links the workshop paper and its extension.

## find-venue

The **AgenticDev 2026 @ ASE** venue decision was made by a **9-agent analysis** that checked every open
venue against this exact rubric. It **kept AgenticDev** — nothing open beat it on fit × archival ×
timeline: NeurIPS Eval had already **closed**, and FSE/MSR each needed a **full paper** (wrong type /
too much scope for the deadline). The prestige upgrade was deliberately deferred to an **extension to
MSR/NeurIPS 2027**, not a switch — proving the rule: ship the best-fit archival venue open now, extend
later. **AISec 2026 @ ACM CCS** confirmed the archival-weight logic at a top-tier security bar. Both
papers are indexed proceedings; neither was down-ranked for the workshop's newness.

## paper-status

Built 2026-08-04, the day before the `compile-rules-2026` deadline, after the author asked for paper status
for the fourth time in one session and pointed out it should be a command: _"I ask this so often... there should be a skill"_. He was right, and the two things the skill measures first are the two
things chat had most recently gotten wrong.

## pc-panel-review

- **AgenticDev 2026** (2026-07-12): 3 lenses (stats / practitioner / artifact-runner) + chair. Caught
  what two prior single-lens rounds missed — a paper↔artifact mismatch ("raw 140-run data" vs shipped
  per-arm aggregates) and a mislabeled "paired" test, both flagged by ≥2 reviewers. Round→confirm:
  ~85%→90%.
- **AISec 2026 @ CCS** (2026-07-13): same shape at a harder (top-tier security) bar. The artifact-runner
  ran all four harnesses AND stress-tested the release gate (planted a leak, confirmed it caught it);
  the ethics reviewer caught the release-vs-paper anonymization contradiction (the released artifact
  named 46 maintainers) — the single highest reject-vector, invisible to a paper-only read. After the
  fixes + a confirm round, all three moved to Accept (~87–88%, from Weak-Accept/conditional/leak-risk).
  Lesson: the two things that most move a security paper — an ethics/disclosure contradiction and a
  reproduction/anonymization leak — live in the ARTIFACT, so the artifact-runner + an ethics lens are
  non-optional at security venues.

## plan-paper-timeline

Two real papers were scheduled with this skill: **AgenticDev 2026 @ ASE** (submission 15 Jul, notify
21 Aug, camera-ready 28 Aug, workshop 12 Oct) and **AISec 2026 @ ACM CCS** (submission 24 Jul).

## research-ideate

Both real papers passed this filter as **proof-of-method, medium-severity-is-sufficient** ideas in one
lane:

- **AgenticDev 2026 @ ASE — "Measuring the Wrong Number"** (~90%, submitted). The contribution was the
  _measurement method_, not a verdict on one tool; a medium-severity finding was enough because the
  reusable way-to-measure was the point. Stayed in the AI-assisted-SE reliability lane.
- **AISec 2026 @ ACM CCS — "Safety Theater in Agentic Coding"** (~87–88%). Same shape at a security
  bar: a reusable probe/finding about agentic coding safety, proof-of-method sufficient, squarely in
  the security-of-AI-coding lane. Together the two form a _connected corpus_ — exactly what axis (e)
  rewards — rather than two scattered one-offs.

## submit-paper

Written from the AgenticDev 2026 @ ASE submission (2026-07-13): PC-panel-reviewed, self-checking
artifact hosted on an OSF anonymized view-only link (no supplementary field at the venue), submitted #20
ready-for-review. The friction points here — no supplementary slot, 4open needing a repo, the abstract
re-paste, "ready for review" being a separate step, the PDF-only rule — are the ones that cost time.
