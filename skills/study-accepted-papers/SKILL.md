---
name: study-accepted-papers
description: "Learn what a target venue rewards from its own accepted papers and award winners, and turn it into requirements for your study or a diagnosis of your draft. Use EARLY, in SETUP right after find-venue and before the study is designed, so the venue's bar shapes the experiment (mode A idea, mode B design); and LATE, once text exists (mode C draft: score the paper against the strong-accept mechanisms M1–M10 with line references, blockers, owners and a plan; mode D final: the abstract and introduction, sentence by sentence). Always asks which mode, suggesting one from what exists, and asks the claim, breadth, depth (L0–L3) and budget up front, each with a default and a time estimate. Keeps one corpus per venue in <papers-root>/venues/<venue>/, shared by every paper that targets it; the venue's winners vs its ordinary papers and award papers on the topic at other venues are two corpora, labelled apart. Names the proxy for 'strong accept' and its base rate before any probability. Distinct from find-venue (picks WHERE), research-ideate (is the idea worth doing), map-prior-work and analyze-sibling-paper (your rivals, not the venue's bar), and pc-panel-review / paper-adversarial-review (red-team your draft)."
context: fork
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, Agent]
---

<!-- vigiles:sha256:03ff4d9234d476eb compiled from skills/study-accepted-papers/SKILL.md.spec.ts -->

# study-accepted-papers — what this venue rewards, measured on its own papers

Reviewers score against the papers that got in before. This skill makes that standard explicit, from
the venue's **accepted papers and award winners**, and turns it into something the author can act on:
requirements for a study not yet run, or a scored diagnosis of a draft.

It answers a different question from its neighbours:
- `find-venue`: *where* should this go?
- `research-ideate`: is the *idea* worth doing?
- `map-prior-work` / `analyze-sibling-paper`: who are the *rivals*, and is the delta real?
- `pc-panel-review` / `paper-adversarial-review`: what is wrong with *my draft*?
- **`study-accepted-papers`: what does it take to be *strong* at THIS venue, judged by its own papers?**

**Two entry points, one skill.** In `paper-pipeline` it sits in SETUP, right after `find-venue`: the
venue's bar is worth most before the study is designed, when it can still decide what the oracle is and
which belief the claim targets. It comes back once text exists, to score the draft. Run it only late
and its main findings arrive after they could change the design.

Two references beside this file, read before any level above L0:
- [`references/mechanisms.md`](references/mechanisms.md): the mechanisms M1–M10 that separated award
  winners from ordinary accepted papers in the run this skill was rebuilt from, with what supports each
  and what each is not. Form (figures, length, title shape) did **not** separate them.
- [`references/base-rates.md`](references/base-rates.md): the proxies for "strong accept" and the only
  public score data found for software-engineering venues.

## Step 0 — ask before spending (always)

**Ask which mode. Always.** Look at what exists first, then suggest one; do not pick silently, and do
not start until the author answers (or the caller already passed a mode).

| mode | what exists | it compares | it produces | default depth |
|---|---|---|---|---|
| **A idea** | an idea and a target venue; no paper source | the venue's winners against its ordinary papers | what this venue rewards, written as **requirements for the study**: what the oracle is, which stated belief the claim targets, which factor must be a column | L1 (+ L0) |
| **B design** | a planned claim and measurements (the `frame` row, a design note in `research/`); no text | the planned claim and evidence against M1–M10 | **design gaps before anything runs** ("the headline rests on model labels", "no named belief") | L1 + the M1–M10 check of the plan |
| **C draft** | the paper's text | the draft against M1–M10 and the deep reads | the **scorecard**: pass / partial / fail per mechanism with `file:line`, blockers with cost and owner, a plan, probabilities against stated base rates | L2 + L3 |
| **D final** | near-final text, the deadline close | the abstract and introduction, sentence by sentence, against the closest winners | **wording**: the denominator in every claim sentence, the named belief, no drift between abstract and body | L3, wording only |

Suggest from the project: no `paper.tex` → A, or B if a claim is already written down; `paper.tex`
with a body → C; the current cycle's submission deadline within about a week → D. Say why you suggest it
("C: paper.tex has a full body, and the deadline is 20 days away"), and let the author override.

