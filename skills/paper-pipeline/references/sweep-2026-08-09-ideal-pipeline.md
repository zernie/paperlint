---
title: "Sweep — what the pipeline should ideally look like (a construction, not a justification for markdown)"
created: 2026-08-09
updated: 2026-08-09
tags:
  [
    paper-pipeline,
    design-space,
    sweep,
    mechanisms,
    unrepresentable,
    claims,
    provenance,
  ]
findings: 8
---

# Sweep — the ideal pipeline construction

**The author's question:** "the fact that the pipeline uses markdown doesn't mean anything by
itself — the question is what it should look like **ideally**."

**The defect-state that should become unrepresentable:** a manuscript goes out for review carrying
a claim that is not backed by what it cites.

---

## The short answer (originally written in Russian, 10 lines)

1. **The form is already right, and that's not our opinion — two other groups independently arrived
   at it in 2026.**
   `arXiv:2606.09500` (MedSci Skills, June 8) — "decompose the work into **skills**, gate every
   transition with **halt-on-failure**, resolve each question with the **cheapest sufficient
   mechanism**: a deterministic recheck where that suffices, a prose-level probe only where
   interpretation is unavoidable." This is, word for word, our fact-gate / judgement-gate split from
   `run-mechanical.mjs`, published two months earlier.
   `arXiv:2605.28282` (ResearchLoop, May 27) — "claim ledgers", "paper bindings", "claim-admission
   algorithm". This is our `CLAIMS.md` + `ledger.mjs`. **The architecture can no longer be claimed as
   novel.**
2. **Ideal ≠ "not a single unbound claim".** Refusal without a replacement is deletion one step
   earlier; framing prose is the most valuable thing in the file. What should become unrepresentable
   is not the _content_ but the **claim of strength** — i.e. the assertion "this is backed" when it
   isn't.
3. **The measurement that changes the conversation: 46 numbers are bound, 264 are exempted by
   "grandfathering".** The numbers gate covers roughly a third of the paper's bolded numbers, and the
   exemption has **no expiration date**. This is not a hypothetical gap, it is `wc -l` on
   `repro/numbers-grandfathered.txt`.
4. **The main constructive finding:** the binding mechanism exists for **exactly one carrier** —
   numbers. The same three lines of code close two more: **citations** (a sentence claims that work X
   says Y) and **novelty claims** (a `CLAIMS.md` line that can be retracted). The ideal pipeline is
   **one binding mechanism across three carriers**, not three separate checks.

Below is how this was arrived at, what got killed, and by what.

---

## 0. Three findings that matter more than any single candidate

### 0.1 🔴 The architecture is OCCUPIED — twice, in 2026, and the repository knew about neither work

A `grep` across the whole repo: `2606.09500`, `2605.28282`, `MedSci`, `ResearchLoop` — **zero
hits**. The 2026-08-06 occupancy pass (`occupancy-2026-08-06-*`) checked **tools** (knitr, Quarto,
showyourwork, Vale, aclpubcheck) and missed two arXiv papers about **the architecture itself**.

**[B] Abstract verbatim, `arXiv:2606.09500`, Nam, Jeong, Kim, submitted 2026-06-08, revision
06-14:**

> «We describe an architecture pairing generation with verification, resting on three principles:
> decompose the workflow into self-contained skills, gate every stage transition with halt-on-failure,
> and resolve each integrity question with the cheapest sufficient mechanism, a deterministic,
> re-executable check where one suffices and a prose-level probe only where interpretation is
> unavoidable. This determinism-where-possible split, organized as an integrity-gate taxonomy, is the
> core contribution. It is realized as MedSci Skills, an open-source toolkit of 43 skills with a
> 21-detector deterministic tier, evaluated on three public-dataset pipelines (STARD, PRISMA, STROBE)
> and a seeded-defect ablation. […] on 27 identical injected defects the deterministic gates detected
> all 27 with no false positives on the matched clean fixtures, whereas a single-prompt LLM reviewer
> detected 11, its misses in code, bibliography, and style defects the prose hides. […] MedSci Skills
> is MIT-licensed and archived (v3.8.0).»

Line-by-line correspondences with ours:

