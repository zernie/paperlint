# research-paper-pipeline

Machine-checkable gates for writing a research paper **in git**: ESLint rules that read the
paper's own source, skills that drive each stage, hooks that stop a bad edit before it lands,
and a harness beside every one of them proving it both fires on a planted defect and stays
quiet on clean input.

## Why it exists

A paper is a repository long before it is a PDF, and almost nothing checks it as one. Writing
conventions — every claim carries a number, a "read it" checkbox says what was actually read,
a finished stage has the file it claims — live in guidelines and are enforced by nobody, so
they rot silently. That is the same failure class as an un-linted codebase, with a submission
deadline attached.

The wager is narrow and testable: **anything a reviewer could check mechanically should fail
the build, not the review.** Everything that needs taste stays prose and says so out loud.

## Status — measured 2026-09-16

| | |
|---|---:|
| ESLint rules over paper sources | **6** |
| harnesses — one per surface, both halves | **45** |
| mutation batteries — a green harness proves nothing alone | **22** |
| paper-stage skills | **24** |
| hooks, shipped as runnable `.mjs` | **5** |
| files tracked | 308 |

```bash
npm test             # every harness on disk
npm run mutations    # every battery; a harness nothing can kill is not a test
```

## What may live here, and what may not

| | |
|---|---|
| **in scope** | ESLint rules over `.tex`/`.md` paper sources · their harnesses and mutation batteries · paper-stage skills · hooks and CI that enforce them |
| **out of scope** | anything that knows about one specific author, venue, employer or application — that stays in its owner's private notes |
| **not here either** | agent-harness machinery (skill corpus, trigger ledger, model containment). Its home is [vigiles](https://github.com/zernie/vigiles) |

The test is mechanical rather than tasteful: **would this file work, unedited, for someone
else's paper?** If it names a person, a venue or a deadline — no, and it belongs in private
notes. If it would need one line changed — yes, and that line becomes an option.

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
```

## Layout

```
eslint-rules/     one rule per file, its harness and mutation battery beside it
fixtures/         .tex and .md fixtures — a clean one and a defective one per rule
skills/           paper-stage skills; a consumer symlinks these into .claude/skills/
hooks/            runnable .mjs programs, not .hook.ts sources — see CLAUDE.md
scripts/          repo-wide runners (mutations, glob coverage, skill lint)
.github/          CI — one job, and the minute budget is decided before adding a second
```

## Licence

⚠️ **Not settled yet.** `package.json` says `UNLICENSED` and there is no `LICENSE` file, which
means the default applies: all rights reserved, and nobody may use this. That is a placeholder,
not a decision — and an awkward one, because the section above criticises a neighbour for a
restrictive licence. Until a licence is chosen, treat the code as readable but not reusable.
