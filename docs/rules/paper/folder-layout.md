# paper/folder-layout

**Level:** error · **Reads:** the paper folder's root (a directory listing), its `paperlint.json` ·
**Reported on:** the first line of the paper's `PIPELINE-STATUS.md`, once per stray entry

## What it catches

A file or folder at the root of a paper folder that is not part of paperlint's layout. The root
holds a small, known set; every kind of material has one folder; anything else goes into `extra/`,
which is never judged.

It runs on every `paperlint lint` and in CI, from the moment `paperlint new` creates the folder; a
hook refuses a new stray entry before it is written. Which stage writes each place, and what checks
it: [the map](../../layout.md).

<!-- layout:begin — drawn from src/domain/paper-layout.ts (PAPER_LAYOUT_TREE); src/layout-docs.test.ts fails when this block differs -->

```text
<paper>/
├── PIPELINE-STATUS.md             ← the paper's one live-state file: stages, plan, scorecard
├── paper.tex                      ← the source; `paperlint build` compiles it
├── paperlint.json                 ← the paper's settings
├── README.md                      ← what the paper is
├── CLAUDE.md                      ← the paper's agent rules
├── CLAIMS.md                      ← the claims ledger
├── NOTES.md                       ← each number in the paper → the data it comes from
├── SUBMIT-CHECKLIST.md            ← the venue's format and submission mechanics
├── .gitignore                     ← keeps the build's byproducts out of git
├── paper.pdf                      ← the built PDF
├── *.tex *.bib *.cls *.sty *.bst  ← what TeX and bibtex look up beside paper.tex
├── _build/                        ← the facts `paperlint build` writes
├── versions/                      ← each stage's frozen PDF and source
├── reviews/                       ← dated reviews and pass reports
├── siblings/                      ← the cards of competing papers
├── research/                      ← dated research and decision records
├── repro/                         ← the reproduction artifact
│   ├── README.md                  ← the index: one line per study
│   ├── .gitignore                 ← keeps the scripts' byproducts out of git
│   ├── tools/                     ← scripts used across the paper (numbers, figures, anonymity check, harnesses)
│   ├── data/                      ← shared data (tables, caches)
│   └── <slug>-YYYY-MM-DD/         ← one folder per study or spike (<slug>-YYYY-MM for one that ran over weeks)
│       └── README.md              ← required: what it asks, how to run it, what it found
├── figures/                       ← graphics and their sources
├── sections/                      ← the body, when it is split
├── talk/                          ← the talk's files
├── submission/                    ← forms, portal records, mail with the venue, the anonymized upload
└── extra/                         ← anything; never judged
```

<!-- layout:end -->