| theirs                                                                                               | ours                                                                          |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| «self-contained skills»                                                                              | 22 paper skills                                                               |
| «gate every stage transition with halt-on-failure»                                                   | `run-mechanical.mjs`, exit code of the worst gate                             |
| «deterministic check where one suffices, prose-level probe only where interpretation is unavoidable» | the FACT-gate / JUDGEMENT-gate split, `verdict: 'exit'` vs `verdict: 'flags'` |
| «seeded-defect ablation», 27 injected defects                                                        | `*.harness.mjs` + `skills.mutations.mjs`, 21 planted defect                   |
| «21-detector deterministic tier»                                                                     | ~8 mechanical checkers                                                        |

**[B] Abstract verbatim, `arXiv:2605.28282`, Xia, Wang, submitted 2026-05-27:**

> «ResearchLoop treats research questions, task contracts, evidence objects, **claim ledgers**,
> closeouts, and **paper bindings** as durable project state, realized here as a repository-backed
> runtime. This technical report provides the complete protocol specification, state model, transition
> rules, **claim-admission algorithm**, and insight-compounding mechanism.»

⚠️ **Being honest about the evidence level:** the abstracts were read verbatim, **[B]**. The full
PDFs were read by a small model via WebFetch, and its summaries are **[D], not to be trusted**: for
2606.09500 it said "reports rather than blocks", while the abstract says `halt-on-failure`; for
ResearchLoop its answer to the question about "unrepresentable claims" reads stylistically like
confabulation ("Standard metrics for such systems would measure…"). **P0: read both PDFs in full,
with human eyes.**

**What follows from this, practically.** Not "we're too late." Three things follow:

- the claim "we built a manuscript-verification architecture" is **dead** — but nobody was making it
  anyway;
- **their 21 deterministic detectors are a donor list**, better than ARIS (see §2.4);
- **their 27/27-vs-11/27 number is our citation** in favor of banning a decision-making model. It is
  a published, measured argument for the filter "no model in the decision loop", which for us is
  still resting on our own 84–96% measurement.

### 0.2 🔴 Coverage measurement: 46 bound, 264 exempted, no expiration

```
grep -o '{{[a-zA-Z0-9_.]*}}' paper.md | wc -l          →  46
grep -oE '\*\*[^*]*[0-9][^*]*\*\*' paper.md | wc -l     → 113
grep -vc '^\s*#\|^\s*$' repro/numbers-grandfathered.txt → 264
```

`numbers-grandfathered.txt` describes itself honestly — _"their presence here is an admission, not
an exemption"_ — but an admission with no expiration date is exactly **lex imperfecta**, precisely
the category the author's paper studies in others. Aviation's MEL, where the idea "a defect is
tolerable with a compensating procedure" comes from in the first place, **always supplies the second
half: a repair deadline by category, that expires automatically.** We took the first half without the
second.

### 0.3 🔴 The substitution law: it is the STRENGTH of a claim that must become unrepresentable, not its content

Inherited from `compile-rules-2026/research/2026-08-02-mechanism-sweep-2.md` §0.1, and it lands
even harder here: a manuscript's framing prose (the reason anyone reads the paper) **cannot** be
bound to data, and should not be. A mechanism that refuses to accept an unbound sentence produces the
same state as deletion: the author wanted to say something — got refused — the file stays silent.

> **Law.** Unrepresentability is safe only when the refusal, **in that same authoring action**,
> returns an accepted substitute.

Hence the form of the answer: **gradual typing**, not a flag-day cutover. Bound and unbound coexist,
**the boundary is declared**, and the ratio is measured and printed. This is the ancestor from group
I, and it was picked not by taste but by the filter "one author, the migration has to pay for
itself."

---

## 1. The defect broken down into five classes, then into four properties

| #   | Observed instance                                                              | What actually failed                                                                                        | Closed?                                                                                                         |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | 22 matched the file perfectly, but sat in a sentence about **a different arm** | the defect lives **in the join** between the sentence and the field path; each check looks at only one side | partial: `paper_numbers.py` `requires`/`forbids` — but that is **a list of phrases matched against open prose** |
| 2   | 11 unreadable passages survived 6 passes, all within threshold                 | **a proxy was substituted for the property** and reports as though it settled it                            | 🔴 **no**                                                                                                       |
| 3   | gate marked passed, input missing/newer                                        | staleness was **declared**, not computed                                                                    | ✅ `ledger.mjs`, content-addressed key + hash of the checker itself                                             |
| 4   | a check that never once said "no" was counted as working                       | **vacuousness**                                                                                             | partial: `everSaidNo` **detects** it but does not forbid it                                                     |
| 5   | every judge in the chain is a model from the same family                       | **ensemble independence is assumed, not established**                                                       | 🔴 **no**                                                                                                       |

