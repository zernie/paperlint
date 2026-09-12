---
name: argument-arc
description: Build or repair the paper's argument architecture — the one-sentence-per-section outline, the bottom-up inevitability pass, and the name/number budget. Run it when the reader says the paper throws ideas at them, when a structural objection repeats, or before any large rewrite. Not a prose or length skill.
allowed-tools: [Read, Write, Grep, Glob, Agent, Bash(node .claude/skills/paper-pipeline/scripts/announce.mjs:*), Bash(node .claude/skills/paper-pipeline/scripts/ledger.mjs:*)]
---

<!-- vigiles:sha256:61a2b936745c94fc compiled from skills/argument-arc/SKILL.md.spec.ts -->

# argument-arc — does the paper carry the reader to one conclusion

> **Which structure skill?** `tighten-paper` = length, sag, what to cut. `grade-paper-writing` =
> sentences, jargon, where a reader stalls. **`argument-arc` (you are here) = the load-bearing order
> of ideas.** The first two assume the argument is right and the delivery is wrong. This one asks
> whether the argument exists. Run it *before* them — cutting words inside a broken arc is how a
> session burns a day and ships the same paper.

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs argument-arc <paper-dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

The failure it exists to catch has a signature: every paragraph is defensible, every number is real,
and the reader still finishes the section unable to say what it was for. That is not a prose problem
and no amount of rewriting sentences fixes it.

## Two modes — and one of them runs BEFORE the study exists

| Mode | Where it runs | Scorecard row | What it produces |
|---|---|---|---|
| **frame** | SETUP, before any run | **`frame`** | **One paragraph: what will this paper claim, and what would have to be true for that claim to hold?** |
| **rebuild** | the LOOP, on a draft whose framing is wrong | `arc` | A new arc, built from scratch through steps 1–4 |

### Frame mode (SETUP) — one paragraph, before the first run

Write it before the study is designed. Not an abstract, not an outline — **a paragraph saying what
the paper will claim** and what would have to be true for that claim to hold.

**Why it is here and not later:** the frame decides which results matter. A study designed without a
stated claim measures what the harness can already see, and then the claim gets fitted to whatever
came out — which is how a run gets thrown away. That is not hypothetical: it was observed on
`the reference paper`, and it is the reason this skill has a rebuild mode at all. **Reframing after the
data is collected costs the data. Costs a paragraph; saves a study.**

`build-benchmark` reads this paragraph before designing, and refuses to proceed if `frame` is empty.
`pipeline-check.mjs` reports a study that ran with no stated claim.

*Added 2026-08-03 alongside the replacement of the numbered stage list — this skill previously existed
only as a repair, which meant nobody stated the claim while stating it was still cheap.*

## When the arc pass fires (row `arc`, in the LOOP)

- 🔴 **A structural objection repeats.** Not "this is unclear" but *"it throws ideas at me"*,
  *"I can't hold this in my head"*, *"where is this going"*. **The second time you hear the same
  objection, stop editing and run this.** The third time means you already ignored the second.
- Before a rewrite touching more than one section.
- After a claim dies. When a refutation pass kills a load-bearing claim, the arc built on it is
  usually dead too, and it will not announce itself — the sections still read fine one at a time.
- Before `tighten-paper` / `grade-paper-writing` / `pc-panel-review` on any draft whose thesis has
  changed since those gates last ran.

## How to run it

### 1. Write the conclusion first, in one sentence, in the author's own words
Not the abstract. The sentence you want the reader thinking as they close the paper. If it takes two
sentences, the paper has two papers in it and that is the finding.

Ask the author for it if there is any doubt. A conclusion you inferred is a conclusion you will
defend against them.

### 2. One sentence per section: what does the reader carry out
Build the whole outline as a flat list, section by section, each line answering **only** *what does
the reader now believe that they did not believe before this section*. Not "what this section
covers" — coverage is a table of contents and it hides the defect.

Then read the list on its own, without the paper:
- **Two lines carrying the same belief** → the sections merge. No exceptions; "but they use different
  evidence" means one section with two pieces of evidence.
- **A line you cannot write** → that section has no job. It goes to the artifact or it goes away.
- **A line that is a topic, not a belief** ("we survey related work") → rewrite it as a belief or
  admit the section is filler.

