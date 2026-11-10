---
name: cold-read-diff
description: Send just-changed paper prose to two readers with NO context — an engineer who asks what each sentence claims, and a skimming workshop reviewer who asks whose result it states and whether it reads like a paper — the only check that catches a sentence which is short, true, jargon-free and still meaningless to anyone who does not already know the idea. Run after every prose edit to a paper, before calling the edit done, and before reporting a section as fixed. Scoped to the diff, so it is cheap enough to run every time. Not a writing grade (grade-paper-writing), not a structural pass (tighten-paper), not a defect review.
allowed-tools: [Bash, Read]
---

<!-- vigiles:sha256:da6ae4b12e035d8a compiled from skills/cold-read-diff/SKILL.md.spec.ts -->

# cold-read-diff — the reader who cannot fake understanding



## The failure this exists for

On 2026-08-05 the author of `the reference paper` found eleven unreadable passages by eye, in a paper
that had passed six writing grades, four structural passes and five review panels. Every one of them
was short, factually correct, free of every word on the jargon list, and inside every mechanical
threshold. Samples, with his reactions:

> *"The state to remove is therefore not the rule but its claim about itself"* — **«wtf»**
> *"these files are filled with constructions nobody built"* — **«wtf»**
> *"Three answers, all of them after the fact"* — **«VAGUE AF»**
> *"Both numbers carry a caveat…"* — **«WTF.»**

They share one property: **they parse only for a reader who already holds the idea.** That is not a
style defect and no metric can see it. Sentence length, number density, hedge share, tic frequency —
all green on every one of these.

## Why the existing pipeline could not catch it

Every reader in it knows too much or cannot read at all:

| reader | holds the idea? | can judge meaning? |
|---|---|---|
| the author | maximally — that is the curse of knowledge | yes |
| the persona subagent | **yes: it is handed the paper and the framing** | yes |
| the review panel | yes | yes |
| `prose-lint` | no | **no — it counts patterns** |

The gap between "knows too much" and "cannot read" is exactly where these sentences live. Closing it
needs a reader who is competent and **structurally uninformed**, and the only way to guarantee that
is to withhold the context rather than ask them to ignore it.

## Why the DIFF, and not the paper

A full cold read costs a long agent run, so it gets run once a day, which means prose written after
it ships unread. Scoped to the changed paragraphs it costs seconds (two paragraphs, measured
2026-11-10: 9.8 s and $0.03 for both readers), so it runs every
time — and coverage beats depth here, because the defect is per-sentence.

Scoping also makes the check honest. Hand an agent the whole paper and it reconstructs the idea from
the surrounding text, then reports that the sentence is clear. Hand it three paragraphs and there is
nothing to reconstruct from: if the sentence does not carry its own meaning, the agent cannot invent
one, and its confusion is the finding.

## How to run it

The read is one script. You start it **in the background** and keep working; it carries none of
this conversation, fixes nothing, and prints a short table when it is done.

1. **Start it** with the Bash tool and `run_in_background: true`:

   ```
   node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js <paper.tex> --venue="<venue name>"
   ```

   It diffs `<paper.tex>` against `--base` (default `HEAD`: the uncommitted edits), widens each
   changed line to its paragraph, drops working comments, floats and the bibliography, expands
   `{{placeholders}}` from `--macros=<file.json>`, and leaves every dash as written. Above 15
   changed paragraphs it refuses: narrow `--base`. `--extract-only` prints what a reader
   would get, without spending anything.
2. **What runs.** Two readers, in parallel, each `claude -p --model sonnet --tools ""` from an
   empty directory, each handed the paragraphs **as text in the prompt** and nothing else. A path
   is an invitation to read the neighbours, and reading the neighbours is how the check fails
   silently. `sonnet`: competent, cheap, and not the model that wrote the sentence.

   | persona | who | what only it can report |
   |---|---|---|
   | **the engineer** | a strong practitioner outside academia, reading closely | a sentence that parses only for a reader who already holds the idea |
   | **the workshop reviewer** | a PC member at the target venue with 40 minutes for the whole paper, skimming, Confidence 3 | a sentence whose result has no owner, a relation between claims left to infer, a sentence that does not read like a paper at this venue |

   The engineer cannot see the second column: a sentence with no stated owner reads to him as
   confident, and he does not know the venue's register. Both run, every time. The reviewer is
   told the venue's name and nothing else.

   The engineer is asked, per sentence, *what does this claim, in your own words?* (`CANNOT
   PARSE` when restating needs a guess) and *would a reader who stops here understand it?*
   (`ONLY-IF` they know X). The reviewer is asked *whose result is this?* (`WHOSE?`) and *does
   it read like a paper at this venue?* (`REGISTER`). Both are asked for the dangerous class,
   `CLEVER`: a sentence that sounds clever but says less than it appears to.