Four properties of the ideal pipeline:

- **P1 · Join.** A claim and its backing are **one object**, not two things a human reconciles by eye.
- **P2 · Proxy honesty.** A gate either settles the property, or **declares** that it is measuring a proxy.
- **P3 · Freshness.** The backing is provably about **these** bytes and **this** checker. ✅ done.
- **P4 · Non-vacuousness and independence.** The gate has proven it can say "no"; judge correlation
  is not passed off as confirmation.

---

## 2. An attack on the rejected options (one reason refuted, one fixed, one new donor)

The skill requires attacking the reasons, not just keeping the ban on file. Bottom line: **of four
retired reasons, two are wrong.**

### 2.1 "Moving to a LaTeX source — we'd lose 31 prose checks" → **stands, the reason is now stronger**

The reason is correct but weakly stated. The strong form: **the join is only representable in the
source.** `{{annotated.failedContradicted}}` inside the rendered `.tex` is already just `22`, and the
arm is unrecoverable. Indirectly confirmed by 2606.09500: their deterministic tier also sits
**before** rendering.

### 2.2 "DVC/make/snakemake — a second declaration alongside the prose" → **reason CORRECTED**

The "second declaration" objection died the day `status.mjs` showed up: there, **nothing is
declared**, everything is derived. So keeping them out has to rest on a **different** reason, and it
is already written down in `ledger.mjs`: they key off timestamps and **do not know the recipe
changed** — which is exactly our own bug. Keep it retired, but with the right reason, or the next
session reopens the question and gets an unconvincing answer.

### 2.3 "JSON inside markdown — prose readability is lost" → **reason REFUTED**

Refuted by our own shipped code. `{{annotated.failedContradicted}}` is **more readable** than the
`22` it replaced: the name names the arm, the digit named nothing. What destroys readability is not
structure inside prose, but **unresolved** structure.

> **Corrected rule:** structure inside prose is admissible exactly when it **resolves into prose
> at render time**. A sidecar table of claims next to the file is still a no (§3.F3, the AOP lesson).

### 2.4 "ARIS — a LaTeX source + 46/83 skills require the Codex MCP" → **stands, but a better donor has appeared**

**MedSci Skills** (2606.09500): MIT, skill-based decomposition, **21 deterministic detectors**, no
Codex dependency, domain is clinical manuscripts (STARD/PRISMA/STROBE). Its form is closer to ours
than ARIS's. **P1 action:** pull the list of 21 detectors and diff it against our eight — what they
have that we don't. That is cheaper than any generation.

---

## 3. A sweep of the catalog (what survived and what was killed)

Generation proceeded from the catalog's **named constructions**, not from thin air. An honest
caveat about method is in §6.

### A. Type systems

- **A1 · smart constructor: no literal in the source.** ✅ **ALREADY SHIPPED** (`{{name}}` +
  jinja2). Difference from knitr — knitr _allows_ both ways; here the literal is **forbidden**
  (`check_bypass`).
- **A2 · typestate: the arm declared by a block.** 🟢 **SURVIVED, S2.** Right now the arm is caught
  by phrase lists (`requires`/`forbids`) matched against open prose — a synonym not on the list gets
  through. Strictly stronger: `::: {.arm name=strict}` — and `{{annotated.x}}` inside such a block is
  a **build error by string equality** against a **closed vocabulary** (the arms of your own
  experiment, five of them). No model reads the prose at all.
- **A3 · affine types: evidence is consumed.** 🟢 **SURVIVED, S7** (see H6 — the same idea from
  medicine).
- **A4 · instance resolution as a gate.** ❌ the same thing as A2, in someone else's syntax. Killed
  as a mechanism duplicate.

### B. Formal verification

- **B1 · vacuousness as an admission criterion.** 🟢 **SURVIVED, S4.** `everSaidNo` **detects** a
  vacuous gate. Stronger: a gate **cannot be registered** in `EXPECTED_GATES` without a harness case
  that plants its defect and observes it firing. `skills.harness.mjs` already reads
  `EXPECTED_GATES` — the change is small. There is a published precedent: their seeded-defect
  ablation, 27/27 against 11/27.
