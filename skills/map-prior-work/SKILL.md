---
name: map-prior-work
description: Sweep the competitive landscape for a paper idea BEFORE drafting — find everyone already working on it, date each against your submission (prior vs concurrent is a five-month question, not a vibe), triage by whether they threaten your claimed contribution, deep-read the ones that do, and emit a verdict on WHAT YOU CAN STILL CLAIM plus a related-work skeleton. Saves the full map, not a summary. Use right after research-ideate and before draft-paper, and re-run as a cheap delta pass before submit (hot fields move). Distinct from analyze-sibling-paper (one known competitor, deep) — this one FINDS the competitors and decides which deserve that treatment; distinct from verify-citations (checks cites you already wrote, too late to reshape a contribution); distinct from study-accepted-papers (mines a venue's bar, not your rivals). Compose with research-ideate (upstream), analyze-sibling-paper (it hands off), draft-paper and find-venue (downstream).
context: fork
allowed-tools: [WebSearch, WebFetch, Read, Write, Grep, Glob, Bash, Agent]
---

<!-- vigiles:sha256:353e5a21b731a548 compiled from skills/map-prior-work/SKILL.md.spec.ts -->

# map-prior-work — find out who already did it, while you can still change course

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs map-prior-work <paper-dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The expensive failure this prevents, in one sentence: **you discover the paper that already did your
contribution after the draft is finished, when the only move left is rewriting the claim under deadline.**

Grounding: the original-contribution criterion. A paper
a reviewer reads as a repackaging earns no authorship credit even if it is accepted. Composes with
`research-ideate` (upstream: it validated *whether* the idea is worth doing; this validates whether it is
still *yours*), `analyze-sibling-paper` (this hands it the papers that need a full read), and
`draft-paper` (which consumes the related-work skeleton).

## Why this exists — the failure it was written from

**Real case, 2026-07 (paper #3).** The idea was validated, the venue picked, the study run, the paper
drafted, the artifact built. At **T−10 days** a *citation audit* — a late mechanical check, not a search —
stumbled onto a paper that had shipped the same construction **five months earlier**, with an
implementation matching the paper's own §6. Consequences:

- The headline contribution had to be rewritten under deadline.
- The related-work section had described that paper **incorrectly**, in exactly the direction that made
  room for the claimed novelty — the reading a reviewer punishes hardest.
- Two more neighbors then had to be read in one night, and one of them overturned a second claim.

None of that was bad luck. **No unit of work in the pipeline was responsible for looking.**
`verify-citations` surfaces neighbors, but it is a CONTINUOUS check over cites **already written** —
it fires after the draft exists, and it can only see what you already decided to cite. This skill is
the work that was missing.

## Two modes, and they live in different parts of the pipeline

This skill is deliberately **not one thing in one place**. It has two modes, and the scorecard
(`paper-pipeline/references/pipeline-status-template.md`) gives them two separate rows, because a
green sweep from month one says nothing about the field today.

| Mode | Where it lives | Scorecard row | When it fires |
|---|---|---|---|
| **SETUP sweep** (the full thing below) | SETUP, right after `research-ideate` says go | **`priorwork`** | Once, before any drafting. Cheapest moment — the contribution is still a sentence, not a structure. |
| **CONTINUOUS delta** (re-sweep, restricted to work posted since) | CONTINUOUS — a trigger, never "done" | **`priordelta`** | **Whenever the contribution's framing moves**, and again before `harden-paper`. In a hot area a two-month-old sweep is stale. |

Also fires **reactively** in delta mode: a reviewer says "this was already done", an arXiv alert
surfaces something close, or a `verify-citations` run turns up a neighbor you had never seen.

⚠️ **If a rival first surfaces during citation checking, the SETUP sweep (`priorwork`) was skipped** — and
you are now reshaping the contribution under deadline, which is exactly the failure above. Treat that
as a finding about the process, not only about the rival.

*The two modes used to be one entry in a numbered stage list, which could only show one of them; that
list was replaced on 2026-08-03 by the four kinds of work in `paper-pipeline`.*

---

## Step 1 — write down what you are claiming, before searching

One sentence, falsifiable, in the form: **"We are first to ___."** Then split it:

| Layer | Example | Who can take it |
|---|---|---|
| **Construction** | "compile prose rules into executable checks" | anyone who built it first, *regardless of quality* |
| **Measurement** | "measure how often stated rules are enforced in real repos" | anyone with the same corpus study |
| **Guarantee** | "abstain unless the synthesized checker survives a blind gold set" | anyone with the same decision procedure |

🔴 **These are lost independently.** Losing the construction does not lose the guarantee. Write all three
down *now* — otherwise a single hit feels like total loss and you rewrite more than you must.

## Step 2 — sweep, from multiple angles

Do not run one query. Run **at least five angles**, because a neighbor that uses different vocabulary is
exactly the one you will miss:

1. **Your own terms** — the phrasing you use in the claim.
2. **Their likely terms** — what would a group from a different subfield call this? (Same idea travels as
   "policy", "constraint", "specification", "guardrail", "contract", "config".)
3. **By artifact** — the thing you built, not the idea (tool names, file formats, benchmark names).
4. **By venue** — recent proceedings of the venues you'd submit to, and their workshops.
5. **By citation graph** — who cites the 2–3 works you consider closest, and what those works cite.

Sources, in order of reliability: **arXiv listings + full-text search · ACL Anthology · DBLP · Semantic
Scholar · venue proceedings pages · OpenReview**. Blogs and social posts count as leads, never as
findings.

**Parallelize.** One subagent per angle, each returning candidates with title, authors, venue, date, and
two sentences on what it does. Deduplicate afterwards in plain code, not by another agent.

## Step 3 — date everything against YOUR submission date

For each candidate record **v1 date**, latest revision, and acceptance status.

| Gap to your submission | Status | What you may write |
|---|---|---|
| Published **before** by more than ~3 months | **prior work** | Cite it. You may not call it concurrent. |
| Within roughly ±3 months | **concurrent** | "independently and concurrently" is defensible — say so explicitly |
| After your submission | not your problem | ignore for this cycle; note for the extension |

🔴 **Five months is prior work, not concurrent.** Wanting it to be concurrent does not make it so, and a
reviewer checks the arXiv date in one click. Also record **acceptance**: a preprint and a paper accepted
at a real venue carry different weight, and describing an *accepted* work incorrectly costs more.

## Step 4 — triage against the three layers

For each candidate, mark which layer it threatens:

| Verdict | Meaning | Action |
|---|---|---|
| 🔴 **SCOOPED** | takes a layer outright | that layer is gone — reshape the claim **now**, while it's cheap |
| 🟠 **OVERLAP** | same territory, different question or method | must be read in full and positioned precisely |
| 🟡 **ADJACENT** | cited for context, threatens nothing | one accurate sentence in related work |
| ⚪ **IRRELEVANT** | surfaced by the sweep, doesn't apply | list it anyway, so the next sweep doesn't re-litigate |

## Step 5 — deep-read everything 🔴 and 🟠 — hand off to `analyze-sibling-paper`

**Never triage a close paper from its abstract.** Two abstracts in the real case above were actively
misleading:

- one made a *constructive* system read as a measurement tool (the word its title implies appears **zero
  times** in its body);
- another **omitted its matched-pair design**, so a check based on the abstract concluded "no present/absent
  control" when the full text has one, with real effect sizes in a table.

Both errors pointed the same way: **toward believing we were more novel than we were, or that a rival was
weaker than it was.** Read the paper.

**Formulate the read as refutation:** *"try to show this scoops us."* A clean negative is a valid result;
a confirmation you did not try to break is not.

## Step 6 — the output that matters: what you can still claim

Do not stop at a list of papers. The deliverable is a **verdict on the claim**:

- ✅ **HOLDS** — the sentence from Step 1 survives as written.
- ⚠️ **HOLDS NARROWED** — give the exact replacement sentence, ready to paste.
- 🔴 **DOES NOT HOLD** — say which layer is gone and what remains. If nothing remains, say that: killing
  an idea at sweep stage costs days, killing it at review stage costs a cycle.

Plus a **related-work skeleton**: for each 🔴/🟠, two to four sentences in English, correct about *them*
first and about your delta second. Correctness about the rival is the load-bearing half — a reviewer who
knows the work reads a wrong description as a stretch, and that contaminates trust in your measurements.

## Step 7 — save the map, not a summary

Per `../../CLAUDE.md` (research is recorded verbatim, in detail):

```
<papers-root>/<paper>/siblings/
├── README.md                      # index: table of every candidate + verdict + what's unread
├── <date>-<name>.md               # one file per deep-read (analyze-sibling-paper's output)
└── <date>-sweep.md                # the sweep itself: queries run, sources hit, candidates
                                   # dropped and WHY, coverage gaps stated honestly
```

**Record what you did NOT find and could not reach** — a paywalled venue, a dead repo link, a search that
returned nothing. The next sweep starts from that, and "nothing found" is only useful if it says where
you looked.

---

## Step 8 — record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record map-prior-work <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record map-prior-work <paper-dir> ABSTAINED <reason> "<one line>"
```

**FINDING** — `<count>` is the number of rivals triaged 🔴 or 🟠 (they threaten the claim),
`<report-path>` is the sweep file. Add `--blocking` when a rival did the contribution first and the
claim has to change.
**ABSTAINED** — `no-witness`: swept, and nothing found threatens what you claim. `blocked`: the
paper has no stated contribution yet, so there is nothing to sweep against.

That blocking finding is the outcome this skill was written from, discovered at T−10 days by
accident. Recorded here it is a dated fact about the field rather than a memory of a bad night.

🔴 **There is no PASS**, and this skill is where the reason is easiest to see. "Nothing threatens
the claim" is a statement about everything that exists, made by a sweep that read a bounded list —
so it can never be witnessed, only ever failed to be refuted. `no-witness` says that in one word,
and the sweep's own coverage-gaps section says how far the reading actually went.

## Rules

- **Mark evidence level on every claim:** `[A]` full text · `[B]` abstract/metadata · `[C]` your
  inference. The distinction between "I read this" and "I concluded this" must survive being retold —
  it is precisely what erodes when a finding is summarized twice.
- **Dates are facts, not judgment calls.** Record them; do not characterize a five-month-old paper as
  concurrent because it reads better.
- **A rival being weak does not restore your precedence.** Their evidence quality and who was first are
  independent questions. "Second with better evidence" is an honest, publishable position; "first" when
  you are second is what gets caught and taints the rest of the paper.
- **Their weaknesses are your motivation, quotable from their own text.** A gap in a rival's validation
  that you can quote justifies your section far better than any adjective.
- **Do not delegate the claim decision.** A subagent maps; you decide what the paper claims.
