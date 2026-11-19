---
name: cold-read-diff
description: "Send just-changed paper prose to two readers with NO context — an engineer who asks what each sentence claims, and a skimming workshop reviewer who asks whose result it states and whether it reads like a paper — the only check that catches a sentence which is short, true, jargon-free and still meaningless to anyone who does not already know the idea. Run ONCE per batch of prose edits — when a section is done, before committing it — not after each edit: it reads everything changed since the last commit. Its whole-paper mode (--whole) is step 2 of the final review, in chunks of at most 15 paragraphs. Not a writing grade (grade-paper-writing), not a structural pass (tighten-paper), not a defect review."
allowed-tools: [Bash, Read, Write, Agent]
---

<!-- vigiles:sha256:bac18a98d1c16761 compiled from skills/cold-read-diff/SKILL.md.spec.ts -->

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
| the lint rules (`npx paperlint lint`) | no | **no — they count patterns** |

The gap between "knows too much" and "cannot read" is exactly where these sentences live. Closing it
needs a reader who is competent and **structurally uninformed**, and the only way to guarantee that
is to withhold the context rather than ask them to ignore it.

## Why the DIFF, and not the paper

A full cold read costs a long agent run, so it gets run once a day, which means prose written after
it ships unread. Scoped to the changed paragraphs the readers cost seconds (two paragraphs,
measured 2026-11-10: about 10 s and $0.03 for both), so it runs on every batch of edits — once
per section or commit, not once per keystroke — and coverage beats depth here, because the
defect is per-sentence.

Scoping also makes the check honest. Hand an agent the whole paper and it reconstructs the idea from
the surrounding text, then reports that the sentence is clear. Hand it three paragraphs and there is
nothing to reconstruct from: if the sentence does not carry its own meaning, the agent cannot invent
one, and its confusion is the finding.

## How to run it

No fork and no extra orchestrator: you run it in this session, step by step, and the
only model calls are the two readers. They start in the background, so you keep working.