3. **Wait without blocking.** Progress lines go to the background job's stderr. Do the next
   thing; the job's completion wakes you.
4. **Relay the table, not the report.** The script prints at most 15 lines: counts, the
   report's path, one row per finding. The full report, with both readers' answers verbatim and
   the tokens each spent, is in the paper's `reviews/` folder. Do not paste it into the
   conversation.
5. **The caller decides the fixes.** The read changes nothing in the paper and builds nothing.
   Show the author the table; apply a fix only when asked, or when your task already was "fix
   the prose", and then as a rewrite of the whole thought, never an excision (see the rule
   below). Record each finding in the report's frontmatter once it is decided.
6. **Confirm once, on the fix.** Run the script again on the rewritten paragraphs — nothing else
   changed since the first read, so the same command reads only them. An edit is not done until
   the engineer parses the replacement AND the reviewer finds its owner and its register. A fix
   for the engineer that goes colloquial is a new `REGISTER` finding, and the reverse holds too.
   One confirming round; do not loop past it.

## 🔴 Hand the reader WHOLE PARAGRAPHS, never `+` lines

Measured on 2026-08-05, first machine run of this skill: about a third of the reader's stalls were
artefacts of the extract, not defects in the paper — *"`it` has no referent"*, *"this sentence is cut
off mid-clause"*, *"those populations have no antecedent"*. The neighbouring sentences simply had not
changed, so they were not in the diff.

Two more things the same run proved:

- **Expand build-time macros first.** The reader saw seven raw `{{placeholders}}` and correctly
  reported that every headline number was missing. That is a true statement about the extract and a
  false one about the paper.
- **Strip working comments.** He graded `% JUSTIFY …` comment notes as prose because he could not tell
  them apart — and said so, which is itself a finding about the extract.

**So** the script takes the changed lines, widens each to its enclosing paragraph, expands
macros, drops comments, and hands the reader continuous prose. The findings that survive that are worth the run; the
ones that do not are noise, and noise is how this check gets muted.

## The report's frontmatter — the findings, as records

Once the findings are decided, the report opens with YAML frontmatter that lists them, one
record per finding. The script cannot know a finding's pipeline `cause`, so it writes none;
you add them.
`paperlint lint` validates it (`review/frontmatter`): an **open** finding must name the
pipeline `cause` that let it through — fix that, and the text edit falls out of running the
fixed tool.

```yaml
---
findings:
  - id: 1
    status: open            # open | fixed | wontfix
    cause: missing-skill    # skill-defect | missing-skill | hook | rule — required when open
    title: "§3 opens on a term the reader has not met"
  - id: 2
    status: fixed
---
```

## Rules

- 🔴 **No context in the prompt. Ever.** Not the title, not the abstract, not "this is a paper about
  agent rules files". Every sentence of background handed to the reader is a sentence of confusion
  they will no longer report. The one exception is the venue's name, given to the reviewer persona:
  judging register without knowing the venue is guessing.
- 🔴 **A fix that removes the flagged construction and keeps the compression is not a fix.** Proven
  twice in one hour: *"not through any defect in how we write it, but because that is what English
  is"* → *"that is what English is for"* (tic gone, meaning inverted into nonsense); *"the agent
  turns out not to be the weak link"* → *"The agent obeys"* (three words, zero flags, wrong finding).
  Rewrite the **thought** in plain words. The tic is usually a symptom of a compressed idea, and
  decompressing removes it as a side effect.
- **Length is not the constraint here — meaning is.** If plain language needs more words, take them
  and pay from an appendix, which is outside the page limit. Paying by shortening another sentence
  is what created the problem.
- **`CANNOT PARSE` is a result, not a failure of the reader.** Never argue with it. The author's
  ability to understand his own sentence is not evidence about anyone else's.
- **Run it on your own fixes too.** The author is the least qualified judge of whether his repair
  reads, and that is exactly when he feels most certain.

## Compose with

- `grade-paper-writing` — the batch readability gate; this is its continuous counterpart. That one
  produces a stall inventory over the whole paper; this one asks whether the last edit means anything.
- `tighten-paper` — structural cuts. Note the interaction: a tighten pass that pays for an addition
  by shortening sentences elsewhere is precisely what generates work for this skill.
- `paper-pipeline` — owns the text-pass / evidence-pass split; this belongs to the text pass.

## Provenance

Built 2026-08-05, the day before the `the reference paper` deadline, after the corpus owner read the built PDF and
found eleven unreadable passages in twenty minutes — none of which any automated check had flagged,
and several of which had been introduced that same morning by fixes to other automated checks.