`paperlint new` makes the folders a paper uses from its first day: `versions/`, `reviews/`, `research/`,
`repro/` (with its index, `tools/` and `data/`), `figures/` and `submission/`, each empty one with a
`.gitkeep` so the layout is in the first commit. It leaves out `siblings/` (made with the first
competitor's card), `sections/` (when the body is split), `talk/` (when the paper declares a talk),
`extra/` (never judged) and `_build/` (the build's). No rule reports a `.gitkeep` inside these folders.

`extra/` is never judged by any rule, not only this one: `paperlint lint` does not read a folder named
`extra/`, wherever it is. An archived snapshot of an older paper kept there, with its own
`PIPELINE-STATUS.md`, is not taken for a second paper.

Never reported: the byproducts a TeX run leaves beside `paper.tex` (`paper.aux`, `.log`, `.out`,
`.toc`, `.lof`, `.lot`, `.lol`, `.loa`, `.fls`, `.xdv`, `.dvi`, `.synctex.gz`; bibtex's `.bbl`, `.blg`;
makeindex's `.idx`, `.ind`, `.ilg`; glossaries' `.glo`, `.gls`, `.glg`, `.acn`, `.acr`, `.alg`, `.ist`,
`.nlo`, `.nls`; biber's `.bcf`, `.run.xml`; beamer's `.nav`, `.snm`, `.vrb`; latexmk's `.fdb_latexmk`;
the list follows latexmk's clean lists; only under the job name `paper`), the `.aux` that
`\include{chapter}` writes beside a root `chapter.tex`, and the operating system's `.DS_Store` and
`Thumbs.db`.

A venue's corpus of accepted papers is not in the paper folder at all: it is shared by every paper
that targets the venue, in `<papers-root>/venues/<venue>/` ([what it holds](../../venues.md)).

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
The layout (extra/ takes anything and is never judged; the build's paper.* byproducts are never reported):
<paper>/
├── PIPELINE-STATUS.md             ← the paper's one live-state file: stages, plan, scorecard
…
└── extra/                         ← anything; never judged
Rule paper/folder-layout: https://github.com/zernie/paperlint/blob/main/docs/rules/paper/folder-layout.md  paper/folder-layout
```

Each message names the entry and where it goes, and draws the whole layout above, so it reads on its own. A
name met in real paper folders has one destination:

| entry                      | where it goes                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PLAN.md`, `plans/`        | a section of `PIPELINE-STATUS.md` ("Plan / now")                                                           |
| `DECISION-LOG.md`          | `research/`                                                                                                |
| `EMAILS.md`                | `submission/`                                                                                              |
| `data/`                    | `repro/data/`                                                                                              |
| `artifact/`                | `repro/` (scripts in `repro/tools/`, data in `repro/data/`); the anonymized upload copy in `submission/`   |
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

- What is inside the allowed folders. `reviews/`, `siblings/` and `repro/` have their own rules
  ([`paper/repro-layout`](repro-layout.md) for `repro/`); the rest are free.
- Whether a `.tex` at the root is included by anything: a fragment the body no longer `\input`s
  passes. Old versions of the source belong in `versions/`.
- A folder without `PIPELINE-STATUS.md`: it is not a paper to paperlint.

## The hook: a new stray entry is refused before it is written

`paperlint init` also wires the hook `paper-folder-layout` (PreToolUse on `Edit|Write|MultiEdit`,
`plugin/hooks/hooks.json`). When an agent is about to create a file that would add an entry the
layout does not allow — at a paper folder's root, or at the top of its `repro/`
([`paper/repro-layout`](repro-layout.md)) — the hook denies the call, and the reason it gives is the
rule's own message: where the entry goes, and the layout drawn. The agent writes the file where it
belongs instead, in the same turn. The text comes from the functions the rules report with
(`strayTexts`, `reproTexts`); there is no second list.

What it never refuses:

- **a file that already exists** — editing is never blocked, wherever the file is, so a paper whose
  folder predates the layout keeps working and the rule reports what is out of place;
- a new file inside an entry that already exists, even a stray one: the entry is not new, and the
  rule names it once;
- anything outside a paper folder.

A new study folder in `repro/` is started with its `README.md`; any other first file in it is
refused with `paper/repro-layout`'s "without a README.md" message.

🔴 **What it cannot see: the shell.** `mv`, `cp`, `git mv`, or a script that writes files are not an
Edit or a Write, so the hook never sees them. The guarantee is the lint: both rules fail `paperlint
lint`, and CI, whatever wrote the entry. The hook only saves the round trip. It does not read the
paper's `rules` either: a paper that switched a layout rule off is still refused a new stray entry
(an existing one is never refused).

Its first step is cheap: it looks for the nearest folder above the target file that holds
`PIPELINE-STATUS.md`, one file check per ancestor, and allows the call when there is none — no git,
no settings, no lint before that. Measured on 2026-10-12: that step takes about 19 µs. The process
around it is what every `paperlint hook` costs, the CLI's import: about 650 ms per write on the
measuring machine, with or without a paper folder (`paper-skills-nudge`, a vigiles hook, measured 730
to 850 ms on the same machine). The hook fails open: a payload it cannot read is reported on stderr
and the call goes ahead.

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