**Then the four questions, in one message, each with its default and its time.** The author may answer
"defaults" to all of them.

1. **The claim**, in one paragraph. Default: the `frame` row of `PIPELINE-STATUS.md`, else the
   abstract. *Without it the deep-read selection is blind.* (Author: about 5 minutes.)
2. **Breadth.** Default: **two corpora, labelled apart**: (1) the venue's own award winners against its
   ordinary accepted papers, over 5–7 years; (2) award papers on the author's topic at other venues.
   Corpus 1 says what *this* committee rewards; corpus 2 says how strong papers on this topic make a
   broad claim convincing, which matters when the venue has no winner on the topic. Never pool them.
3. **Depth**, L0–L3 (below). Default: the mode's row above.
4. **Budget**: agent time, money, and the author's own hours. Default: the sum of the chosen levels.
   Ask again before going over it.

## The depth levels

| level | what it does | rough cost (from the run) | answers |
|---|---|---|---|
| **L0 form** | count body words, figures, tables, research questions, abstract length, statistics markers, artifact links across the venue's accepted papers | minutes | formal fit only. Say that form did **not** separate winners in the run (`references/mechanisms.md`) |
| **L1 winner corpus** | every award winner the venue lists over 5–7 years against the ordinary accepted papers of the same years; code form **and** substance per paper: the oracle under the headline (execution / developer action / human / model-only), a belief the field stated on record, the claim shape, a controlled design, the contribution sentence verbatim | about 30 min of agents | what does this venue reward? |
| **L2 deep reads** | a judge, briefed with the author's claim, picks 8–12 papers: winners closest to the claim plus **award / no-award pairs on the same question or dataset** (the pairs were the most informative part of the run); one agent per paper, full text, one shared reading brief | about 1 h of agents (parallel readers) | how do strong papers on this topic make a broad claim convincing? |
| **L3 diagnosis** | score the author's plan or draft on each mechanism; blockers with cost and owner; a plan; probabilities against the base rates | about 30 min | can this paper reach strong accept, and what stands in the way? |

Each level states **its proxy for "strong accept" and its base rate**, and which conclusions rest on
fewer than ten papers.

### L0 — measure all of the accepted set

The value of L0 is a **denominator** ("33 of 34 accepted papers have a figure"). A sample of 8–12 cannot
give one. A workshop's accepted volume is 30–60 papers: take all of them. For a main conference, take
the track or the topic, capped at about 100, and **state the cap and why**; a silently truncated corpus
gives denominators that are quietly wrong. Cross accepted papers with archival status before calibrating:
an oral that is non-archival is not the paper your archival submission competes with.

### L1 — the winner corpus

Take the venue's award list (its hall of fame, the awards page of each year's program) for 5–7 years,
not one year: a single year of five winners produced a "winners have many figures" pattern that vanished
over seven years. Code every winner and every ordinary paper of the same years with the same fields, so
each "winners do X" has an ordinary-paper count beside it. Report k/n for both groups and a test with a
correction for the number of features; a non-significant difference is reported as such.

### L2 — the deep reads

The selection is part of the result: save it with the reason for each pick, and say how many came from
corpus 2 and why ("the venue has no winner on this topic"). One agent per paper, full text, every page.
The shared brief asks three questions: what is the single claim and why does a reviewer believe it; what
makes it stronger than its ordinary neighbours; what in it maps onto the author's claim. Each reading
quotes verbatim with page numbers.

### L3 — the diagnosis

Score the paper against M1–M10 (`references/mechanisms.md`), with evidence as `file:line` in the paper
source. Every `fail` gets an owner and either a plan or an explicit **"accept ceiling"** with the
reason: a ceiling written down is a decision, a silent fail is a hole. Probabilities are a band, marked
as judgement, against the base rates of `references/base-rates.md`; simulated panels run hot.

## Where the results go — one home per fact