- **B2 · refinement: the manuscript refines `CLAIMS.md`.** 🟢 **SURVIVED, part of S1.** Today
  `CLAIMS.md` and `paper.md` are **mechanically connected by nothing at all** — and `CLAIMS.md`
  already holds RETRACTED wordings ("two wordings are DEAD, must not be used"). Nothing stops a
  retracted wording from ending up in the PDF.
- **B3 · TLA+/Alloy on the process.** ❌ **NEGATIVE RESULT.** The invariant "no reachable submit
  with a stale gate" is already **computed** by `status.mjs`. A model here would add ceremony, not
  safety.
- **B4 · blame at the boundary.** 🟢 partial, absorbed into S6 + §0.3 (the boundary is declared,
  blame falls on whoever widened it).

### C. Functional programming

- **C2 · a claim-strength lattice** (`measured < observed < suggests < shows`), abstract ≤ the join
  of the body. ❌ **KILLED BY OCCUPANCY.** This is the literature on **spin in abstracts**, and it is
  large: 97% of trials in one review contain spin, 84% in another; LLM detectors have already been
  measured (GPT-o1, F1 0.932–0.98). Our version would be "no model, on a closed hedge vocabulary" —
  but it can't be claimed as new, and as a tool it's weaker than what's already shipped. File under
  occupied.
- **C3 · session types on gate ordering.** ❌ **NEGATIVE.** Absorbed by content-addressed
  staleness.
- **C4 · one AST, many interpreters.** 🟡 **already half exists, and it is the key.**
  `md2submission.py` parses `paper.md` and emits `.tex` + `.bib`. So **a point of complete mediation
  already exists** — every character reaching the reviewer passes through it. Today it's used only
  for formatting. The strong form (markdown as a pure projection of a claim table) ❌ killed by the
  migration filter.

### D. Capabilities

- **D1 · grants instead of bans.** 🟡 absorbed into S7: the experiment issues "citable" cells, the
  paper spends them; unspent = unreported, overspent = unbacked.
- **D2 · a reference monitor, a paragraph only through the CLI.** ❌ **KILLED** by the
  "substitution in the same action" filter: friction destroys the framing prose that is the reason
  anyone reads the paper.
- **D3 · least privilege for judges.** 🟢 **SURVIVED, S5.** Judge correlation is not just shared
  weights, it is **shared context**. Giving each judge only its own section + the declared backing is
  cheaper than sourcing a second vendor, and it lowers correlation on the one axis available to us.

### E. Specification by example

- **E2 · a golden file per claim.** 🟡 partially covered by provenance.
- **E3 · extracting a claim with a cold reader and checking it against a DECLARED ID.** 🟡
  **conditionally alive.** The one place a model is admissible: it **does not decide**, it proposes a
  label from a **closed** set, and the decision is equality against the author's declaration. The
  author fixes a mismatch. Risk, stated honestly: the model can guess the declared ID and produce a
  false negative. Keep it advisory, not a gate.
- **E4 · metamorphic relations: swap the arm and rebuild.** 🟢 **SURVIVED, S7-adjacent.** If you
  swap `annotated` and `strict` and **every gate is still green** — the sentences are not bound to the
  arm, and that is proof without a single declaration from the author. Occupancy: metamorphic testing
  of scientific software is a large field, but the search found no application **to a manuscript
  against its own data**.

### F. Data integrity

- **F1 · `ADD CONSTRAINT` validates existing rows / `NOT VALID`.** ✅ **SHIPPED** — and
  **with no expiration**, see §0.2 → that is S3.
- **F2 · a foreign key `ON DELETE RESTRICT`.** 🟡 a cheap add-on to S1: deleting a data row that a
  sentence references should fail.
- **F3 · store the claim as data, `.md` is a view.** ❌ **KILLED by the AOP lesson** (see I6):
  reading `paper.md`, you stop being able to see what's backed. Admissible only together with S8
  (a marker at the point of use).

### G. Author UX

- **G1 · asymmetric cost:** "we show" requires a backing ID, "we observed, informally" is free.
  🟢 absorbed into S1+S6.
