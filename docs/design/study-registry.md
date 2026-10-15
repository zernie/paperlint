# The study registry — design

A paper's `repro/` holds one folder per study. Named `<slug>-YYYY-MM-DD`, they sort by date and say
nothing else: a real paper reached 79 study folders, and nobody could tell which one a number in the
paper came from, which ones had ended, or which were current. This note fixes the shape of the
registry that gives every study a stable number and a plain name, the lint rule that holds it, and the
two commands that write it.

## What is decided

1. **One registry, `repro/studies.json`, JSON with a schema.** Never markdown: a table in a README is
   what people edit by hand and what a parser has to guess at. The schema (zod, in
   `src/adapters/study-registry/`) is checked where the file is read; nothing after that re-validates.

   ```json
   {
     "prefix": "P1",
     "studies": [
       {
         "id": "P1-S01",
         "folder": "P1-S01-baseline-pass-rate",
         "title": "Baseline pass rate",
         "question": "How often does the unmodified agent pass the task?",
         "kind": "measurement",
         "status": "done",
         "date": "2026-10-15",
         "result": "41 of 60 runs pass",
         "result_file": "results.tsv",
         "in_paper": "yes"
       }
     ]
   }
   ```

   | field           | values                                                                    |
   | --------------- | ------------------------------------------------------------------------- |
   | `prefix`        | the paper's prefix: a capital letter, then capitals or digits (`P1`)      |
   | `id`            | `<prefix>-S<two or more digits>`, unique                                  |
   | `folder`        | `<id>-<slug>`: the study's folder at the top of `repro/`                  |
   | `title`         | a plain name, at most 8 words                                             |
   | `question`      | one sentence: what the study asks                                         |
   | `kind`          | `measurement`, `spike`, `tooling`, `data`, `artifact`, `salvage`          |
   | `status`        | `designing`, `running`, `done`, `stopped`, `superseded`, `dropped`        |
   | `date`          | `YYYY-MM-DD`, the day it was registered                                   |
   | `result`        | optional; one line. Required when `done`                                  |
   | `result_file`   | optional; a path inside the folder. Required, and must exist, when `done` |
   | `superseded_by` | optional; an id in the registry. Required when `superseded`               |
   | `in_paper`      | `yes`, `no`, `registry` (listed only in the registry, not in the text)    |

   | `measurement` | optional; the id of the measurement the study belongs to (6) |
   | `plan` | optional; the study's plan, a path inside its folder: `plan.json` (7) |

   **A row may carry more fields**, and they are kept: a paper merges its own metadata into the rows
   (`frame`, `method`, `outcome`, …). The top level is closed — `prefix`, `studies`, and the optional
   `author`, `requirements` and `measurements` (6) — so a misspelt key is an error, not an ignored
   key.

2. **The rule `repro/study-registered`, an error,** reported on the first line of
   `PIPELINE-STATUS.md` like `repro/allowed-files-only`, once per finding:

   - every folder at the top of `repro/` that is not `tools/`, `data/` or a byproduct the layout
     ignores (`__pycache__/`, `node_modules/`, …) has exactly one row, and every row's folder exists;
   - the folder is `<id>-<slug>`, the id is `<prefix>-S<digits>`, ids are unique;
   - `done` has a `result` and an existing `result_file`; `superseded` names an existing id in
     `superseded_by`; a title has at most 8 words;
   - **the index is in sync:** the block of `repro/README.md` between the two markers below equals the
     text generated from `studies.json`. The comparison is of strings. The markdown is output only and
     is never parsed.

     ```
     <!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->
     <!-- studies:end -->
     ```

   - a paper with study folders and no `repro/studies.json` gets one finding naming the file.
   - a `studies.json` that is not JSON, or not of the schema, gets one finding with the reasons.

3. **Two commands**, in `src/studies.ts`, wired in `src/cli.ts`:

   - `paperlint studies new <paper-dir> "<title>" [--kind measurement]` takes the next id, creates
     `repro/<id>-<slug>/README.md` (frontmatter `id:` and `title:`) and the plan's template,
     `plan.json` (7), appends the row with `status: designing`, `in_paper: no`, today's date and
     `plan: "plan.json"`, and regenerates the index block. It refuses a
     title over 8 words, a title with no letter or digit to make a slug from, an unknown kind, a folder
     that already exists, and a paper with no `studies.json` (the prefix is the author's choice, so the
     refusal names the file to write and does not guess one).
   - `paperlint studies index <paper-dir>` regenerates the index block: a table with the columns id ·
     title · status · result · in paper · folder. With no markers in `repro/README.md` the block is
     appended; with no `repro/README.md` the file is written.

4. **The layout accepts `<id>-<slug>` beside `<slug>-YYYY-MM-DD`.** `repro/allowed-files-only` keeps
   accepting the dated form, so a paper that turns the registry off is not broken by this change; it
   also allows `studies.json` at the top of `repro/`. A folder in the dated form is still reported by
   `repro/study-registered` as unregistered — that is the point of the registry — and the paper decides
   whether to register it or turn the rule off.

5. **Skills.** `build-benchmark`, `run-agent-grid` and `build-label-page` create a study only with
   `paperlint studies new`, and update its row (status, result, result file, in paper) when it ends,
   then run `paperlint studies index`.

