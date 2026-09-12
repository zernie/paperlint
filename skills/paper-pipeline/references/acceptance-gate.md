# Drive vs acquit — which of our gates is allowed to say yes

**Adapted from** `skills/shared-references/acceptance-gate.md` in
[`wanshuiyin/Auto-claude-code-research-in-sleep`](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
(ARIS), MIT licence, read at HEAD `2a23847` on **2026-08-09**; this adaptation written 2026-08-10.
Their file is 324 lines about ML training loops and LaTeX sources; the taxonomy is theirs, the
examples, the fourth rung and the entire classification below are ours. Deep read and the decision to
take pieces rather than migrate — recorded in the author's private notes
(`<papers-root>/research/2026-08-09-aris-deep-read-and-decision.md`).
Their technical report is arXiv:2605.03042.

---

## The distinction, in one line

> **A goal or a loop can DRIVE work. It cannot ACQUIT it.**

A pass may freely *drive*: schedule the next round, re-run the failed build, spawn ten readers, decide
what to try next. What it may not do is *acquit* — declare the paper good, the claim supported, the
section earning its place, the delta real, the draft ready to upload. Acquittal is the act of saying
**yes, this is fine, stop working on it**, and it is the only act in the pipeline that ends work
rather than directing it.

The question is not how careful the pass is or how many rounds it ran. It is **what is being judged**
at the moment the pass says yes.

## The two types

Classify every stop/accept gate as exactly one. If a gate looks like both, it is two gates and you
split it.

### Type A — execution / fact

A machine-checkable or externally-observable statement about **what happened**, carrying no judgement
of merit. A gate is Type A iff a non-LLM process — an exit code, a `stat`, a counter, a parser, an
HTTP lookup against a registry — could in principle return the same answer. Claude may self-judge
these. It is bookkeeping, not a verdict.

In our lane, measurement papers over repositories:

- ✅ `latexmk` returned 0 and the PDF has eight body pages
- ✅ `reproduce.py` recomputed every registered quantity and exited 0
- ✅ every `**bolded**` figure in the body has a row in `NUMBERS.md`
- ✅ arXiv's API has a record under this id and its author surnames match ours
- ✅ `check-anon.sh` found no deanonymising string
- ✅ the figure measures 203.13pt against a 219.09pt column
- ✅ the panel **was run** and left a report file
- ✅ the artifact bundle ships a path for every section the abstract leads with

### Type B — quality / correctness / sufficiency

A judgement of merit. Claude must never self-acquit one of these; ARIS routes them to a different
model family. We have no different model family (see below), so for us a Type B gate **can only
drive**.

- ❌ the paper is ready to submit
- ❌ this section earns its place
- ❌ the reader could follow that sentence
- ❌ the delta over the nearest prior work is real
- ❌ the draft sits at this venue's bar
- ❌ the idea is worth doing
- ❌ the arc carries the reader end to end
- ❌ the accept probability is 88%
- ❌ "no dimension scored below 3, so the writing is fine" — when *we* assigned the scores

### The dividing question

> *Could a program with no taste answer this?*
> **Yes → A** (self-judge freely). **No → B** (drive only; do not record it as an acquittal).

"The PDF compiled" needs no taste. "The PDF is a good paper" is nothing but taste. "The number
recomputes from the committed data" needs no taste. "The number supports the sentence around it"
needed taste right up until we built `check-provenance.mjs`, which is the interesting move — see the
fourth rung.

### Compound gates: split, never average

Most natural-language stop conditions bundle an A-part and a B-part, and the A-part is the tempting
one to report because it is the one that comes back green.

```
STOP when "the paper is ready to submit"
  ├─ A: the build produced a PDF at or under the page limit        → we check this
  ├─ A: check-anon.sh exited 0                                     → we check this
  ├─ A: every registered quantity recomputes and matches the text  → we check this
  └─ B: "the paper is actually good enough"                        → nobody outside our family judged this
```

`harden-paper` is exactly this gate and it does report the vector rather than a scalar, which is
right. What it still does is call the whole vector `PASS` when the B-part had no external judge.

---

## The fourth rung: construction, which their taxonomy has no room for

ARIS's taxonomy asks **who judges**. It therefore has two answers: us, or a different family. Our own
ladder, from the papers tree's own `CLAUDE.md`, asks a different question — **is the bad state expressible
at all** — and it has four rungs:

1. **unrepresentable** — the rule can be deleted from the prose and nothing changes
2. **blocked** — a mechanism refuses; the prose is unnecessary
3. **detected** — the prose is needed to say we mean it
4. **advised** — the prose is prose

Type A lives on rung 3 and sometimes 2. **Rung 1 is not in their taxonomy at all**, and it is the
rung we are actually best at:

- `repro/paper_numbers.py` — a registered quantity is written `{{annotated.failedContradicted}}`, not
  `22`. The build refuses to emit a PDF when the name does not resolve, when the value has drifted
  from the data, or when the paragraph does not declare which experimental arm it is reporting. This
  is not a gate that judges the number. **The wrong number has no representation in the source.**
- `permissions.deny: ["Bash"]` — the tool leaves the model's context. There is no command to match.

A rung-1 construction needs no acquittal because there is no verdict: nobody said yes, the bad state
simply had nowhere to live. **When a Type B gate is stuck at "drive only", the productive move here is
not to find a second model family we do not have — it is to ask whether the question has an A-shaped
or rung-1-shaped surrogate.** For measurement papers it very often does, and every time we found one
it caught a defect the judgement gates had passed:

| the taste question | the surrogate we built | what it caught |
|---|---|---|
| does this number support this sentence | `check-provenance.mjs` — arm word in the data path vs condition word in the sentence | the 2026-08-05 abstract defect, 29 hours before a deadline; five judgement gates had passed it |
| is this quantity really bound to its data | `repro/arm_permutation.py` — permute the arm labels, rebuild, an unchanged quantity was never bound | a whole class the artifact reviewer recomputes and passes, because the number is *correct* |
| did the number survive into the delivered paper | `repro/delivered_pdf.py` — read the built PDF back | a superscript minus lost in typesetting |
| is this reference real | `extract-ref-facts.mjs` + rules `refs/*` — arXiv / CrossRef | nine fabricated titles carrying correct arXiv ids, and one invented award |

---

## 🔴 Our judges are one family, and this is not a nuance

Every reviewer, grader, panellist, cold reader and adversary this pipeline fields is an Anthropic
model. ARIS's file names our construction without having seen it:

> ❌ N Claude reviewers each scoring the paper, then taking the **majority/average as the accept
> verdict.** This *feels* like a jury — independent voters! — but it is correlated same-family
> blindness wearing a jury costume. … **Known failure mode:** "We ran the review 5× and all 5 said
> accept, so it's robust." Five draws from one distribution is one opinion with error bars, not five
> opinions.

That is `pc-panel-review` (N lenses → chair's meta-review → calibrated probability) and the blind
multi-grader panel in `grade-paper-writing`, described from the outside. By ARIS's own verifier our
chain grades `provisional` and never `accepted` — and strictly worse than that, since their
`model_family()` does not know the word `fable` and would reject the artifact outright with
`unrecognized_model_family`.

**What cross-family review would and would not buy.** It decorrelates blind spots and raises recall.
It does not convert detection into prevention, and it does not touch our own measurement that 84–96%
of LLM checkers leak on adversarial cases. "Two differently built models fail differently" is a real
gain; "therefore this is now a gate" is not.

**The one acquittal in this pipeline whose adjudicator is outside our family is not a model at all**:
`verify-citations`' registry leg asks arXiv, CrossRef and Semantic Scholar, and they answer without
taste. That is the shape to copy.

---

## The classification: all 22 verdict-bearing gates

Every skill under `.claude/skills/` that records a verdict to the ledger — 21 with a `Record the
verdict` block, plus `map-prior-work`, which was in `EXPECTED_GATES` with no block at all when this
survey started and was wired during the same session under the heading `Step 8`. Type is
assigned from the **recorded verdict vocabulary**, not from what the skill does internally — a skill
whose work is judgement but whose recorded verdict is an exit code is Type A, and that is the design
we want more of.

> ⚠️ **Read the next section first if you are checking this table against the ledger.** The middle
> column below records what each gate's acquitting verdict *meant* as of the survey (2026-08-10,
> morning). A concurrent change deleted the value it was recorded under; the classification is
> unaffected and the reason it is unaffected is the interesting part.

| gate | what a yes from it asserts | type | may it acquit? |
|---|---|---|---|
| `render-paper` | `check-render.sh` exited 0 | **A** | ✅ yes |
| `draft-paper` | sections were written to disk | **A** | ✅ yes (and its own SKILL.md says a generator that can only pass is a design smell — correct, and it is still Type A) |
| `build-benchmark` | the artifact recomputed every headline number and exited 0 | **A** | ✅ yes |
| `paper-status` | a program printed zero blockers | **A** | ✅ yes |
| `submit-paper` | uploaded, marked ready, `check-deanon.sh` green, under the page limit | **A** | ✅ yes (its SKILL.md already calls itself a mechanical gate) |
| `plan-paper-timeline` | the backwards plan is on the calendar and `access` is green | **A** + B-tail | ⚠️ A-part only; "the deadline cannot be met from here" is taste |
| `verify-citations` | every cite resolves with correct metadata **and** the delta sentence is present | **A** (external adjudicator) + B-tail | ⚠️ the registry leg genuinely acquits; "is the delta stated" does not |
| `camera-ready` | de-anonymized, DOI live, limit re-checked, disclosure complete | **A** + B-tail | ⚠️ A-part only; "disclosure is complete enough" is taste |
| `extend-paper` | ≥30% new material, one named venue, no dual submission | **A** + B-tail | ⚠️ the three facts acquit; "genuinely new" does not |
| `find-venue` | a ranked shortlist with a keep/switch call | B (+ A-part) | ❌ the indexing/peer-review facts are A; the ranking is taste |
| `research-ideate` | go | **B** | ❌ drive only |
| `sweep-design-space` | at least one candidate survived the filters | **B** | ❌ drive only |
| `map-prior-work` | what you may still claim after the sweep | **B** | ❌ drive only |
| `argument-arc` | the arc carries the reader end to end | **B** | ❌ drive only |
| `cold-read-diff` | every changed sentence came back restated correctly | **B** | ❌ drive only — **and the cold reader is the same family as the writer** |
| `tighten-paper` | a cover-to-cover read produced no action | **B** | ❌ drive only |
| `grade-paper-writing` | the stall inventory came back empty | **B** | ❌ drive only |
| `analyze-sibling-paper` | the delta is real and no text has to change | **B** | ❌ drive only |
| `study-accepted-papers` | the draft already sits at the venue's bar | **B** | ❌ drive only (the corpus is external; the comparison is ours) |
| `paper-adversarial-review` | a hostile read found nothing | **B** | ❌ drive only |
| `pc-panel-review` | accept with no must-fix | **B** | ❌ drive only — the flagship offender |
| `harden-paper` | every gate green and every axis PASS/FIXED — *the only verdict that hands off to `submit-paper`* | **A over B** | ❌ the wrapper is A, the thing wrapped is B; the handoff is an acquittal |

### The honest count

**Of 22 verdict-bearing gates: 5 may acquit outright, 4 may acquit only their A-part, and 13 may
only drive.** Seventeen of twenty-two therefore reach a verdict at least partly beyond what they are
entitled to give.

🔴 **Narrow it to the review chain — the nine gates whose job is to decide whether the paper is good
enough — and the number is 9 of 9. Every one of them can only drive.** They are `argument-arc`,
`cold-read-diff`, `tighten-paper`, `grade-paper-writing`, `analyze-sibling-paper`,
`study-accepted-papers`, `paper-adversarial-review`, `pc-panel-review`, `harden-paper`. Not one has a
judge outside the family that wrote the text. Nothing in the review chain acquits; the entire chain
drives, and `harden-paper`'s PASS then hands that driving to `submit-paper` as if it were an
acquittal.

The gates that genuinely acquit are, without exception, the ones where we replaced a judge with a
program: an exit code, a registry lookup, a recomputation, a re-read of the built PDF. **We are good
at exactly the thing the taxonomy says is allowed, and we call it a gate exactly where it is not.**

### 🟢 2026-08-10, same day: the acquitting verdict was deleted rather than annotated

While this classification was being written, a concurrent change to `ledger.mjs` removed `PASS` from
the verdict vocabulary outright. A check that runs and finds nothing now records
`ABSTAINED no-witness`, and the ledger's own note says why:

> `no-witness` IS NOT A PASS. It says: this check ran to completion and produced no finding.
>
> `PASS` — deleted: it stored "nothing was wrong" as a *value*. Record `ABSTAINED no-witness`, and
> let the reader derive cleanliness from the absence of findings.

**This is the fourth rung applied to the taxonomy itself, and it is a better answer than the one
this document was going to give.** The plan here was to *mark* Type B verdicts provisional — a
warning, rung 3, detection. Deleting the value means a gate that cannot acquit has **no way to write
down that it did**. The bad state stopped being expressible. Every skill in the corpus was rewritten
the same day to the new vocabulary, so the "its recorded PASS means" column above now describes an
assertion none of these gates can make.

Two things it does *not* change, and they are why the table stays:

- **The classification is about the question, not the vocabulary.** `pc-panel-review` still decides
  whether the paper is good; deleting the word it wrote that down in makes the claim unrecordable,
  not unmade. The 12 drive-only gates are still 12.
- **The A/B split is still what tells you which gates are trustworthy** — and the five that may
  genuinely acquit are the ones whose `no-witness` can be believed, because an exit code with no
  findings really does mean the question was asked and answered.

The remaining hole is the one this move does not reach: `harden-paper` hands off to `submit-paper`,
and that handoff is still an acquittal being performed by a Type B gate — now performed by the
absence of findings rather than by a value, which reads even more like clean.

### What the mechanical layer looks like under the same taxonomy

Everything in `.claude/skills/paper-pipeline/scripts/`, `.claude/lib/` and `<paper>/repro/` is Type A by
construction — that is why it is trustworthy, and it is not a coincidence but a selection effect: a
program is what you can write only when the question is Type A.

| unit | question | rung |
|---|---|---|
| `ledger.mjs` / `status.mjs` | did the gate run, against which bytes, and has it ever said no | A (3) |
| `run-mechanical.mjs` | run every script gate; exit on the worst FACT gate | A (3), wrapping A |
| `repro/report-submission.py` | body pages, overfull boxes, unresolved refs, dropped characters | A (3) |
| `repro/check-anon.sh`, `check-figure.sh` | deanonymising strings; does the figure fit the column | A (3) |
| `structure.mjs`, `prose-lint.mjs` | section weights, unjustified blocks, thresholds with published baselines | A (3) — *measuring* a B question, which is legitimate and is not the same as answering it |
| `check-provenance.mjs` | untraced number; arm word in the path vs condition word in the sentence | A (3) |
| `population-map.mjs`, `artifact-coverage.mjs` | which set does this number count; does the bundle hold data for what the paper points at | A (3) |
| rules `refs/*` (facts by `extract-ref-facts.mjs`) | does the registry have this record | A (3), **external adjudicator** |
| `pipeline-check.mjs`, `paper-lint.mjs` | scorecard consistency, gate staleness, appendix ratio, shaved passages | A (3) |
| `repro/arm_permutation.py`, `repro/delivered_pdf.py` | is the quantity bound to its arm; did it survive typesetting | A (3), metamorphic |
| **`repro/paper_numbers.py` + `numbers.tsv`** | — | **rung 1: no PDF exists in which the number is wrong** |
| `paper-edit-guard.hook.ts` | writing to a paper from Bash | rung 2 — **leaky**, an interpreter reading its program from stdin still gets through (`papers/CLAUDE.md`, 2026-08-06) |

`structure.mjs` and `prose-lint.mjs` deserve their note. They put a **number with a threshold** on
questions that are Type B — does this section earn its place, is this sentence readable. That is not
cheating and it is not acquittal either: a threshold breach is a fact, and the fact drives a human or
a judgement pass. The failure to avoid is reading a green threshold as an acquittal, which is what
happened when a prose metric stood at 50.8 against a machine norm of 7.8 and printed as a neutral
line because **nobody had given it a threshold at all**.

---

## What follows from this classification

Three things are actionable today, and one is not.

1. **`single-family-jury` watches three gates; it should watch thirteen.**
   *(2026-08-26: this check now lives in `eslint-rules/pipeline-status.mjs` as the ESLint rule
   `pipeline/judge-recorded`, together with `unattributed-verdict`. The widening to fourteen names
   happened 2026-08-10 and moved with it.)*
   The `ACQUITTING` set is `pc-panel-review`, `paper-adversarial-review`, `harden-paper`. The other
   ten drive-only gates — `find-venue`, `research-ideate`, `sweep-design-space`, `map-prior-work`,
   `argument-arc`, `cold-read-diff`, `tighten-paper`, `grade-paper-writing`,
   `analyze-sibling-paper`, `study-accepted-papers` — report a clean run with no judge recorded and
   nothing objects. Widening that set is a one-line change to a set literal and it makes ten hidden
   acquittals countable.
2. ~~**`map-prior-work` records nothing.**~~ **Closed the same day.** It was in `EXPECTED_GATES`
   with no ledger call, so the gate deciding what we may still claim had never entered the ledger —
   a Type B gate that is also invisible, the worst square on this board. It is now wired
   (`Step 8`). Kept here rather than deleted because the *shape* recurs: a gate can be listed as
   expected and still have no way to speak, and nothing but `unlistedGates()`'s mirror image would
   have said so.
3. **Prefer a surrogate to a second family.** Before wishing for a cross-family reviewer, ask the
   fourth-rung question: is there an A-shaped or rung-1-shaped version of this judgement? Every time
   we have asked, the answer produced a check that caught something the panels had passed. The list
   is in the fourth-rung table above and it is four for four.

Not actionable: **we cannot fix the review chain by adding judges.** There is no second family
available in this environment, and adding more Anthropic readers is the failure mode by name. What is
available is honesty — record who judged, mark the verdict provisional, and keep converting taste
questions into programs.

## What this does NOT license

- **Not a reason to skip a Type B pass.** Drive-only is not worthless; driving is most of the work,
  and `pc-panel-review` finds real must-fixes. It is a reason not to read its PASS as permission to
  stop.
- **Not a reason to trust a Type A gate more than it deserves.** A green exit code acquits exactly
  the question it asked. The `refs/*` rules acquit "this record exists with this metadata" and say
  nothing about whether the citation supports the sentence it sits in.
- **Not a licence to call a measurement an acquittal.** A threshold breach is a fact; a threshold
  passed is also a fact, and it is a fact about a proxy. `prose-lint` being quiet is not "the writing
  is fine".
- **Not a claim that cross-family review would make a PASS mean much.** Borrowing ARIS's own honesty:
  a cross-model PASS is a heterogeneous second opinion, not ground truth. It does not mean the work
  is correct, novel or publishable. Same-family review does not even clear that bar.

## See also

- `review-ratchet.md` — what a caught overclaim costs, and the pass that pays it back.
- `eslint-rules/pipeline-status.mjs` (rule `pipeline/judge-recorded`; until 2026-08-26 in
  `../scripts/pipeline-check.mjs`) — `single-family-jury` and `unattributed-verdict`, the mechanical
  leg of this document.
- `../scripts/round-diff.mjs` — the per-round edit gate: a driving pass may only change what it
  declared, and the whole document's growth is measured every round.
- the papers tree's own `CLAUDE.md` — the four-rung ladder, and the rule that a rule written in prose is
  a construction somebody did not build.