- **G2 · change the DEFAULT, don't add a gate.** 🟢 **SURVIVED, S8 — the cheapest thing in the
  sweep.** The author looks at the PDF dozens of times. Let unbound numbers **render with a marker**
  in the draft build (not the submission build). Zero new discipline, feedback lands in the artifact
  people already read.
- **G3 · a single entry point:** `claim add --from aggregate.json:path`. 🟡 good, but after S1.

### H. Other professions

- **H1 · aviation's MEL: a repair deadline by category, expires on its own.** 🟢 **SURVIVED, folded
  into S3.**
- **H2 · SOX: design effectiveness ≠ operating effectiveness.** ✅ **already borrowed**
  deliberately (the `requires`/`forbids` pair). Under-used: the gate table should have **three**
  states, not one — "the control exists / it's designed correctly / it operated in this period."
- **H3 · MISRA: a decidable/undecidable label on every rule.** 🟢 **SURVIVED, S6.** The only honest
  answer to instance #2: the gate declares whether it settles the property or a proxy. Cost: zero,
  it's a field.
- **H4 · DO-178C DAL / ISO 26262 ASIL: assurance levels.** 🟢 folded into S3 (level by **position**,
  see below).
- **H5 · lex imperfecta.** 🟡 a frame, not a mechanism; §0.2 is its application to ourselves.
- **H6 · CONSORT: accounting for every participant at every stage.** 🟢 **SURVIVED, S7.** Every
  cell of the grid (arm × metric) is either cited by a claim, or **explicitly marked as not
  reported**. This catches the opposite direction of the defect — **measured and not reported**
  (cherry-picking), which nothing catches today and which a reviewer will ask about.

### I. Historical ancestors in software engineering

- **I1 · gradual typing.** 🟢 **the form of the whole answer** (§0.3). It caught on across a huge
  installed base precisely because it **required no migration** — the one filter that actually bites
  here.
- **I2 · SPARK's stone→bronze→silver→gold→platinum.** 🟢 the ladder for S3, the rungs are already
  mechanical and published — don't invent our own.
- **I3 · lint (1978).** ✅ this is the current construction.
- **I5 · requirements engineering: _testable requirement_ as a category + a traceability matrix.**
  🟢 `CLAIMS.md` is a traceability matrix with no mechanical leg. S1 attaches the leg.
- **I6 · AOP, and WHY IT FAILED.** 🔴 the most useful negative in the sweep: cross-cutting
  declarations, pulled out of the code, made the code unreadable — looking at it, you can't tell what
  applies to it. **A direct ban on a sidecar table of claims** (F3), and the reason S8 is mandatory
  next to any such extraction: the projection has to be visible **at the point of use**.

### J. Migration

Strangler fig · `NOT VALID` with a deadline · advisory-then-enforcing · opt-in tiers. This is the
**rollout form** for everything selected, not a separate mechanism.

---

## 4. The ideal construction — five laws

Not "a new pipeline." Naming what the construction has already converged on, plus what it's still
missing.

> **Law 1 · Complete mediation at the converter.** Everything that reaches the reviewer passes
> through `md2submission.py`. That is **where** to check, because it is the one place where "the
> manuscript cannot be produced" is a reachable state, while "the checker complained" is not.
>
> **Law 2 · One binding mechanism, three carriers.** Numbers, **citations**, **novelty claims** are
> the same join, "sentence ↔ backing record." Today the mechanism exists only for numbers.
>
> **Law 3 · Strength is unrepresentable, not content.** Unbound prose is a first-class, cheap,
> declared category. Its **share** is measured and printed, not its existence forbidden.
>
> **Law 4 · A proxy declares itself a proxy.** A gate carries a decidable/undecidable label. A gate
> measuring a proxy has no right to report as though it settled the property.
>
> **Law 5 · A gate without a killed mutant does not exist.** Registration requires a witness.
> Agreement among N judges of the same family counts as **one** witness.

**What the construction stays SILENT on (declared, not concealed):**

- Only `paper.md → PDF` is gated. **The rebuttal, the artifact README, the cover letter, a blog
  post** carry the same claims and are gated by nothing.
- Nothing checks that the cited work **actually says** what it's credited with saying (S1 makes the
  link representable, but a human fills it in).
- Framing prose is not checked and should not be — that is the price of Law 3, accepted knowingly.
- A metric that was never computed at all will not show up in any accounting (S7 only sees the grid
  of what was computed).

---

## 5. Eight survivors, ranked by (cost → what it kills)

