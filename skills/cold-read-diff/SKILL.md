---
name: cold-read-diff
description: "Send the just-changed paragraphs of a LaTeX research paper to two readers with NO context — an engineer who asks what each sentence claims, and a skimming workshop reviewer who asks whose result it states and whether it reads like a paper — the only check that catches a sentence which is short, true, jargon-free and still meaningless to anyone who does not already know the idea. Run ONCE per batch of prose edits — when a section is done, before committing it, before reporting it fixed — not after each edit: it reads everything changed since the last commit. Scoped to the diff, so it is cheap enough to run on every batch. Not a writing grade (grade-paper-writing), not a structural pass (tighten-paper), not a defect review."
allowed-tools: [Bash, Read, Write, Agent]
---

<!-- vigiles:sha256:c15c8ab8622d4b52 compiled from skills/cold-read-diff/SKILL.md.spec.ts -->

# cold-read-diff — the reader who cannot fake understanding



Finds sentences that are true and still mean nothing to a reader who does not already hold the
idea: two readers get only the changed paragraphs, so their confusion is the finding. History:
`docs/incidents.md`, 2026-08-05.

## How to run it

1. Run `node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js <paper.tex> --venue="<venue>"`. It prints
   two prompts, `=== engineer ===` and `=== reviewer ===`; if it refuses or warns, do what it says.
2. Start both readers in ONE message with the Agent tool, `model: "sonnet"`,
   `run_in_background: true`, each prompt exactly as printed, nothing added.
3. Keep working. A reader with no answer after 5 minutes is `none`.
4. Save each answer to a file and run
   `node ${CLAUDE_SKILL_DIR}/scripts/cold-read.js report <paper.tex> --venue="<venue>" --engineer=<file|none> --reviewer=<file|none>`.
   Show the author what it prints. If a `CANNOT PARSE` term is defined elsewhere in the paper,
   say where; the finding stands.
5. Change nothing unless the author asks. Then rerun steps 1–4 once on the rewrite.

## Rules for a fix

- 🔴 **Rewrite the thought, not the flagged words.** *"the agent turns out not to be the weak
  link"* → *"The agent obeys"* has no flag left and says the wrong thing.
- **Meaning over length.** If plain words need more space, pay from an appendix, not by
  shortening another sentence.
- **`CANNOT PARSE` is a result.** Never argue with it; the author understanding the sentence is
  not evidence about anyone else.

## Compose with

- `grade-paper-writing` — the whole-paper readability grade; this is the per-edit check.
- `tighten-paper` — structural cuts; a cut paid for by shortening sentences elsewhere makes work here.
- `paper-pipeline` — this belongs to its text pass.
