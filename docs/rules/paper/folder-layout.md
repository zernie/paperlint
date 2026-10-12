# paper/folder-layout

**Level:** error · **Reads:** the paper folder's root (a directory listing), its `paperlint.json` ·
**Reported on:** the first line of the paper's `PIPELINE-STATUS.md`, once per stray entry

## What it catches

A file or folder at the root of a paper folder that is not part of paperlint's layout. The root
holds a small, known set; every kind of material has one folder; anything else goes into `extra/`,
which is never judged.

| allowed at the root                         | why it is there                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PIPELINE-STATUS.md`                        | the paper's one live-state file: stages, plan ("Plan / now"), scorecard. `paperlint lint` requires it, `paperlint new` writes it                                                |
| `paper.tex`                                 | the source; `paperlint build` compiles it, `paperlint new` writes it                                                                                                            |
| `paperlint.json`                            | the paper's settings; `paperlint new` writes it                                                                                                                                 |
| `README.md`                                 | what the paper is                                                                                                                                                               |
| `CLAUDE.md`                                 | the paper's agent rules; Claude Code loads it only from the folder it governs                                                                                                   |
| `CLAIMS.md`                                 | the claims ledger the `paper-status` and `argument-arc` skills read                                                                                                             |
| `NOTES.md`                                  | each number in the paper → the data file it comes from                                                                                                                          |
| `SUBMIT-CHECKLIST.md`                       | the venue's format and submission mechanics; the `paper-status` skill reads it at the root                                                                                      |
| `.gitignore`                                | to ignore the build's byproducts below                                                                                                                                          |
| `paper.pdf`                                 | the built PDF: `paperlint build` writes it here, the `pdf/` facts and `paperlint submission show` read it here                                                                  |
| `*.tex`, `*.bib`, `*.cls`, `*.sty`, `*.bst` | TeX and bibtex look these up in the folder they run in, which is the paper's root: a fragment the body `\input`s, a database, a vendored class, a package, a bibliography style |
| `_build/`                                   | the facts `paperlint build` writes (`paper.facts.json`, `sources.json`, `references.json`)                                                                                      |
| `versions/`                                 | the frozen PDF and source of each stage, read by `paper/stages`                                                                                                                 |
| `reviews/`                                  | dated reviews and pass reports, read by `review/frontmatter`                                                                                                                    |
| `siblings/`                                 | the cards of competing papers, read by `sibling/frontmatter`                                                                                                                    |
| `research/`                                 | dated research and decision records; where the paper skills save theirs                                                                                                         |
| `repro/`                                    | the reproduction artifact: scripts, data, its build, the anonymized upload copy                                                                                                 |
| `figures/`                                  | graphics and figure sources, reached by a relative path from the TeX                                                                                                            |
| `sections/`                                 | the body when it is split: `\input{sections/intro}`                                                                                                                             |
| `talk/`                                     | the talk's files, the `talk/` rules' default folder                                                                                                                             |
| `submission/`                               | everything about sending the paper: forms field by field, portal records, mail with the venue, decision evidence, camera-ready forms                                            |
| `extra/`                                    | the escape hatch: anything, never judged                                                                                                                                        |

Never reported: the byproducts `paperlint build` leaves beside `paper.tex` (`paper.aux`, `.log`,
`.bbl`, `.blg`, `.out`, `.fls`, `.toc`, `.lof`, `.lot`, and an editor's or latexmk's `.synctex.gz`,
`.fdb_latexmk`, `.bcf`, `.run.xml`; only under the job name `paper`), and the operating system's
`.DS_Store` and `Thumbs.db`.

A venue's corpus of accepted papers is not in the paper folder at all: it is shared by every paper
that targets the venue, in `<papers-root>/venues/<venue>/`.

The paper's settings can move three entries, and what they name at the root is allowed while they
name it: `pdf` (the built PDF under another path), `talk.dir` (another talk folder), and a preset
file of the paper's own (`extends`, or the `extends` of any of its `cycles`).

## Why

A paper folder collects files the way a desk does: a plan, mails, three drafts of the PDF, an old
attempt's checklist, a corpus. After a few months nobody can say which file is current, where the
evidence for a decision is, or where a new thing goes, and an agent asked to continue the work reads
the wrong one. A fixed root is what build tools settled on long ago (Cargo, Maven): a known set, one
folder per kind of material, and one place for the rest.

A structure linter over file names cannot do this from inside ESLint: ESLint is handed only the files
paperlint lints, so a stray `.pdf`, `.py` or `.md` is never one of them. The rule lists the folder
itself.

## Examples

Failing: a plan beside the paper.

```text
papers/agent-rule-drift/PIPELINE-STATUS.md
  1:1  error  `PLAN.md` is at the root of a paper folder (the folder holding PIPELINE-STATUS.md),
              and that root holds only paperlint's layout. Where it goes: a section of
              PIPELINE-STATUS.md — the paper's one live-state file holds its stages, its plan
              ("Plan / now") and its scorecard; move what is still live there and delete the file.
              Allowed at the root — files: PIPELINE-STATUS.md, paper.tex, paperlint.json, …
              paper/folder-layout
