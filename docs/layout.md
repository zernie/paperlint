# Where things live, and what checks them when

A paper moves through eight stages ([the flow](#the-flow)). Each stage writes into one
place, and a check guards that place. This page is the map: the places, who writes each one, and the
moment each check runs. The skills, stage by stage: [`skills.md`](skills.md).

## The flow

Each box names the stage's skills, what it writes, and what checks it. Stage 3 is drawn from the
inside: a study's pre-registration and its human labels are made there.

```mermaid
flowchart TB
  N["<b>paperlint new</b><br/>creates the paper folder<br/>checked from here on:<br/>every lint · paper/allowed-files-only<br/>every new file · hook paper-folder-layout"]
  S1["<b>1 · idea</b><br/>research-ideate · map-prior-work<br/>analyze-sibling-paper<br/>writes: siblings/<br/>checked by: sibling/frontmatter"]
  S2["<b>2 · venue</b><br/>find-venue · plan-paper-timeline<br/>study-accepted-papers, mode A or B<br/>writes: paperlint.json, a report in reviews/<br/>checked by: review/frontmatter"]
  V[("<b>#lt;papers-root#gt;/venues/#lt;venue#gt;/</b><br/>beside the papers, not in one:<br/>the venue's accepted papers,<br/>shared by every paper aimed at it<br/>checked by: nothing")]
  subgraph S3["3 · study: repro/#lt;id#gt;-#lt;slug#gt;/"]
    direction TB
    D["<b>design</b> · build-benchmark<br/>paperlint studies new<br/>writes: the study's folder, README.md,<br/>its row in repro/studies.json<br/>checked by: repro/allowed-files-only,<br/>repro/study-registered"]
    P["<b>plan</b> · build-benchmark<br/>fills: plan.json, before the draw<br/>checked by: repro/study-registered,<br/>once the study runs"]
    A["<b>author check</b> · you see the drawn units<br/>writes: author_check in plan.json<br/>checked by: repro/study-registered,<br/>for a headline measurement"]
    R["<b>run</b> · your scripts<br/>writes: the study folder,<br/>repro/tools/, repro/data/<br/>checked by: repro/allowed-files-only"]
    L["<b>labels</b> · build-label-page<br/>a phone page; the answers go<br/>into the study's data/"]
    Y["<b>analysis</b> · build-benchmark<br/>writes: the numbers, NOTES.md,<br/>the study's row: status, result<br/>then paperlint studies index<br/>checked by: repro/study-registered"]
    D --> P --> A --> R --> L --> Y
  end
  S4["<b>4 · draft</b><br/>draft-paper · argument-arc · tighten-paper<br/>writes: paper.tex, sections/, figures/<br/>checked by: the tex/* rules<br/>hook paper-edit-guard: no shell writes"]
  S5["<b>5 · review</b><br/>grade-paper-writing · verify-citations<br/>pc-panel-review · harden-paper<br/>study-accepted-papers, mode C or D<br/>writes: reviews/, the scorecard<br/>in PIPELINE-STATUS.md<br/>checked by: review/frontmatter"]
  S6["<b>6 · submit</b><br/>paperlint build · submit-paper<br/>writes: paper.pdf, _build/,<br/>versions/, submission/<br/>checked by: format/page-limit, pdf/*,<br/>anonymity/identity, versions/layout"]
  S7["<b>7 · camera-ready</b><br/>camera-ready<br/>writes: versions/, talk/<br/>checked by: versions/layout, talk/*"]
  S8["<b>8 · extend</b><br/>extend-paper<br/>writes: a new paper folder"]
  N --> S1 --> S2 --> D
  Y --> S4 --> S5 --> S6 --> S7 --> S8
  S2 -. fills .-> V
  V -. read again .-> S5
```

The cylinder is a venue's corpus of accepted papers: it lives beside the papers, not inside one
([`venues.md`](venues.md)).

## The map

The papers directory is `papersDir` in the project's `paperlint.json` (default `papers/`). A folder
in it is a paper when it holds `PIPELINE-STATUS.md`, `paper.tex` or `paperlint.json`; `paperlint new`
creates one.

<!-- layout:begin — drawn from src/domain/paper-layout.ts (PAPERS_LAYOUT_TREE); src/layout-docs.test.ts fails when this block differs -->

```text
<papers-root>/
├── venues/                            ← outside every paper folder: one folder per venue
│   └── <venue>/                       ← that venue's accepted papers, shared by every paper aimed at it
└── <paper>/                           ← one folder per paper, named after the work; its root holds only what is below
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
    ├── versions/                      ← each stage's frozen PDF and source — per attempt, versions/<cycle>/, with lock.json
    ├── reviews/                       ← dated reviews and pass reports
    ├── siblings/                      ← the cards of competing papers
    ├── research/                      ← dated research and decision records
    ├── repro/                         ← the reproduction artifact
    │   ├── README.md                  ← the index: one line per study, generated from studies.json
    │   ├── studies.json               ← the study registry: id, title, status and result of each study
    │   ├── .gitignore                 ← keeps the scripts' byproducts out of git
    │   ├── CLAUDE.md                  ← optional: instructions an agent loads when it works in repro/
    │   ├── AGENTS.md                  ← optional: the same, for agents that read AGENTS.md
    │   ├── tools/                     ← scripts used across the paper (numbers, figures, anonymity check, harnesses)
    │   ├── data/                      ← shared data (tables, caches)
    │   └── <id>-<slug>/               ← one folder per study or spike, named by its row in studies.json (P1-S03-baseline)
    │       └── README.md              ← required: what it asks, how to run it, what it found
    ├── figures/                       ← graphics and their sources
    ├── sections/                      ← the body, when it is split
    ├── talk/                          ← the talk's files
    ├── submission/                    ← forms, portal records, mail with the venue, the anonymized upload
    └── extra/                         ← anything; never judged
```

<!-- layout:end -->

Two places with similar names are not in this drawing:

- `venues/` at the **project root** holds your own venue presets and their cards
  (`venues/<name>.jsonc`, `venues/<name>.md`), for a venue paperlint does not ship.
- `<papers-root>/venues/<venue>/` (drawn above) holds a venue's **accepted papers**.

Both are explained in [`venues.md`](venues.md).

## Each place: who writes it, and what checks it

"Stage" is the stage of [the pipeline](#the-flow) that writes the place first.
"Checked by" is the rule `paperlint lint` runs over it; "nothing" means no rule reads its content.

| place                                | stage            | written by                                                                                                                                                                                       | checked by                                                                                                                                                               |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<papers-root>/venues/<venue>/`      | 2 venue          | `study-accepted-papers`, its first run for that venue (mode A, usually)                                                                                                                          | nothing ([why](venues.md#what-checks-it))                                                                                                                                |
| the paper folder's root              | before 1         | `paperlint new`: the three files, and an empty `.gitkeep` folder for `reviews/`, `research/`, `figures/`, `versions/`, `submission/`, `repro/tools/`, `repro/data/` (`repro/` gets a stub index) | [`paper/allowed-files-only`](rules/paper/allowed-files-only.md); the hook `paper-folder-layout` refuses a new stray entry                                                |
| `PIPELINE-STATUS.md`                 | every stage      | `paperlint new`, then `paper-pipeline`, `paper-status`; `study-accepted-papers` (the scorecard)                                                                                                  | `paper/stages`, `paper/source`, [`cycle/submitted-frozen`](rules/cycle/submitted-frozen.md) ([rules](rules.md))                                                          |
| `paperlint.json`                     | before 1, then 2 | `paperlint new`; `find-venue` names the venue                                                                                                                                                    | `paperlint lint` refuses an unknown key; [`cycle/record`](rules/cycle/record.md)                                                                                         |
| `siblings/`                          | 1 idea           | `map-prior-work`, `analyze-sibling-paper`                                                                                                                                                        | `sibling/frontmatter` ([records](configuration.md#records-in-frontmatter-checked-by-shipped-json-schemas))                                                               |
| `reviews/`                           | 2, then 4–5      | `study-accepted-papers` (its report), `grade-paper-writing`, `cold-read-diff`, the review skills                                                                                                 | `review/frontmatter` ([records](configuration.md#records-in-frontmatter-checked-by-shipped-json-schemas))                                                                |
| `research/`                          | any              | you and the skills: dated research and decision records                                                                                                                                          | nothing                                                                                                                                                                  |
| `repro/`, its top                    | 3 study          | `build-benchmark`, your scripts                                                                                                                                                                  | [`repro/allowed-files-only`](rules/repro/allowed-files-only.md); the hook `paper-folder-layout` refuses a new loose entry                                                |
| `repro/studies.json`                 | 3 study          | `paperlint studies new` appends a row; you edit a row when its study ends; `paperlint studies index` regenerates the index in `repro/README.md`                                                  | [`repro/study-registered`](rules/repro/study-registered.md): a row per study folder, its fields, the index in sync                                                       |
| `repro/<id>-<slug>/`                 | 3 study          | `paperlint studies new` (the folder and its `README.md`), then `build-benchmark` (the design, in its `README.md`)                                                                                | [`repro/allowed-files-only`](rules/repro/allowed-files-only.md): the name, and a `README.md` in it; [`repro/study-registered`](rules/repro/study-registered.md): its row |
| `repro/<id>-<slug>/plan.json`        | 3 study          | `paperlint studies new` writes the template; `build-benchmark` fills it before the sample is drawn; you add the author's check                                                                   | [`repro/study-registered`](rules/repro/study-registered.md): its fields, filled once the study runs, and `author_check` in a headline measurement                        |
| `repro/<id>-<slug>/prereg.json`      | 3 study          | the plan's old name, still read when the row names it                                                                                                                                            | [`repro/study-plan-name`](rules/repro/study-plan-name.md) (warning); [`study/declare-sample`](rules/study/declare-sample.md), off by default                             |
| `repro/<id>-<slug>/decision.md`      | 3 study          | you: the decisions on the inputs of a study decided before its run, committed before the run (`paperlint studies gate`); the plan names it, and it may live elsewhere in the paper               | [`repro/outputs-before-decision`](rules/repro/outputs-before-decision.md)                                                                                                |
| `repro/<id>-<slug>/data/`            | 3 study          | `build-label-page` exports the labels here                                                                                                                                                       | nothing                                                                                                                                                                  |
| `repro/tools/`, `repro/data/`        | 3 study          | your scripts; `paperlint build` keeps `repro/data/references-cache.json`                                                                                                                         | nothing inside them                                                                                                                                                      |
| `NOTES.md`                           | 3, then 4        | you: each number → the data it comes from; `build-label-page` adds a line per label file                                                                                                         | nothing                                                                                                                                                                  |
| `paper.tex`, `sections/`, `*.bib`    | 4 draft          | `draft-paper`, `argument-arc`, `tighten-paper`                                                                                                                                                   | the `tex/*`, `paper/*` and `bib/*` rules ([rules](rules.md)); the hook `lint-edited` reports an agent's edit's new errors; `paper-edit-guard` refuses a shell write      |
| `CLAIMS.md`, `figures/`              | 4 draft          | you                                                                                                                                                                                              | nothing                                                                                                                                                                  |
| `paper.pdf`, `_build/`               | 6 submit         | `paperlint build`                                                                                                                                                                                | `pdf/*`, [`format/page-limit`](rules/format/page-limit.md), [`anonymity/identity`](rules/anonymity/identity.md), the reference rules                                     |
| `versions/`                          | 6, then 7        | you, at submission and at camera-ready (`submit-paper` says how): the frozen PDF and source of each stage                                                                                        | [`versions/layout`](rules/versions/layout.md) with `cycles`; `paper/stages`, `paper/source` without                                                                      |
| `submission/`, `SUBMIT-CHECKLIST.md` | 6 submit         | you, while `submit-paper` and `submission-portal` do the submitting: forms, portal records, mail with the venue                                                                                  | [`cycle/evidence`](rules/cycle/evidence.md), for the files a closed cycle names                                                                                          |
| `talk/`                              | 7 camera-ready   | you                                                                                                                                                                                              | the `talk/*` rules ([talk](talk.md))                                                                                                                                     |
| `extra/`                             | any              | you                                                                                                                                                                                              | nothing, ever                                                                                                                                                            |

## What runs when

A check runs at one of five moments:

- **Before a write** — a Claude Code hook. It sees an agent's Edit or Write, not a shell `mv` or a
  script, so it saves a round trip and guarantees nothing.
- **After a write** — the `lint-edited` hook: `paperlint lint` on the file an agent just edited and
  its paper's `paper.tex`, reporting only the errors that edit introduced ([below](#the-lint-edited-hook)).
  It too sees only an Edit or Write, so it guarantees nothing either.
- **On lint** — `paperlint lint`, when you run it. Every rule runs, whatever wrote the files. This is
  the guarantee.
- **In CI** — the same lint, on every push, if the project has the workflow `paperlint init` offers.
  The lint-only job skips what needs a build (pages, fonts, references).
- **On demand** — a skill, when you ask for what it does. A skill stops nothing; it writes.

| what                                                                                        | kind    | when it runs                                                | what it stops                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paper-folder-layout`                                                                       | hook    | before an agent creates a file (Edit, Write)                | a new entry the layout does not allow, at a paper's root or the top of its `repro/`; never an existing file                                                                            |
| `lint-edited`                                                                               | hook    | after an agent edits a file of a paper (Edit, Write)        | nothing is undone: an error the edit introduced is put next to the edit's result, so the agent fixes it in the same turn                                                               |
| `paper-edit-guard`                                                                          | hook    | before an agent's shell command                             | a shell command that writes or moves a paper's source, which would skip the hooks that run after an edit                                                                               |
| `submission-confirm`                                                                        | hook    | before an agent's shell command                             | a submission send (`--save`, `--submit`), or a command naming a portal's host, that the person has not said yes to in a question naming its PDF's sha256 (or the host and the command) |
| `paper-skills-nudge`                                                                        | hook    | after an agent edits a paper's source                       | nothing: it shows the agent the pre-submit checklist                                                                                                                                   |
| `paper-status-gates`                                                                        | hook    | after an agent edits a paper's source                       | nothing: it prints the paper's readiness and its unrun gates, for a person reading the transcript                                                                                      |
| [`paper/allowed-files-only`](rules/paper/allowed-files-only.md)                             | rule    | every `paperlint lint`, and CI                              | a stray file or folder at a paper's root (error)                                                                                                                                       |
| [`repro/allowed-files-only`](rules/repro/allowed-files-only.md)                             | rule    | every `paperlint lint`, and CI                              | a loose entry at the top of `repro/`, a folder that is not a study's, a study folder without `README.md` (error)                                                                       |
| [`repro/study-registered`](rules/repro/study-registered.md)                                 | rule    | every `paperlint lint`, and CI                              | a study folder without its row in `repro/studies.json`, a row that does not match, a measurement or plan that does not hold, an index out of sync (error)                              |
| [`repro/study-plan-name`](rules/repro/study-plan-name.md)                                   | rule    | every `paperlint lint`, and CI                              | nothing: it warns when a study's plan is still named `prereg.json`                                                                                                                     |
| [`repro/outputs-before-decision`](rules/repro/outputs-before-decision.md)                   | rule    | every `paperlint lint`, and CI (with the whole history)     | an output of a study decided before its run that git shows was not made after the decision                                                                                             |
| `paperlint studies gate`                                                                    | command | before a decide-first study's run                           | the run, until the decision is committed                                                                                                                                               |
| [`study/declare-sample`](rules/study/declare-sample.md)                                     | rule    | every `paperlint lint`, and CI, once a paper turns it on    | a study's `prereg.json` without its population, strata, screens, coverage or the author's check (experimental, off by default)                                                         |
| [`paper/folder-venue-leftover`](rules/paper/folder-venue-leftover.md)                       | rule    | every `paperlint lint`, and CI                              | nothing: it warns when the folder is named after another venue                                                                                                                         |
| `review/frontmatter`, `sibling/frontmatter`                                                 | rule    | every `paperlint lint`, and CI                              | a review whose findings break the schema (error); a sibling card that does not say how much was read (warning)                                                                         |
| `paper/stages`, `paper/source`                                                              | rule    | every `paperlint lint`, and CI                              | a stage whose frozen PDF or source is missing or changed (error)                                                                                                                       |
| the rules on the source (`tex/*`, `paper/*`, `bib/*`)                                       | rule    | every `paperlint lint`, and CI                              | what each one's [row](rules.md) says                                                                                                                                                   |
| the rules on what `paperlint build` measured (`pdf/*`, `format/page-limit`, the references) | rule    | every `paperlint lint` after a build; CI's full job         | a PDF over the page limit, in the wrong font or format, or with a bad reference                                                                                                        |
| `study-accepted-papers`                                                                     | skill   | when you ask; stage 2 (modes A, B) and stage 5 (modes C, D) | nothing: it fills the venue's corpus, and writes the strong-accept scorecard in `PIPELINE-STATUS.md`                                                                                   |
| `build-benchmark`                                                                           | skill   | when you ask; stage 3                                       | nothing: it registers the study with `paperlint studies new`, writes its design, fills its `plan.json`, and updates its row when it ends                                               |
| `build-label-page`                                                                          | skill   | when you ask; stage 3                                       | nothing: it builds the labelling page, and exports the answers into the study's `data/`                                                                                                |

The hooks are wired by `paperlint init` ([`install.md`](install.md)). A rule's level and options:
[`rules.md`](rules.md).

### The `lint-edited` hook

**When it fires.** After every Edit, Write and MultiEdit of an agent in Claude Code (PostToolUse,
timeout 20 s), on a file inside a paper folder (a folder with `PIPELINE-STATUS.md`, not under
`extra/`) that `paperlint lint` lints — ESLint's own answer on the config `paperlint lint` builds,
so a file the lint skips (`research/notes.txt`) gets nothing. An edit of any other file is answered
before the CLI loads: 36–39 ms per edit against 28 ms for `node -e 0` (medians of 15, measured
2026-11-09), where it was 662 ms while the CLI loaded on every edit.

**What it lints.** The edited file and the paper's `paper.tex`, with the same ESLint, config and
rules as `paperlint lint` on that paper: one setup serves both. Inside a paper it takes about as long
as `paperlint lint` on that paper: 701 ms for an edit of a one-page paper, against 781 ms for
`paperlint lint` on it.

**What turns red.** An error (never a warning) the edit introduced. The hook answers
`{"decision":"block","reason":…}`: Claude Code puts the findings, as `paperlint lint` prints them,
next to the edit's result, with a line saying the edit was kept. The edit is not undone. With
`tex/max-sentence-words` on, a 64-word sentence an agent writes reads:

```
/home/you/project/papers/p1/paper.tex
  7:1  error  a sentence of 64 words, over 55 — «word word word word word word word word…». A reader loses its subject before its verb; cut it where a clause could stand alone  tex/max-sentence-words

✖ 1 problem (1 error, 0 warnings)
paperlint lint-edited: the edit was kept; the errors above are the ones it introduced.
```

**How it knows what is new: `_build/edit-lint.json`.** After each run the hook writes the paper's
errors per file to `<paper>/_build/edit-lint.json` (gitignored; `_build/` is allowed by the layout).
Each error is keyed by its file, rule, message and the trimmed text of the line it points at — not
the line number, so a line inserted above an old error does not make it new. The next edit reports
an error only when its key occurs more often than in the snapshot. A file the snapshot has not seen
yet (the first edit in a paper) has no "before": only the errors on the lines that edit wrote are
reported — an Edit's new text, each MultiEdit's, every line of a Write. Delete the file to start over.

**What it cannot see.**

- A file written by a shell command (`sed -i`, a script, `mv`, `cp`): no Edit, no Write, no hook.
  `paperlint lint` and CI still see it.
- The body files of a paper whose build record is stale. `_build/sources.json` hashes every file TeX
  read, so the first edit to any of them makes the record stale, and until the next
  `paperlint build` the paper is `paper.tex` alone — to this hook exactly as to `paperlint lint`
  ([`paper/sources-fresh`](rules/paper/sources-fresh.md)). A paper never built has no body files.
- An error the edit caused in a file other than the edited one and `paper.tex`.
- Anything when the hook itself fails (a payload it cannot read, a `paperlint.json` that does not
  parse, ESLint throwing): it prints one line, `paperlint: the lint-edited hook did not run: <why>`,
  and lets the edit stand.