| #      | Mechanism                                                                                                | Kills                                      | Cost                                | Occupancy                                                    |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| **S8** | unbound numbers **render with a marker** in the draft build                                              | the 264 exempted self-liquidate            | ~5 lines in `md2submission.py`      | unoccupied                                                   |
| **S4** | a gate **cannot be registered** without a killed mutant                                                  | instance #4 (vacuousness)                  | ~20 lines in `skills.harness.mjs`   | published as an ablation, the mechanism itself is unoccupied |
| **S6** | a **decidable/undecidable** label on the gate                                                            | instance #2 (proxy as property)            | a field + a column                  | MISRA, take as-is                                            |
| **S5** | least-privilege judges; N of the same family = **1** witness                                             | instance #5 (correlation)                  | a ledger field + a narrowed prompt  | unoccupied                                                   |
| **S2** | **arm declared by a block** instead of phrase lists                                                      | instance #1, no prose heuristics           | a block attribute + string equality | no occupancy found                                           |
| **S1** | **one binding, three carriers** (numbers + citations + `CLAIMS.md`)                                      | a retracted claim ends up in the PDF       | medium, a resolver exists           | ResearchLoop calls it "paper bindings" — **check the PDF**   |
| **S3** | a ladder by **position** (abstract/section-lead-in = binding required; appendix = optional) + a deadline | the 264 with no expiration                 | medium                              | SPARK/DO-178C, take the form                                 |
| **S7** | **arm × metric** accounting: every cell is either cited or explicitly marked not reported                | measured-and-not-reported (cherry-picking) | a diff script                       | CONSORT — the form; no application found for our case        |

**Why a ladder by POSITION and not a global deadline:** an unbound number in the abstract and one
in appendix B differ by an order of magnitude in blast radius. A single author does not convert 264
positions; they convert the ones a reviewer will quote. This is the DO-178C move (assurance level by
consequence of failure), not the MEL move (a single deadline), and it is more honest about a real
budget.

---

## 6. Negative results and honesty about method

**Groups that gave nothing** (don't re-sweep these): **B3** (TLA+/Alloy on the process — the
invariant is already computed), **C3** (session types on ordering — absorbed by staleness), **C2**
(claim-strength lattice — occupied by the spin literature), **D2** (complete mediation at the
paragraph level — killed by friction), **F3** (sidecar claims — killed by the AOP lesson), **A4**
(instance resolution — a duplicate of A2), **C4's strong form** (markdown as a pure projection —
killed by migration cost).

**🔴 Departure from the skill's procedure, stated plainly.** The skill requires generating
candidates via **a subagent with no thread context**. In this environment there is no
subagent-spawning tool (`Task` is unavailable; there is only cross-session, asynchronous
`SendMessage`/`create_session`). Generation was done by me, under the discipline "from the catalog's
named constructions," **after** reading the pipeline — meaning the thread anchor was **not**
removed. Practical consequence: §3 should be considered complete by group, but possibly incomplete on
the "non-obvious" candidates — exactly the class that produced the three best ideas last time.
Compensated by where the budget actually went: **the occupancy check**, which no anchor fixes and
which is what turned the picture around here (§0.1).

**Evidence levels:** [A] read in full at the primary source · [B] abstract verbatim ·
[C] search results · [D] a PDF summarized by a small model, **do not trust**.

---

## 7. What to do (ranked by benefit-to-cost, descending)

1. **P0 · Read both PDFs in full** (2606.09500, 2605.28282). Summaries are [D]. How much of
   S1/S4/S7 remains ours depends on their content.
2. **P0 · Re-check the claim in the `paper_numbers.py` docstring** — _"Not one of them has a hook
   where you could say the sentence around this number must say counterfactual and must not say as
   committed"_ — against **MedSci's 21 detectors**. The claim was written before this work was known
   about; if it's false, it's false **both in shipped code and in the novelty reasoning**.
3. **P1 · Build S8 and S4** — together that is under fifty lines and closes two of the five
   instances.
4. **P1 · Diff our eight checkers against their 21** — cheaper than any generation.
5. **P2 · S2 and S1** — the constructive part; S1 is itself the answer to "how it should be
   ideally."
6. **P3 · S3 and S7** — require budget, do after submission.

---

# 8. Second pass, FOR REFUTATION (2026-08-09, addendum)