```

Each message names the entry, where it goes, and the whole allowed set, so it reads on its own. A
name met in real paper folders has one destination:

| entry                      | where it goes                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PLAN.md`, `plans/`        | a section of `PIPELINE-STATUS.md` ("Plan / now")                                                           |
| `DECISION-LOG.md`          | `research/`                                                                                                |
| `EMAILS.md`                | `submission/`                                                                                              |
| `data/`, `artifact/`       | `repro/`                                                                                                   |
| `archive/`                 | `versions/` for frozen PDFs, `submission/` for an earlier attempt's forms and mails, `extra/` for the rest |
| `venue-corpus/`, `venues/` | `<papers-root>/venues/<venue>/`, outside the paper folder                                                  |

Any other name gets the choice by what it is: a record or research → `research/`; about submitting
→ `submission/`; the paper's live state → a section of `PIPELINE-STATUS.md`; reproduction → `repro/`;
a frozen PDF of a stage → `versions/`; unclear → `extra/`.

Passing: the folder `paperlint new` writes (`PIPELINE-STATUS.md`, `paper.tex`, `paperlint.json`),
and any folder holding only the entries above.

## Options / preset fields

No rule options. The paper's `pdf`, `talk.dir` and own preset files add what they name (above).

## What it does not check

- What is inside the allowed folders. `reviews/` and `siblings/` have their own rules; the rest are
  free.
- Whether a `.tex` at the root is included by anything: a fragment the body no longer `\input`s
  passes. Old versions of the source belong in `versions/`.
- A folder without `PIPELINE-STATUS.md`: it is not a paper to paperlint.

## The hook: the same message when the file is written

`paperlint init` also wires the hook `paper-folder-layout` (PostToolUse on `Edit|Write|MultiEdit`,
`plugin/hooks/hooks.json`). When an agent writes a file at a paper folder's root that the layout does
not allow, or inside a root folder it does not allow, the hook adds this rule's message to the
agent's context as `additionalContext`, so the file is moved in the same turn rather than at the next
lint. The text comes from the function the rule reports with (`strayTexts`,
`src/folder-layout-rule.ts`); there is no second list. It cannot tell a new file from one written
again, so a stray file is named on every write until it moves.

Its first step is cheap: it looks for the nearest folder above the written file that holds
`PIPELINE-STATUS.md`, one file check per ancestor, and says nothing when there is none — no git, no
settings, no lint before that. Measured on 2026-10-12: that step takes about 19 µs. The process
around it is what every `paperlint hook` costs, the CLI's import: about 650 ms per write on the
measuring machine, with or without a paper folder (`paper-skills-nudge`, a vigiles hook, measured 730
to 850 ms on the same machine).

A project whose papers all live under one folder can skip the process for every other write by
giving the hook's entry in its own `.claude/settings.json` an `if`, Claude Code's permission-rule
filter, for example `"if": "Write(**/papers/**)"`. paperlint does not write one: where papers live is
a project's choice, and a filter that misses a papers folder would make the hook silently dead there.

## How to fix

Move the entry where its message says, and update whatever names its path:

```sh
git mv papers/agent-rule-drift/EMAILS.md papers/agent-rule-drift/submission/EMAILS.md
```

To keep something as it is, move it under `extra/`. To switch the rule off for one paper, set it in
that paper's `paperlint.json`:

```json
{ "rules": { "paper/folder-layout": "off" } }
```