6. **Measurements above studies, and the author's requirements.** One measurement (a census, a
   benchmark) spans several study folders: a pilot, the main run, a replication. Before this, a paper
   put the measurement's fields on the row of its first study under prefixed names
   (`measurement_title`, `measurement_status`) and the other rows carried `measurement: <id>`, which
   nothing checked; the author's verbatim requirements went to a separate file nothing read. Now:

   ```json
   {
     "prefix": "P1",
     "author": "A. Author",
     "requirements": [
       {
         "id": "R1",
         "text": "Every sample is a random draw from all rules found.",
         "date": "2026-10-10",
         "source": "chat"
       }
     ],
     "measurements": [
       {
         "id": "M1",
         "title": "Rule census",
         "rq": "RQ1",
         "role": "headline",
         "approval": {
           "by": "A. Author",
           "date": "2026-10-12",
           "quote": "This is the one."
         },
         "requirements": ["R1"]
       }
     ],
     "studies": [
       { "id": "P1-S01", "measurement": "M1", "plan": "plan.json", "…": "…" }
     ]
   }
   ```

   `role` is `headline` (the paper's claim rests on it) or `baseline`. A measurement keeps extra
   fields like a row; a requirement and an approval are exactly their fields. The rule reports, each
   finding its own message id: a row naming an undeclared measurement (`unknown-measurement`), a
   measurement no row names (`empty-measurement`), a measurement naming an undeclared requirement
   (`unknown-requirement`), and a headline without `approval`, or approved by anyone but `author`
   when the registry names one (`headline-approval`). **These checks run only when the registry has
   `measurements`**: a registry written before them, whose rows already carry `measurement` as a field
   of their own, stays valid.

7. **The study's plan, `plan.json`.** Each study folder held a hand-written `prereg.json`, its
   fields differing study to study, read only by the experimental `study/declare-sample`. The name
   misled — it is not an outside pre-registration — so the plan is `plan.json`, written as a
   template by `paperlint studies new` beside the README, and named in the row's `plan`:

   ```json
   {
     "question": "",
     "population": {
       "source": "",
       "size": null,
       "draw": { "method": "", "seed": null }
     },
     "arms": [],
     "primary_outcome": "",
     "author_check": null
   }
   ```

   `arms` is empty for a census; `author_check` becomes `{ "by", "date", "quote" }` once the author
   has seen the drawn units. Other keys are the paper's. The schema lives beside the registry's, in
   `src/adapters/study-registry/`; the text fields may be empty there, because the template is.
   The rule reports a `plan` outside the folder, missing, or not of the schema, and — once the study
   has run (`running`, `done`, `stopped`, `superseded`) — one with `question`, `population.source`,
   `population.draw.method` or `primary_outcome` empty (`bad-plan`); a study of a headline measurement
   that has run with no `author_check` in its plan, no plan, or a check by anyone but `author`
   (`author-check`). A `designing` study's template is clean, so `studies new` never leaves the lint
   red.

   **Compatibility.** A row may name `prereg.json` as its plan: it is read and judged as the plan,
   and a second rule, `repro/study-plan-name`, warns that it moves to `plan.json` — a warning cannot
   come from an error rule, since ESLint sets the level per rule. A `prereg.json` no row names is not
   read, so no existing paper turns red.

## Where each part lives

| part                                   | file                                | layer   |
| -------------------------------------- | ----------------------------------- | ------- |
| the types, the judge, the index, ids   | `src/domain/study-registry.ts`      | domain  |
| the plan's type and template           | `src/domain/study-registry.ts`      | domain  |
| the schemas (zod) of registry and plan | `src/adapters/study-registry/`      | adapter |
| what the app asks of a parser          | `src/ports/study-registry-codec.ts` | port    |
| both rules: list, read, report         | `src/study-registry-rule.ts`        | app     |
| the two commands                       | `src/studies.ts`                    | app     |
| wiring, the clock for today's date     | `src/cli.ts`                        | root    |

The judge is pure: it takes the folder names, the parsed registry (or why it is absent or unreadable),
the README's text, which result files exist, and each named plan parsed, and returns findings. The rule and the commands are
the only places that touch the disk, through the `Files` and `ListDir` ports.

## Generated index, and prettier

The index is a table whose columns are padded to their widest cell, the way prettier writes a
markdown table, so formatting `repro/README.md` with prettier does not make the block stale. A `|` in
a cell is escaped and a line break becomes a space.

## Rejected, by the author on 2026-10-15

- Commands that change a study's status: the row is edited in `studies.json`, the rule checks it.
- Detecting automatically whether a study is cited in the paper: `in_paper` is declared.
- An adopt or migration command for existing folders: there are no other users; the folders are
  renamed by hand once.
- A PreToolUse hook for the registry: the lint is the guarantee, and the layout hook already refuses
  a loose entry.

## What it does not check

- Whether the `question` is one sentence, or the `result` one line, beyond their being strings.
- What a study's `README.md` says, or whether its frontmatter matches the row.
- Files inside a study folder other than `result_file` and the `plan` its row names.
- `study/declare-sample` still reads only `prereg.json`, and asks for different fields
  (`strata`, `screens`, `coverage`, and an `author_check` of `who`, `when`, `units_seen`,
  `units_drawn`, `verdict`); merging the two shapes is its own decision.