A separate `sweep-design-space` run. The goal is not to redo the sweep but to attack its single
most load-bearing part. §0.1 kills the architecture-novelty claim, is marked **[B]**, and warns
about confabulation about itself ("stylistically resembles confabulation"). Per the base's own rule
("a conclusion that changes a decision → a second pass for refutation"), this must be re-checked
before it is cited as fact.

**Method: the model is removed from the decision loop.** The previous pass read the PDF through
WebFetch, where a small model synthesizes the answer — exactly the mechanism under suspicion here.
Instead: raw XML from the arXiv API (`export.arxiv.org/api/query?id_list=…`) and **a clone of the
source repository**. Not a single model summary in the chain. The level rises to **[A]**.

## 8.1 ✅ §0.1 HELD — both works are real, quotes are verbatim

| field          | 2606.09500                                        | 2605.28282                     |
| -------------- | ------------------------------------------------- | ------------------------------ |
| `totalResults` | 1                                                 | 1                              |
| version        | **v4**                                            | v1                             |
| `published`    | **2026-06-08T13:51:04Z**                          | **2026-05-27T10:29:00Z**       |
| `updated`      | 2026-06-14T00:06:13Z                              | 2026-05-27T10:29:00Z           |
| authors        | Yoojin **Nam**, Jinhoon **Jeong**, Namkug **Kim** | Yihan **Xia**, Taotao **Wang** |
| category       | cs.AI (+cs.DL)                                    | cs.AI                          |

The title of 2606.09500 (not given in §0.1): _«Deterministic Integrity Gates for LLM-Assisted
Clinical Manuscript Preparation: An Auditable Biomedical Informatics Architecture»_.
Both abstract paragraphs in §0.1 were checked character-by-character against the API output —
**no discrepancies**. The architecture's occupancy is confirmed. The claim "we built a
manuscript-verification architecture" remains dead, and it is now [A] rather than [B].

From the arXiv comment (absent from §0.1, and it is the key to everything below):

> Software (MIT): `https://github.com/Aperivue/medsci-skills` . Archived on Zenodo: concept DOI
> `10.5281/zenodo.20155321` and version DOI (v3.8.0) `10.5281/zenodo.20582972`

## 8.2 🔴 S4 IS OCCUPIED — and its owner has already published it — WHY THAT IS NOT ENOUGH

The repository was cloned and checked for identity:
`aperivue/medsci-skills`, HEAD `b2c120e667d5a329add8ae5bc3371411f739bd60`, origin verified.

**S4 in the §5 table** ranked second by cost/benefit: _"a gate cannot be registered without a
killed mutant, ~20 lines in `skills.harness.mjs`"_, occupancy — _"published as an ablation, the
mechanism is unoccupied"_.

**The mechanism is NOT unoccupied. It has been shipped, under MIT, across 85 detectors.**
Verbatim, `paper.md:23`:

> «Each detector ships a synthetic **challenge card** — a positive case and a negative control —
> that runs in continuous integration, so **a clean result is meaningful** and a flagged defect is
> reproducible.»

"so a clean result is meaningful" — that is exactly our anti-vacuousness argument, in their prose.
On top of the card, they have a second leg — `check_detector_crossfire.py` (a detector must **stay
silent** on clean demo manuscripts).

**And that is not even the main thing.** `reverse_engineer/HELDOUT.md:3–17`, verbatim:

> «Every detector in this repo is tested against fixtures authored alongside it: a challenge card
> proving it fires on a planted defect, and `check_detector_crossfire.py` proving it stays silent on
> the demo manuscripts. Both are necessary. **Neither is independent.** In machine-learning terms
> they are a **training set**, and a detector passing its own challenge card is a **training accuracy
> of 100% — true, and uninformative about anything.**»

> «An improvement loop whose generator and evaluator share a framing drifts toward the evaluator
> rather than the goal — the measured quality rises while the unmeasured quality falls. **The
> counterweight is not another gate. Adding gates is what produces the drift.** The counterweight is
> a set of cases the gates were never allowed to learn from, scored periodically, whose trend can
> contradict us.»

Their replacement is a held-out corpus with a mandatory `frozen_at` field:

> «`frozen_at` is required on every held-out record, because the claim is chronological: a freeze
> date that **precedes the detector** is what makes it checkable rather than asserted.»