### 3. The inevitability pass — bottom to top
Start at the conclusion and walk **upward**, asking at each section: *does this make the conclusion
harder to escape?* A section that merely supports the conclusion is not enough; the test is whether
removing it lets the reader wriggle out.

This direction matters. Top-down you will narrate the paper you wrote. Bottom-up you find the
sections that are true, interesting and load-bearing for nothing.

### 4. Count the names
Count every named system, benchmark, corpus and acronym in the body. For each, ask: **must the reader
remember this later?** If the answer is no, it becomes an unnamed instance ("one corpus study",
"a trace monitor") or a citation, and the name moves to the artifact or a footnote.

Report the count. A reader who says they cannot hold the paper in their head is usually telling you
this number, not the word count. There is no correct threshold — but a body carrying more names than
sections is worth arguing about.

### 5. 🔴 Show the outline to the author BEFORE editing anything
The deliverable of this skill is the outline and the verdict, **not a rewritten paper**. Hand over:
the one-sentence conclusion · the section list · which sections merge, move, die · the name count ·
the single biggest arc defect in one sentence.

Editing before this is agreed is how five patch rounds happen. The author asked for an architecture;
returning a diff answers a question they did not ask.

## The rebuild mode — when the frame itself is wrong

Every other gate in the pipeline assumes a settled draft and improves it. None has a mode for *the
framing is wrong, start the arc over*, which is why gates feel inappropriate exactly when the paper
most needs help. This skill does:

- **Do not defend the current form because it exists.** The question is *"if all this work had been
  done yesterday by someone else, would I choose this shape?"* Time already spent is not evidence.
- **Salvage explicitly, in writing:** which measurements survive the reframe untouched, which need
  re-analysis, which die with the old frame. Measurements usually survive; framing paragraphs rarely do.
- **A deadline bounds how much you rebuild. It is never an argument that the current shape is right.**
  If the author says the paper is *weak*, that is a quality judgment, not procrastination, and citing
  the calendar against it is a category error.
- **Rebuild produces a new outline through steps 1–4 above, and it too gets shown before editing.**

## Record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record argument-arc <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record argument-arc <paper-dir> ABSTAINED <reason> "<one line>"
```

🔴 **There is no PASS.** "The arc carries the reader" is not a value this pass can write down; it is
what a reader may conclude from the absence of findings, and the concluding is theirs.

**FINDING** — the arc is broken; `<count>` is the number of sections the new outline moves, merges
or deletes, and `<report-path>` is that outline. Add `--blocking` when there is no conclusion
sentence to build an arc from: that refusal is a finding about the draft, not an aborted run, and
`<report-path>` is the one-line statement of what is missing.
**ABSTAINED** — `no-witness`: the outline was read end to end and nothing moved. `blocked`: there
was no outline to read at all.

An `ABSTAINED no-witness` on a draft the author has twice called a pile is a missed finding, and
`status.mjs` will start asking about a check that has only ever abstained.

## Rules

- **The arc is judged on the outline, never on the draft.** If you find yourself rereading paragraphs
  to decide whether a section belongs, you are grading prose again.
- **Merge is the default remedy, deletion the second.** Most arc defects are two sections doing one
  job, not a section doing nothing.
- **Never answer a structural objection with a local edit.** Moving a paragraph and reporting "done"
  is the exact failure this skill was built from.
- **The author's confusion is data about the paper, not about the author.** If they ask twice what a
  section is for, the section is the problem.
- **Say what the reader must hold in their head at each point.** If that set only grows, the arc is
  a pile.

## Compose with

- **Before** `tighten-paper` (length/sag) and `grade-paper-writing` (sentences/stalls) — both assume
  the arc holds. Their verdicts are the gate inputs `pc-panel-review` demands.
- **After** any refutation pass that killed a load-bearing claim (see the paper's `CLAIMS.md`).
- `sweep-design-space` when the outline shows the paper has no distinctive move to make — that is a
  design problem, not an arc problem.

## Provenance

Built 2026-07-30 after a full-day rewrite of `the reference paper` in which the author said the same
thing five times — *«не проводит читателя последовательно через мысли, а просто бросает в него кучу
разных идей, референсов, бенчмарков»* — and got five local edits in reply. The pipeline had a skill
for length, a skill for sentences and a skill for defects; the question *does this paper carry the
reader to one conclusion* belonged to nobody, and that is the one that failed.
