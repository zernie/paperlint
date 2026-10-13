# repro/allowed-files-only

**Level:** error · **Reads:** the listing of the paper's `repro/`, and whether each study folder in
it holds a `README.md` · **Reported on:** the first line of the paper's `PIPELINE-STATUS.md`, once
per misplaced entry

## What it catches

An entry at the top of a paper's `repro/` that is not part of its layout, and a study folder there
without a `README.md`. `repro/` holds an index, the tools and data the whole paper shares, and one
dated folder per study. Stage 3 of the pipeline, the study, writes here; the rule runs on every
`paperlint lint` and in CI, and a hook refuses a new loose entry before it is written. The whole map:
[`layout.md`](../../layout.md).

<!-- layout:begin — drawn from src/domain/repro-layout.ts (REPRO_LAYOUT_TREE); src/layout-docs.test.ts fails when this block differs -->

```text
repro/
├── README.md           ← the index: one line per study
├── .gitignore          ← keeps the scripts' byproducts out of git
├── tools/              ← scripts used across the paper (numbers, figures, anonymity check, harnesses)
├── data/               ← shared data (tables, caches)
└── <slug>-YYYY-MM-DD/  ← one folder per study or spike (<slug>-YYYY-MM for one that ran over weeks)
    └── README.md       ← required: what it asks, how to run it, what it found
```

<!-- layout:end -->

`paperlint new` makes `repro/README.md` (a stub index), `repro/tools/` and `repro/data/` (each with a
`.gitkeep` until it holds a file). `repro/` itself gets no `.gitkeep`: its top allows only the entries
above, and it already holds the index.

A loose note belongs in the folder of the study it is about, or in the paper's `research/` when it is
research or a decision rather than the record of a run.

**The date in a study's name** is the day the study began: `ablation-2026-10-12`. A month is
accepted too, `human-labels-2026-10`: a study that ran over weeks (labelling, reading a corpus) has a
month as its honest date, and both forms sort by time. The date must be a real one — no month 13, no
30 February. The slug is lowercase letters and digits, words joined by single hyphens.

Never reported: what interpreters, package managers, test runners and the operating system leave in
the folder they run in — `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`,
`.ipynb_checkpoints/`, `node_modules/`, `.venv/`, `.DS_Store`, `Thumbs.db`.

## Why

`repro/` is where the evidence for every number lives, and it fills up like a desk. One real paper
had 120 entries at its top: about 70 study folders, some with no date, and about 50 loose scripts,
data files and notes. Nobody could say which script produces which number, which study is current,
or where a new run goes. Each kind of material now has one place, and each study says, in its
`README.md`, what it is.

## Examples

Failing: a script loose at the top.

```text
papers/agent-rule-drift/PIPELINE-STATUS.md
  1:1  error  `repro/paper_numbers.py` is loose at the top of the paper's repro/ folder, which holds
              only an index, the shared tools and data, and one dated folder per study. Where it
              goes: repro/tools/ — the scripts used across the paper (numbers, figures, the anonymity
              check, harnesses); a script only one study runs goes in that study's folder instead.
What repro/ holds (what interpreters and package managers leave there, like __pycache__/ and node_modules/, is never reported):
repro/
├── README.md           ← the index: one line per study
…
Rule repro/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/allowed-files-only.md  repro/allowed-files-only
```

Each message names the entry and where it goes, and draws the layout above, so it reads on its own. Where
an entry goes depends on what it is:

| entry                                                                                                                          | where it goes                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| a script (`.py`, `.ipynb`, `.sh`, `.js`, `.mjs`, `.ts`, `.r`, `.jl`, `.sql` …), `Makefile`, `requirements.txt`, `package.json` | `repro/tools/`, or the folder of the one study that runs it                                           |
| data (`.tsv`, `.csv`, `.json`, `.jsonl`, `.yaml`, `.txt`, `.log`, `.parquet`, `.zip` …)                                        | `repro/data/`, or the folder of the one study that produced it                                        |
| a note (`.md`)                                                                                                                 | the dated folder of the study it is about, or the paper's `research/`                                 |
| a folder whose name is not `<slug>-YYYY-MM-DD`                                                                                 | rename it to `<slug>-YYYY-MM-DD` and give it a `README.md`; its first commit's date is a fine default |
| a study folder without `README.md`                                                                                             | add one: what the study asks, how to run it, what it found; and a line in `repro/README.md`           |
| anything else                                                                                                                  | by what it is, as above                                                                               |

Three files paperlint itself once kept at the top of `repro/` are named with their new place and the
command that moves them: `references-cache.json` → `repro/data/` (read by `paperlint build`),
`refs-cache.json` → `repro/data/`, `generated-code-grandfathered.txt` → `repro/tools/`.

To date a folder by its first commit, run in the paper folder:

```sh
git log --reverse --format=%as -- repro/old-baseline | head -1
```

Passing: a paper with no `repro/`, and a `repro/` holding only the entries above.

## Options / preset fields

No rule options.

## What it does not check

- What is inside `tools/`, `data/` and the study folders.
- Whether `repro/README.md` exists, or has a line for every study.
- What a study's `README.md` says.
- `repro/` itself: whether the paper has one is `paper/allowed-files-only`'s concern, and that rule never
  looks inside it. Each entry is judged by exactly one of the two rules.

## The hook

The hook `paper-folder-layout` refuses, before it is written, a new file that would add an entry
this rule reports — a loose file at the top of `repro/`, an undated folder, or a study folder whose
first file is not its `README.md` — with this rule's message as the reason. It never refuses a file
that already exists, and it cannot see a shell `mv` or `cp`: the lint is the guarantee. What it does
and does not do is on [`paper/allowed-files-only`'s page](../paper/allowed-files-only.md#the-hook-a-new-stray-entry-is-refused-before-it-is-written).

## How to fix

Move or rename the entry where its message says, and update whatever names its path:

```sh
git mv papers/agent-rule-drift/repro/paper_numbers.py papers/agent-rule-drift/repro/tools/
git mv papers/agent-rule-drift/repro/baseline papers/agent-rule-drift/repro/baseline-2026-08-05
```

To switch the rule off for one paper — say, one whose `repro/` predates the layout — set it in that
paper's `paperlint.json`; `paper/allowed-files-only` still judges the paper's root:

```json
{ "rules": { "repro/allowed-files-only": "off" } }
```