**Consequence for S4 — rewrite, don't discard.** A harness case planted by the gate's own author
gives 100% training accuracy. That is still strictly better than nothing (it catches instance #4 —
a gate that never once said "no"), but **it cannot be claimed as sufficient**, and even less so as
novel. The honest form of S4 is two tiers, where the second is the real one — (a) the author's card =
admission, training; (b) a corpus frozen **before** the gate was written = the one measurement worth
trusting. We have (b) in no form at all.

To be honest about the caveat: their own HELDOUT.md records that the rule **was violated on
2026-07-31** (three agents reached `_corpus/heldout/`, one ran a detector against the corpus). The
finding was quarantined and not applied. This does not weaken the mechanism — it shows its cost.

## 8.3 🔴 The "21 detectors" number is stale — theirs is **85**, and the catalog is machine-generated

`metadata/detectors_catalog.json`, field `detector_count` = **85** (not 21; 21 is the June paper's
number, the repo has moved on). Breakdown by family, verbatim from the catalog:

| n   | family_label                            |
| --- | --------------------------------------- |
| 24  | Style & review-process integrity        |
| 17  | Data preparation & validation           |
| 17  | Reporting compliance                    |
| 11  | Numerical, cohort & pool arithmetic     |
| 9   | Citation & reference integrity          |
| 7   | Confounding, scope & estimand contracts |

The catalog itself is **AUTO-GENERATED** (`scripts/gen_detectors_catalog_json.py` globbing
`skills/*/scripts/`, with a CI gate on drift). So their registry is **derived, not declared** — the
same discipline as our `status.mjs`, and confirmation that §2.2 (the retired reason about "a second
declaration") was closed correctly.

**P1 #4 from §7 is reformulated:** the diff is not "our 8 against their 21" but **our 7 against
their 85** (there are exactly 7 gates in `run-mechanical.mjs`, not 8 — recounted). Diffing by
family: our seven fall entirely inside "Numerical" + "Style", and **three of their families are
represented by nothing of ours** — Reporting compliance, Data preparation, Confounding/estimand.
Directly relevant to our topic is "Citation & reference integrity" (9 detectors) — that is carrier
#2 from Law 2 (citations), which is listed in our §5/S1 as unwritten.

## 8.4 🔴 An attack on the frame of the whole sweep

The sentence _«The counterweight is not another gate. Adding gates is what produces the drift»_
hits not one candidate but the shape of the whole answer: §5 is a list of eight **new gates**. It
does not invalidate S1–S8 (our instances #1–#5 are real and observed), but it adds a filter that
wasn't in §2 and that needs to be recorded in the skill:

> **Filter: what measures whether a new gate actually helped?** A gate whose effect is observable
> only through the same gates raises measured quality and says nothing about the unmeasured kind.

By this filter, S8 (the marker in the draft build) looks **better** than all the rest: its
feedback lands on the human, in the PDF, not in a gate table. S8's rank of #1 in §5 is confirmed
independently.

## 8.5 What is still unoccupied (checked by grepping their repo)

- **S6** (a `decidable/undecidable` label on the gate) — they have `family`, but there is **no**
  proxy-honesty label: `grep -ri undecidable` over the repo → **zero hits**. Unoccupied, stands.
- **S3** (the ladder + an expiration date on exemptions) — `grep -ri grandfather` → **zero**.
  Unoccupied.
- **S1/S2/S7** — no direct matches found, but this was only checked by grepping keywords, not by
  reading all 85 detectors. Level **[C]**, not [A].

## 8.6 Occupancy is wider than two papers

`paper.md` in their repo is a **third** artifact: a separate software paper that cites 2606.09500
as a companion (`[@nam2026gates]`, _«conducted on an earlier release of the toolkit»_). So this is
not "two papers" but an actively developing line of work from 2026-05 to 2026-08. The previous
occupancy pass did not see this.

## 8.7 What this pass did NOT do

- **P0 #1 (read both PDFs in full) — still NOT closed.** The abstracts [A] and shipped code [A]
  were checked; the bodies of the papers were not read. Everything §0.1 derives from the bodies
  remains [B]/[D].
- No generation of new candidates was done — this pass was a verification pass. The gap from §6
  (generation without thread context) **remains open**; `Task` is still unavailable in this
  environment.
- S1/S2/S7 against their 85 detectors were checked by grepping, not by reading — [C].
