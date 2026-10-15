# repro/study-registered

**Level:** error · **Reads:** the listing of the paper's `repro/`, `repro/studies.json`,
`repro/README.md`, and each `result_file` the registry names · **Reported on:** the first line of the
paper's `PIPELINE-STATUS.md`, once per finding

## What it catches

A study that is not in the paper's study registry, a row that does not match the folders, and an
index that does not match the registry. The registry is `repro/studies.json`: one row per study,
with a stable id, a plain name, its status and its result. Every study folder at the top of `repro/`
is named `<id>-<slug>` after its row — `P1-S03-baseline`. The design: [`study-registry.md`](../../design/study-registry.md).

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

| field           | what it holds                                                                    |
| --------------- | -------------------------------------------------------------------------------- |
| `prefix`        | the paper's prefix: a capital letter, then capitals or digits (`P1`)             |
| `id`            | `<prefix>-S` and two or more digits; unique                                      |
| `folder`        | `<id>-<slug>`, the study's folder at the top of `repro/`                         |
| `title`         | a plain name of at most 8 words                                                  |
| `question`      | one sentence: what the study asks                                                |
| `kind`          | `measurement`, `spike`, `tooling`, `data`, `artifact` or `salvage`               |
| `status`        | `designing`, `running`, `done`, `stopped`, `superseded` or `dropped`             |
| `date`          | `YYYY-MM-DD`, the day the study was registered                                   |
| `result`        | optional: the result in one line; required when `done`                           |
| `result_file`   | optional: the file inside the folder the result is read from; required when done |
| `superseded_by` | optional: the id of the study that replaced it; required when `superseded`       |
| `in_paper`      | `yes`, `no`, or `registry` (listed in the registry, not in the paper's text)     |

A row may carry more fields — a paper's own measurement metadata (`role`, `frame`, `method`,
`outcome`, …) — and `paperlint studies new` keeps them when it rewrites the file. The top level holds
only `prefix` and `studies`.

The rule reports:

- a folder at the top of `repro/` with no row (`tools/`, `data/` and what interpreters and package
  managers leave there, like `__pycache__/` and `node_modules/`, are not studies);
- a row whose folder does not exist, and a folder named by more than one row;
- an id that is not `<prefix>-S<digits>`, an id on more than one row, and a folder that is not
  `<id>-<slug>`;
- a title over 8 words;
- `done` without `result` or `result_file`, and a `result_file` that is not a file inside the folder;
- `superseded` without `superseded_by`, or naming an id that is not in the registry;
- an index out of sync: the block of `repro/README.md` between the markers below must equal the
  text the registry generates, character for character;

  ```text
  <!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->
  <!-- studies:end -->
  ```

- a `repro/` with study folders and no `repro/studies.json` (one finding naming the file), and a
  `studies.json` that is not JSON or not of the shape above (one finding with the reasons).

## Why

A paper's `repro/` grew to 79 study folders named `<slug>-YYYY-MM-DD`, and nobody could tell which was
which, which had ended, or which one a number in the paper came from. A date and a slug say when a
study began, not what it is. The registry gives each study a number that does not change and a name a
person can read, and says in one place where every study stands. A rule holds it, not a guideline: a
row the rule does not check is a row that drifts.

The index in `repro/README.md` is generated, so it is never edited by hand and never parsed: the rule
compares strings. It is a table padded the way prettier writes one, so formatting the README leaves
it in sync.

## Examples

Failing: a folder in the dated form beside a registered study.

```text
papers/example/PIPELINE-STATUS.md
  1:1  error  `repro/baseline-2026-10-02/` has no row in `repro/studies.json`, and every study folder
              has exactly one. What to do: add its row with the next free id, `P1-S02`, and rename the
              folder to `P1-S02-<slug>`; a new study is created with
              `npx paperlint studies new <paper-dir> "<title>"`, which does both.
Rule repro/study-registered: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-registered.md  repro/study-registered
```

Failing: a row set to `done` by hand, with no result, and the index not regenerated — two findings.

Passing: a paper with no study folder; and a `repro/` made only by `paperlint studies new`, its rows
edited as the studies end and its index regenerated:

```text
repro/
├── README.md
├── studies.json
├── P1-S01-baseline-pass-rate/
│   ├── README.md
│   └── results.tsv
├── tools/
└── data/
```

```markdown
<!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->

| id     | title              | status | result             | in paper | folder                                                   |
| ------ | ------------------ | ------ | ------------------ | -------- | -------------------------------------------------------- |
| P1-S01 | Baseline pass rate | done   | 41 of 60 runs pass | yes      | [P1-S01-baseline-pass-rate/](P1-S01-baseline-pass-rate/) |

<!-- studies:end -->
```

## Options / preset fields

No rule options.

## What it does not check

- Whether `question` is one sentence and `result` one line, beyond their being text.
- What a study's `README.md` says, or whether its frontmatter matches the row.
- Whether the paper cites a study: `in_paper` is declared, not detected.
- What may stand at the top of `repro/` besides the study folders, and whether a study folder has a
  `README.md`: that is [`repro/allowed-files-only`](allowed-files-only.md).

## How to fix

Create every new study with the command, which takes the next id, makes the folder and its
`README.md`, appends the row and regenerates the index:

```sh
npx paperlint studies new papers/example "Baseline pass rate" --kind measurement
```

When a study ends, edit its row in `repro/studies.json` — `status`, `result`, `result_file`,
`in_paper`, and `superseded_by` when another study replaced it — then regenerate the index:

```sh
npx paperlint studies index papers/example
```

A paper without a registry writes `repro/studies.json` once, with its prefix:
`{ "prefix": "P1", "studies": [] }`. A folder that predates the registry gets a row by hand and is
renamed to `<id>-<slug>` with `git mv`.

To switch the rule off for one paper — one that keeps its dated `<slug>-YYYY-MM-DD` folders —
set it in that paper's `paperlint.json`; `repro/allowed-files-only` still accepts the dated form:

```json
{ "rules": { "repro/study-registered": "off" } }
```