| what | where | why there |
|---|---|---|
| **the venue corpus** | `<papers-root>/venues/<venue>/` (the papers directory from the project's `paperlint.json`) | **shared by every paper that targets the venue**, collected once and reused by every later mode. `MANIFEST.md` (sources, years, what was capped, the proxy and its base rate), the winner and ordinary lists, `measurements.json` (L0/L1 codes, one row per paper), `text/` extractions, the scripts, `deep-reads/` (one file per paper, reusable by any paper). Corpus 2 goes in its own labelled subfolder. **PDFs are not committed**: record the IDs and the command. |
| **the scorecard** | the section **"Venue-bar scorecard (M1–M10)"** of the paper's `PIPELINE-STATUS.md` | a row per mechanism: status (pass / partial / fail), evidence (`file:line`), owner, plan or "accept ceiling". **The only place the verdicts live**; update it there. |
| **the reasoning** | `<paper>/reviews/<YYYY-MM-DD>-study-accepted-<venue>-<mode>.md` | a dated report per run, with frontmatter (below). It keeps the reasoning, the selection and the per-mechanism argument, and **points to the scorecard section; it never copies the table**. |
| **the stage** | the `venuebar` row of `PIPELINE-STATUS.md` (SETUP) | status, date, the mode and depth run, and a link to the report. One row, updated by every mode. |
| **the generic list** | `references/` beside this skill | M1–M10 and the base-rate sources. A mechanism your venue adds, or one that does not hold there, goes in the venue corpus's `MANIFEST.md`; the ids stay stable. |

The paper folder has **no corpus folder of its own**: `paper/folder-layout` reports one, and the hook
says so the moment it is written. A venue's format facts (page limit, template, required sections) go
in its preset and venue card (`presets/<venue>.jsonc` and `.md` in the package, or the project's
own), with their source quote, not here.

The report's frontmatter (it lives under `reviews/`, so `review/frontmatter` validates it; a
`findings` list is optional and follows that schema):

```yaml
---
title: "<venue>: what it rewards, and where this paper stands (mode C, L2+L3)"
created: 2026-10-12
venue: <venue>
mode: C
depth: [L2, L3]
proxy: "distinguished-paper award, <k> of <n> accepted, <years>"
corpus: <papers-root>/venues/<venue>/
scorecard: PIPELINE-STATUS.md#venue-bar-scorecard-m1m10
---
```

## Before any level: pin the venue's stated bar

`WebFetch` the current call for papers and, if separate, the reviewer guidelines. Capture in the
venue's own words: the **track requirements** (a missing required element is a desk reject, never a
weak accept, so check these first); the **review criteria**; the **award criteria** if published; the
**PC chairs and members**, whose research areas are a findable signal of taste.

## Rules

- **Fetch real papers.** Never fabricate a title, an author, or "what made it strong". Unverifiable →
  drop it or mark VERIFY.
- **Evidence levels on every finding**: quoted from a paper or file · counted from the corpus · judgement.
  A judgement is never written as a count.
- **Do not quote an acceptance rate** unless the venue published the number of submissions.
- **A citation this skill proposes is not written into the source until `verify-citations` confirms it.**
  If added provisionally, mark `% VERIFY` at the cite; a surviving `% VERIFY` at submit is a bug.
- **"Accepted" is the reference, "strong" is the target.** Isolate what got in enthusiastically, against
  ordinary papers of the same years, not what got in.
- **Venue-specific, not generic.** A lever counts only if this venue's papers, rubric or committee ground
  it. Prose craft is `grade-paper-writing` and `tighten-paper`.
- **Cheap or expensive, and the deadline.** Tag every lever: CHEAP (framing, a scoped sentence, a cited
  belief, a missing citation) or EXPENSIVE (a new oracle, a new column, a new corpus). In mode C or D an
  expensive lever is normally an `extend-paper` task or an accepted ceiling, said explicitly; in modes A
  and B it is exactly what the study should include.
- Convert any deadline that surfaces to the author's own zone and hand it to `plan-paper-timeline`.

## Compose with

- `find-venue` (upstream) → this skill in mode A; `argument-arc` (frame mode) takes its requirements.
- `build-benchmark` — takes mode A/B requirements (the oracle, the column) into the study design.
- `harden-paper` — the pre-submit gate; this skill gives it the venue-specific content axis.
- `pc-panel-review` / `paper-adversarial-review` — red-team the draft; this skill says which bar the
  red-team should hold it to.
- `analyze-sibling-paper` — a deep read that turns out to be a rival goes there for the scoop question.
- `verify-citations` — takes the citation gaps.
- `extend-paper` — the home of every expensive lever deferred past this submission.
