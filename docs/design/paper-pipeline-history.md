# paper-pipeline: history and measurements

The `paper-pipeline` skill keeps its instructions; this page keeps why they are shaped that way, the
measurements behind them and the incidents that produced them. Dates are when each was observed.

## Where every check runs, and where it can be walked around

```
   YOU EDIT                    YOU COMMIT                YOU BUILD              YOU PUSH
      │                            │                         │                      │
      ▼                            ▼                         ▼                      ▼
 ┌──────────────┐          ┌────────────────┐       ┌────────────────┐    ┌────────────────┐
 │ PostToolUse  │          │  .githooks/    │       │ build-         │    │ GitHub Actions │
 │ lint-edited  │ BLOCKS   │  pre-commit    │REFUSES│ submission.sh  │    │ paper-gates    │
 │  new error   │          │                │       │                │    │                │
 │ paper-lint   │ nudges   │  numbers gate  │       │  numbers gate  │REFUSES  numbers+self│
 │  post        │          │                │       │                │    │                 │
 │              │          │                │ nudge │  page count    │    │                 │
 │   SHAVE      │          │  self-test if  │       │  overfull      │    │  check-anon     │
 │   numbers    │          │   you touched  │       │  unresolved    │    │  verify-cites   │
 │  paper-edit- │ BLOCKS   │   a gate       │       │   refs         │    │  provenance     │
 │   guard      │  bash    │  harness if    │       │  dropped glyphs│    │  scorecard      │
 └──────────────┘          │   you touched  │       │  anon grep     │    │  harness        │
        │                  │   a hook       │       └────────────────┘    │  LaTeX build    │
        │                  │  RAW DNA       │REFUSES        │             └────────────────┘
        │                  └────────────────┘               │                     │
        │                          │                        │                     │
   watches EVENTS            watches STATE            watches OUTPUT        watches EVERYTHING
   (Edit/Write fired)        (what is staged)         (the actual PDF)       (after the fact)
        │                          │
        │                          │
   🕳 BYPASSABLE:              🛡 NOT bypassable by that route: it does not care
   write from Bash and            HOW the bytes got there. However you wrote the
   no event fires, so             file, you still have to commit it.
   every PostToolUse
   check silently
   does not run.
```

**Read the bottom row, it is the whole point.** Each column watches a different KIND of thing, and
that is why they are not three copies of one check:

- **Editor hooks watch events.** Fast, and the only layer that can stop a bad edit _before_ it lands.
  Bypassable by construction — an event that never fires cannot be checked, and writing the file from
  Bash produces no event. Documented in `papers/CLAUDE.md`, open since 2026-08-04.
- **The git hook watches state.** Immune to that whole class, because it reads what is staged and has
  no opinion about how it got staged. This is the layer that was missing, and the one to reach for
  when an editor check turns out to be walkable-around.
- **The build watches output.** Only it can see page count, overfull boxes, and glyphs pdflatex
  silently dropped — none of which exist until the PDF does.
- **CI watches everything, but after the fact.** Its real job is the slow checks nobody will wait for
  locally (the anonymity self-test copies a 24 MB bundle per leak category) and the self-tests, which
  are what catch a gate that has quietly stopped catching things.

🔴 **A fifth kind, and none of the four columns can see it: does the MODEL call these skills at all?**
Every column above watches something the repository produced — an event, staged bytes, a PDF, a commit.
None watches _selection_: whether a real model, reading 37 competing descriptions, picks `tighten-paper`
over `cold-read-diff` when the draft is bloated. A harness test proves a skill works once invoked;
it cannot prove it gets invoked. That needs the real CLI and it costs money, so it is a measurement, not
a gate — `.claude/skills/paper-pipeline/pipeline-firing.eval.mjs`, run manually or by the weekly
`skill-firing` job (`workflow_dispatch` + `schedule`, deliberately NOT on push). It installs every skill
in this repo natively so selection is _competitive_, feeds each skill 4 prompts it should fire on plus 4
its colliding sibling owns, and reports recall / false-positive / precision per skill against a committed
baseline. **What it measures drifts without a commit here** — a model update can change routing while
every file stays byte-identical, which is exactly the regression no check in the diagram can see.
Prior art is named in the file header (`adewale/skill-eval-harness` does this too); the idea is not ours.

🔴 **Still manual, and no mechanism has been found for it:** the **cold read** — a reader with no
context restating each sentence — is the only check that catches a sentence that is short, true,
threshold-passing and meaningless. It needs a fresh subagent, so no hook can run it.

Install the git hook once per clone: `git config core.hooksPath .githooks`.

## Why the stages are not numbered