1. **Take the extract.** It is the LaTeX source of the changed paragraphs and nothing else:

   ```
   node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js <paper.tex> [--base=REV] --venue="<venue>"
   ```

   `--base` defaults to `HEAD` (the uncommitted edits). It widens each changed line to its
   paragraph and drops working comments, floats and the bibliography. A changed section heading
   comes by itself, marked `(heading)`: a skimming reviewer reads headings first and alone. The paragraph itself is the
   source as written, macros and all: only TeX knows what a macro prints (#462). Above 15 changed
   paragraphs it refuses: narrow `--base`.
2. **Start both readers in ONE message, each with the Agent tool, `model: "sonnet"` and
   `run_in_background: true`.** A subagent starts with no conversation history. Its prompt is
   its block from step 1's output, verbatim — no path, no title, no abstract,
   no word about the paper. A path is an invitation to read the neighbours, and reading the
   neighbours is how the check fails silently. `sonnet`: competent, cheap, and not the model
   that wrote the sentence.

   | persona | who | what only it can report |
   |---|---|---|
   | **the engineer** | a strong practitioner outside academia, reading closely | a sentence that parses only for a reader who already holds the idea |
   | **the workshop reviewer** | a PC member at the target venue with 40 minutes for the whole paper, skimming, Confidence 3 | a sentence whose result has no owner, a relation between claims left to infer, a sentence that does not read like a paper at this venue |

   The engineer cannot see the second column: a sentence with no stated owner reads to him as
   confident, and he does not know the venue's register. Both run, every time. The reviewer is
   told the venue's name and nothing else.

   **The prompts have one owner, `scripts/readers.ts`;** run step 1 with `--venue="<venue>"`
   and it prints each reader's whole prompt with the extract inside, under `=== engineer ===`
   and `=== reviewer ===`. Hand each block to its subagent verbatim. What they say:

   - **Both, first:** *The text is LaTeX source; read it as the printed sentence. A `{{name}}` is a value the build fills in, not a missing one. A ¶ marked (heading) is a section heading: read it alone, as a reader skimming the headings does.*
   - **The engineer:** *You are a strong software engineer outside academia. Answer from the text below alone; use no tools. For every sentence: what does it claim, in your own words? If restating needs a guess, the verdict is `CANNOT PARSE` and you say what stopped you (an undefined term, a pronoun with no referent, a number with no denominator, two clauses that do not connect). Would a reader who stops here understand it? If only one who knows X would, the verdict is `ONLY-IF`, naming X. A sentence that sounds clever but says less than it appears to is `CLEVER`. For a heading: could you say what the section is about from the heading alone? If it states a finding, does it say compared with what, and over what? If not, the verdict is `VAGUE HEADING`.*
   - **The reviewer:** *You are a programme-committee member at <venue>, with 40 minutes for a whole paper, skimming, Confidence 3. Answer from the text below alone; use no tools. For every sentence: whose result does it state — the authors' measurement, a cited work, or a property of the world? If you cannot tell, the verdict is `WHOSE?`. Does it read like a paper at this venue? If not, `REGISTER`, and what a paper there would write instead (an aphorism, a fragment, a colloquial turn, two claims side by side with the relation unstated). A sentence that sounds clever but says less than it appears to is `CLEVER`. A heading that names no concrete thing, or states a finding without its comparator or scope, is `VAGUE HEADING`.*
   - **Both, last:** *Reply with one markdown table, `| ¶ | verdict | sentence | why |`, one row per sentence or heading that is not fine, quoted exactly; nothing else. No rows if every sentence reads.* So what comes back is the findings, not a restatement of every
     sentence.
3. **Keep working, for at most 5 minutes.** Each reader's completion arrives as a notification;
   on two paragraphs a reader answers in about 10 s. A reader that has not answered after 5
   minutes is not waited for: stop it, and its column in the report is `no answer`, not a
   verdict.
4. **Check the term findings against the paper.** For each `CANNOT PARSE` or `ONLY-IF` that
   names a term, search the paper for where the term is defined. If it is, mark the row
   `defined in §N`: the reader was right that THIS paragraph does not carry it, so it stays a
   finding, and the author decides whether a reminder is needed or it is `wontfix`. The
   readers' verdicts are never changed; only this column is added, after they answered.
5. **Write the report, relay the table.** Save both answers verbatim, with the extract, to
   `reviews/<date>-cold-read-diff.md` in the paper's folder. Show the author at most 15 lines:
   the count, the report's path, and one row per finding (the first ten).
6. **The author decides the fixes; `rewrite-unclear` writes them.** The read changes nothing in
   the paper and builds nothing. When the author asks for fixes, or your task already was "fix the
   prose", hand the rows to `rewrite-unclear`, the one skill that rewrites for clarity: each row's
   paragraph, its verdict and the reader's words. Record each finding in the report's frontmatter
   once it is decided.
7. **Confirm once, on the fix, only when the author asks.** Run steps 1–5 again on the rewritten
   paragraphs. One confirming round; do not loop past it.

**No rows is a valid result.** A reader that returns no table has found nothing, and the read is
done: report "no findings" with the report's path.

## The whole paper, in chunks (the final review)

In the final review (`paper-pipeline`, "The final review") the read covers the whole paper once:

```
node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js <paper.tex> --whole --venue="<venue>"
```

It prints every paragraph and heading of the paper, cut into chunks of at most 15 (`--max`), each
under `=== chunk i of n: engineer ===` and `=== chunk i of n: reviewer ===`. Each chunk goes to its
own pair of readers, started as in step 2, and each reader sees only its chunk: a reader handed the
whole paper reconstructs the idea from the rest of it and stops reporting. Steps 3–6 are the same,
with one report for all chunks. It runs once per final review; the read after an edit is not repeated
unless the author asks for the one confirmation.

## 🔴 Hand the reader WHOLE PARAGRAPHS, never `+` lines

Measured on 2026-08-05, first machine run of this skill: about a third of the reader's stalls were
artefacts of the extract, not defects in the paper — *"`it` has no referent"*, *"this sentence is cut
off mid-clause"*, *"those populations have no antecedent"*. The neighbouring sentences simply had not
changed, so they were not in the diff.

Two more things the same run proved:

- **Say what a placeholder is.** The reader saw seven raw `{{placeholders}}` and correctly
  reported that every headline number was missing. That is a true statement about the extract and a
  false one about the paper, so the prompt says a `{{name}}` is filled in by the build.
- **Strip working comments.** He graded `% JUSTIFY …` comment notes as prose because he could not tell
  them apart — and said so, which is itself a finding about the extract.

**So** `scripts/cold-read.js` takes the changed lines, widens each to its enclosing paragraph,
drops comments, and prints the paragraph's source for the reader. The findings that survive that are worth the run; the
ones that do not are noise, and noise is how this check gets muted.

## The report's frontmatter — the findings, as records

Once the findings are decided, the report opens with YAML frontmatter that lists them, one
record per finding.
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
- **`CANNOT PARSE` is a result, not a failure of the reader.** Never argue with it. The author's
  ability to understand his own sentence is not evidence about anyone else's.
- **Run it on your own fixes too.** The author is the least qualified judge of whether his repair
  reads, and that is exactly when he feels most certain.

## Compose with

- `rewrite-unclear` — writes the fixes for the rows this read returns; step 7 confirms them.
- `grade-paper-writing` — the 1–5 writing grade; this skill finds the unclear sentences, in the
  last edit or, with `--whole`, in the whole paper.
- `tighten-paper` — structural cuts. Note the interaction: a tighten pass that pays for an addition
  by shortening sentences elsewhere is precisely what generates work for this skill.
- `paper-pipeline` — owns the final review; `--whole` is its second step.

## Provenance

Built 2026-08-05, the day before the `the reference paper` deadline, after the corpus owner read the built PDF and
found eleven unreadable passages in twenty minutes — none of which any automated check had flagged,
and several of which had been introduced that same morning by fixes to other automated checks.
