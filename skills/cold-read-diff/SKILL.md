---
name: cold-read-diff
description: "Send the just-changed paragraphs of a LaTeX research paper to two readers with NO context — an engineer who asks what each sentence claims, and a skimming workshop reviewer who asks whose result it states and whether it reads like a paper — the only check that catches a sentence which is short, true, jargon-free and still meaningless to anyone who does not already know the idea. Run ONCE per batch of prose edits — when a section is done, before committing it, before reporting it fixed — not after each edit: it reads everything changed since the last commit. Scoped to the diff, so it is cheap enough to run on every batch. Not a writing grade (grade-paper-writing), not a structural pass (tighten-paper), not a defect review."
allowed-tools: [Bash, Read, Write, Agent]
---

<!-- vigiles:sha256:eb37c7c8ebcddebe compiled from skills/cold-read-diff/SKILL.md.spec.ts -->

# cold-read-diff — the reader who cannot fake understanding



It catches a sentence that is short, true and jargon-free, and still means nothing to a reader who
does not already hold the idea. No metric sees that, and every reader who knows the paper waves it
through, so the check is a competent reader **given nothing but the changed paragraphs**: if a
sentence does not carry its own meaning, that reader cannot invent one, and the confusion is the
finding. Scoped to the diff, the two readers cost seconds, so it runs on every batch of edits.
Why it was built: `docs/incidents.md`, 2026-08-05.

## How to run it

No fork: you run it here, and the only model calls are the two readers, in the background.

1. **Print the prompts.** `node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js <paper.tex> --venue="<venue>"`
   prints two prompts, under `=== engineer ===` and `=== reviewer ===`, each holding the
   paragraphs changed since `--base` (default `HEAD`) as plain text. Above 15 paragraphs it
   refuses: narrow `--base`. `{{placeholders}}` need `--macros=<file.json>`.
2. **Start both readers in ONE message**, each with the Agent tool, `model: "sonnet"`,
   `run_in_background: true`, and its prompt exactly as printed: no path, no title, no word
   about the paper. The engineer asks what each sentence claims; the reviewer, told only the
   venue, asks whose result it states and whether it reads like a paper there.
3. **Keep working, at most 5 minutes.** A reader that has not answered by then is `none`.
4. **Write the report.** Save each answer verbatim to a file, then run
   `node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js report <paper.tex> --venue="<venue>" --engineer=<file|none> --reviewer=<file|none>`.
   It writes the report under the paper's `reviews/` and prints at most 15 lines: show the
   author those, not the answers.
5. **Check the term findings against the paper.** For a `CANNOT PARSE` or `ONLY-IF` that names
   a term the paper defines elsewhere, tell the author where (§N). The verdict stands: this
   paragraph does not carry the term, and the author decides if it needs a reminder.
6. **The author decides the fixes.** The read changes nothing and builds nothing. Fix only when
   asked, as a rewrite of the whole thought (see the rules). Record each decided finding in the
   report's frontmatter (`findings:`, checked by `review/frontmatter`; an `open` one names its
   `cause`: skill-defect, missing-skill, hook or rule).
7. **Confirm once, on the fix:** steps 1–4 on the rewritten paragraphs. Done when the engineer
   parses it AND the reviewer finds its owner and register. One round, no loop.

## Rules

- 🔴 **No context in the prompt. Ever.** Not the title, not the abstract, not "this is a paper about
  agent rules files". Every sentence of background handed to the reader is a sentence of confusion
  they will no longer report. The one exception is the venue's name, given to the reviewer persona:
  judging register without knowing the venue is guessing.
- 🔴 **A fix that removes the flagged construction and keeps the compression is not a fix.**
  *"the agent turns out not to be the weak link"* → *"The agent obeys"* has no flag left and says
  the wrong thing. Rewrite the **thought** in plain words; the tic goes with the compression.
- **Length is not the constraint here — meaning is.** If plain language needs more words, take them
  and pay from an appendix, which is outside the page limit. Paying by shortening another sentence
  is what created the problem.
- **`CANNOT PARSE` is a result, not a failure of the reader.** Never argue with it: the author
  understanding the sentence is not evidence about anyone else.
- **Run it on your own fixes too.** Whoever wrote the repair is the worst judge of whether it reads.

## Compose with

- `grade-paper-writing` — the whole-paper readability grade; this is the per-edit check.
- `tighten-paper` — structural cuts; a cut paid for by shortening sentences elsewhere makes work here.
- `paper-pipeline` — this belongs to its text pass.
