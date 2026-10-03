---
name: submission-portal
description: "Read or change a paper's submission on the venue's HotCRP portal via `paperlint submission show|update`: replace the PDF or abstract, mark it submitted, check it is really \"Submitted\", and verify by sha256 that the portal holds the latest build. Use when the PDF or abstract on HotCRP needs replacing, when asked whether the paper is truly submitted or which PDF reviewers see, or before a deadline. Composes with submit-paper (what to submit); this gets it onto the portal and proves it landed."
allowed-tools: [Read, Grep, Glob, Bash]
---

<!-- vigiles:sha256:deb3d74f5c3f93a8 compiled from skills/submission-portal/SKILL.md.spec.ts -->

# submission-portal — read and update the submission on the portal, then prove it landed

`paperlint submission` talks to the venue's submission portal through its API. Only HotCRP is
supported; for any other portal the command says so and the upload is done by hand.

## What must be in place

- **The venue preset declares the portal**: `"portal": { "kind": "hotcrp", "url": "<the site>" }`
  (`paperlint:aidc` has it). For your own venue preset, add it there.
- **The paper's `paperlint.json` names its submission**: `"submission": { "id": <number> }` — the
  number HotCRP shows for the paper.
- **A token in `HOTCRP_TOKEN`**, created by the author on the HotCRP site under Account settings →
  Developer (scopes `submeta:read` and `document:read` to read; `submeta:write` and
  `document:write` to update). Never ask for it in chat, never print it, never write it to a file:
  the command reads it from the environment and sends it only as the `Authorization` header.

A missing key or token stops the command with exit 2 and a line naming the file and key, or the
variable — fix exactly that and run again.

## The procedure — always in this order

1. **Read it.** `npx paperlint submission show papers/<paper>` — status, title, type, topics,
   abstract length, the PDF the portal holds, and `match`: whether that PDF's sha256 equals the
   local `paper.pdf`. Rebuild first (`npx paperlint build papers/<paper>`) if the local PDF is stale.
2. **Dry run.** `npx paperlint submission update papers/<paper>` — sends the PDF (add
   `--abstract <file>` for a plain-text abstract, `--submit` to mark it submitted) with HotCRP's
   `dry_run=1`: the portal checks the change and **keeps nothing**. Read `valid`, `changes` and every
   `portal says:` line. Exit 1 means the portal would refuse it — report why, do not go on.
3. **Ask the author.** Show the dry run's output and ask for an explicit yes to change the real
   submission.
4. **Save — only after that yes.** `npx paperlint submission update papers/<paper> --save` (same
   flags as the dry run). 🔴 `--save` CHANGES A REAL SUBMISSION that reviewers will see. Never run it
   without the author's explicit yes in this conversation, never "to test", and never because a
   dry run was valid.
5. **Prove it landed.** `npx paperlint submission show papers/<paper>` again: `match` must read
   `yes — the portal holds this build`, and the status must be what was intended (`submitted` if
   `--submit` was sent). Anything else is not done — say so.

The same five steps as commands, in order (`<paper>` is the paper's folder):

```bash
npx paperlint submission show papers/<paper>
npx paperlint submission update papers/<paper>
# … the author reads the dry run and says yes …
npx paperlint submission update papers/<paper> --save
npx paperlint submission show papers/<paper>
```

## Reading the answers

- `match yes` is the only proof the reviewers get the local build; a status of `submitted` alone
  says nothing about WHICH PDF.
- `the portal refused (HTTP 401): …` — the token is missing, wrong or expired; `403` — the token
  lacks the scope, or the deadline has passed for this change. The text after the colon is
  HotCRP's own; quote it.
- `SAVE WITHHELD by the portal` — HotCRP did not save; nothing changed.

## What this skill does not do

It does not decide whether the paper is ready (that is `harden-paper`), anonymize it, or fill the
submission form's other fields (authors, conflicts) — see `submit-paper`.
