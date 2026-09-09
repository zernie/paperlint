# research-paper-pipeline

Machine-checkable gates for writing a research paper **in git**: ESLint rules that read the
LaTeX source, harnesses that prove each rule both fires and stays quiet, and (later) the
skills and CI that drive the pipeline end to end.

**Status: empty on purpose.** Nothing has been extracted yet. The plan, the measurements it
rests on and the rejected alternatives live in the private knowledge base at
`idei/paper-pipeline-extraction/` — start with `05-plan-perenosa-2026-09-10.md`.

## What this is meant to be

| | |
|---|---|
| **in scope** | ESLint rules over `.tex` sources · their harnesses and mutation runs · paper-stage skills · the hooks and CI that enforce them |
| **out of scope** | anything that knows about one specific author, venue, or visa case — that stays in the private base |
| **not here either** | agent-harness machinery (skill corpus, trigger ledger, model containment). Its home is [vigiles](https://github.com/zernie/vigiles) |

## Why it is not "yet another academic skills suite"

Measured 2026-09-10 by cloning the two nearest neighbours, not by reading their descriptions:

- [`Imbad0202/academic-research-skills`](https://github.com/Imbad0202/academic-research-skills)
  — 47k stars, 2 590 files, 430 python files, its own linters and a PreToolUse guard. It is
  **CC BY-NC 4.0**: not an open-source licence, commercial use restricted by design.
- [`tlorans/research-paper-pipeline`](https://github.com/tlorans/research-paper-pipeline)
  — a control plane over the above. Its stage gate compares a threshold against a `score`
  that the audited model itself wrote.

Neither ships a single rule that reads a LaTeX source. Searching both trees for `eslint` and
`aclpubcheck` returns **zero**. That gap — mechanical checks on the paper's own source — is
what this repo is for.

## Setup

```bash
npm install          # first command in any fresh clone, before touching a spec or a hook
npx vigiles test .   # run every harness on disk
```

## Layout (as it fills up)

```
eslint-rules/     one rule per file, its test beside it
fixtures/         .tex fixtures — a clean one and a defective one per rule
skills/           paper-stage skills (stage 3, gated — see the plan)
.github/          CI (stage 4 — decide the minute budget BEFORE the first workflow)
```