**This section replaced a single numbered list running 0 → 12, on 2026-08-03.** That list had a
paragraph on top explaining that the numbers were dependencies rather than turns — and underneath it,
a table numbered straight through, which every reader (including this pipeline's own author) read as a
waterfall. The paragraph was the tell: a document that needs a disclaimer explaining how not to read
it is mis-shaped, and the fix is to change the shape, not to add a second disclaimer. That is the
argument `compile-rules-2026` makes about instruction files, applied here.

Three concrete errors the numbering produced, all real:

- **`verify-citations` sat at 7**, looking like a one-shot step, while the project rule is that it runs
  every cycle — an edit on the last day adds a `\cite` that "we checked last cycle" does not cover.
- **`map-prior-work` sat at 1.5** and its own description told you to re-run it as a cheap delta before
  submit — so it was simultaneously a stage and a continuous check, and the table could only show one.

## Why text and evidence are separate passes

The author, 2026-08-05 (translated from Russian): _"can we just run the gate on the text? we just
checked the numbers, and now I want to grade the text — assume the numbers are fine."_ He is right that these are separable, and
running both when only one is wanted burns an hour for nothing.

## A number correct on both axes and wrong anyway

**Observed 2026-08-05, on page 1, 29 hours before a deadline.** The abstract read _"147 real rules
files exactly as their projects committed them, 22 fail admission"_. The data has two arms over the
same 147 files: **strict** (files byte-for-byte as committed — nothing fails) and **annotated** (the
same files with the tool's proposed pointers written in — 22 fail). The 22 was from the annotated arm
and was described in the strict arm's words. Five more numbers had the same defect; a sixth was found
later in an appendix by machine, after two people had searched by hand.

**Every gate passed, and each for a good reason.** `cites` checks the reference is real. `claims` checks the
claim did not grow — and it did not, 22 was always 22. The artifact-runner recomputes the number from
the data and it reconciles, _because the number is correct_. The reading panel takes "unmodified" as a
fact about the world, which is what a reader does. **The defect lives only in the join between a
sentence and a field path, and nothing was holding both.** It is not a TEXT defect and not an EVIDENCE
defect; it is a defect of the edge between them, so no pass on either axis can be made to see it.

**The construction, not another pass.** A registered quantity is not written as digits at all:

```
Over {{corpus.n}} real rules files, with the extractor's proposed mapping
taken as if an author had written it, {{annotated.failedContradicted}} fail admission.
```

`<paper>/repro/data/numbers.tsv` gives each name its value, the JSON path or **formula** that recomputes
it, and two guards. The build refuses a PDF unless: the name resolves · the value still matches the
data · the **paragraph** names the arm (`requires`) · the **sentence** does not claim a different one
(`forbids`). Requires and forbids are separate on purpose — the pairing is auditing's, where a control
is tested once for _design_ and once for _operating effectiveness_.

**Why paragraph for one and sentence for the other.** _"Every figure in this paragraph is the
counterfactual arm"_ is good writing, and a sentence-scoped `requires` would forbid it. But _"exactly
as committed"_ nine words from the number is the defect itself, so `forbids` has to be tight.

**Coverage without a migration.** `numbers-grandfathered.txt` lists every quantity that predates the
gate; adding a new raw one fails the build. This is `ADD CONSTRAINT ... NOT VALID` — the constraint
binds every row from now on, and the existing rows are _enumerated rather than exempted_, so the file
says out loud how many figures still have no machine-checked path to data. On the paper that has it:
7 guarded, 248 grandfathered. That ratio is a finding, not a score.

**Adopting it in another paper:** copy `repro/tools/paper_numbers.py`, `repro/tools/paper_numbers.selftest.py`
and the build step that calls `expand()` on `paper.tex` before `pdflatex`; generate the
grandfather list from the current draft; register the numbers a reviewer will actually check first.

🔴 **Do not write the substitution half — it is `jinja2`, and `{{name}}` is already its syntax.**
Eleven candidates were installed and run on a real ACL paper on 2026-08-05. The result is not a
matter of taste:

| candidate                     | verdict, from an actual run                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **jinja2**                    | **adopt.** Our `{{annotated.failRate}}` was already valid Jinja2; dotted names are attribute access. Zero characters changed in the paper, byte-identical `.tex`. This is Manubot's mechanism, taken without Manubot. Use `StrictUndefined`, and move the block/comment delimiters off `{%`/`{#` if the paper might ever quote a config file |
| **knitr**                     | equally proven, also byte-identical. Rejected only for putting an R runtime into an artifact that otherwise needs `python3` + `pdflatex`                                                                                                                                                                                                     |
| `\newcommand` + `numbers.tex` | works; the folk convention, ~12 GitHub hits, all hand-rolled. No package exists                                                                                                                                                                                                                                                              |
| **cog.py**                    | ❌ line-oriented; cannot substitute mid-sentence                                                                                                                                                                                                                                                                                             |
| **pythontex**                 | ❌ not in Ubuntu TeX Live at any level, not on PyPI; CTAN zip + `.ins` build                                                                                                                                                                                                                                                                 |
| **showyourwork**              | ❌ it manages _figures_, not in-text numbers                                                                                                                                                                                                                                                                                                 |
| DVC · datalad · papermill     | orthogonal and **worth adding**: they pin the data file to the pipeline that made it, a layer below anything here                                                                                                                                                                                                                            |

**🔴 Computing the value DISSOLVES the freshness problem — do not build a checker for it.** With no
recorded value there is nothing that can go stale, so there is nothing to verify. Adopting jinja2
deleted 137 lines of ours outright: a hand-rolled expression language with an `eval()` sandbox, a
renderer guessing which of six formattings the paper meant, a JSON-path walker and the comparison.
Recording-plus-verifying is the trap; computing is the wheel.

**Binding a number to its CONDITION is genuinely unoccupied**, and the reason is structural rather
than an accident of packaging: **every literate-programming tool models the paper as a program that
prints text**, so the prose is opaque _output_, not an input to a check. None of them has a hook
where you could say "and the sentence around this must say _counterfactual_ and must not say _as
committed_". The near-misses read the manuscript but never the data — `statcheck` recomputes
p-values from statistics printed in the same sentence; `RegCheck` compares a paper to a study
registration with an LLM and reports to a human instead of failing a build. Searched and empty:
GitHub repo search (0 results), the Actions marketplace, the pre-commit hook ecosystem, PyPI, and
the Claude skill marketplaces.

🔴 **And it is not a number-keyed table**: the first version keyed rules on the digits, and a paper
printing two unrelated 22s broke it the same hour. Key on the occurrence.

🔴 **Hand the gate to a red team the same day you build it.** This one was, and seven holes came
back, the worst being that the original defect could simply be **retyped as digits** — its value was
grandfathered, so the guard applied to the macro and not to the claim. Every hole is now a case in
`repro/tools/paper_numbers.selftest.py` (18/18, including three that must stay **quiet** — a gate that
fires on ordinary writing gets muted, and then its silence reads as coverage).

## Why the page limit waits for the end

**Observed failure, `compile-rules-2026`, 2026-08-02/03.** The body oscillated 8 ↔ 9 pages for roughly
fifty iterations. Each time content went in, the page count read 9, and prose came out to get back to
8 — sixty characters at a time. Every individual cut looked harmless. Their sum is the unanimous 2/5
for clarity: the first compression took real repetition, the second had none left and took
transitions, antecedents and the conclusion's honest half. The structural pass named the arithmetic —
780 words of genuine repetition removed, then 880 words in and 480 out, leaving the paper 51 words
_heavier_ than before the pass that cut 780.

## What each stage cost, measured

The author, 2026-08-05, watching a run he could not size (translated from Russian): _"is it worth
writing the timing problem into the pipeline skill?"_. Yes — because the project already forbids guessing here. The rule in the papers tree's own `CLAUDE.md`
says an estimate must be decomposed into labour / calendar / result-risk / access and **spiked
rather than guessed**, and the same session it was written I still launched an experiment with no
upper bound and had to cut it four hours later.

Every number below is subagent **wall clock, measured on 2026-08-04/05** while finishing
`compile-rules-2026`. They are one machine, one paper, one day — treat them as an order of
magnitude, not a promise. Re-measure rather than inherit.

| stage                                                             |               measured | note                                                       |
| ----------------------------------------------------------------- | ---------------------: | ---------------------------------------------------------- |
| `verify-citations`, one reference                                 |              **3 min** | sonnet; a fetch and a comparison                           |
| `verify-citations`, eight references                              |              **3 min** | the fetches parallelise; count barely matters              |
| a single reconciliation ("do these two numbers agree?")           |              **4 min** | sonnet, over committed data                                |
| a second-rater pass over ~20 rows                                 |              **8 min** | opens every cited file                                     |
| a process/mechanism research pass (docs + source + issue tracker) |             **10 min** |                                                            |
| `pc-panel-review`, full panel + chair                             |             **17 min** | unchanged for the confirming round                         |
| bundling an experiment into the artifact + gate + re-zip          |          **24–39 min** | scales with directories, not bytes                         |
| a design/measurement **spike** (feasibility, a handful of cells)  |             **27 min** |                                                            |
| `tighten-paper` applied, with a loss letter                       |             **34 min** | includes several build round-trips                         |
| **an experiment with real checkouts and installed dependencies**  | **≈4 h for 143 cells** | median cell **76 s**; the outlier by an order of magnitude |

## Provenance

Two real papers this session ran this pipeline end-to-end: **AgenticDev 2026 @ ASE** ("Measuring the
Wrong Number," ~90%, submitted #20) and **AISec 2026 @ ACM CCS** ("Safety Theater," Weak-Accept→~87–88%
after a panel round + confirm). The stage skills and shared refs are distilled from exactly those runs.
