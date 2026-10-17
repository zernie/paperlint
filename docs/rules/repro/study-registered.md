# repro/study-registered

**Level:** error · **Reads:** the listing of the paper's `repro/`, `repro/studies.json`,
`repro/README.md`, and each `result_file` and `plan` the registry names · **Reported on:** the first
line of the paper's `PIPELINE-STATUS.md`, once per finding

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

| `measurement` | optional: the id of the measurement the study belongs to (below) |
| `plan` | optional: the study's plan, a file inside its folder — `plan.json` (below) |

A row may carry more fields — a paper's own metadata (`frame`, `method`, `outcome`, …) — and
`paperlint studies new` keeps them when it rewrites the file. Beside `prefix` and `studies`, the top
level holds only the optional `author`, `requirements` and `measurements`; any other key is an error.

### Measurements, requirements, the author

One measurement — a census, a benchmark — often spans several studies: a pilot, the main run, a
replication. A measurement is declared once, at the top level, and each of its studies' rows names
it in `measurement`. The author's requirements on the measurements are kept in their words, beside
them:

```json
{
  "prefix": "P1",
  "author": "A. Author",
  "requirements": [
    {
      "id": "R1",
      "text": "Every sample is a random draw from all rules found, no filter by difficulty.",
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
    {
      "id": "P1-S01",
      "folder": "P1-S01-census-pilot",
      "measurement": "M1",
      "plan": "plan.json",
      "…": "…"
    },
    {
      "id": "P1-S02",
      "folder": "P1-S02-census",
      "measurement": "M1",
      "plan": "plan.json",
      "…": "…"
    }
  ]
}
```

| field                         | what it holds                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `author`                      | optional: the paper's author, the one person who approves a headline measurement |
| `requirements[].id`           | the requirement's id, named by the measurements that must meet it                |
| `requirements[].text`         | the author's words, verbatim                                                     |
| `requirements[].date`         | `YYYY-MM-DD`                                                                     |
| `requirements[].source`       | where they said it: a chat, a message, a review comment                          |
| `measurements[].id`           | the measurement's id, named by its studies' rows                                 |
| `measurements[].title`        | a plain name                                                                     |
| `measurements[].rq`           | optional: the research question it answers                                       |
| `measurements[].role`         | `headline` (the paper's claim rests on it) or `baseline`                         |
| `measurements[].approval`     | the author's approval: `by`, `date`, their words in `quote`, optional `source`   |
| `measurements[].requirements` | optional: the ids of the requirements it must meet                               |

A measurement may carry more fields, as a row does; a requirement and an approval are exactly
their fields. **A registry without `measurements` is judged as before**: a row's `measurement` is
then a field of the paper's own, and nothing checks it.

### The study's plan, `plan.json`

Each study's plan is a JSON file in its folder, fixed before the runs: what it measures, the
population and how the sample is drawn from it, the arms compared, the primary outcome, and the
author's check of the drawn units. `paperlint studies new` writes the template beside the study's
`README.md` and names it in the row's `plan`:

```json
{
  "question": "",
  "population": {
    "source": "",
    "draw": { "kind": "all", "method": "" }
  },
  "arms": [],
  "primary_outcome": "",
  "author_check": null,
  "mode": {
    "kind": "decide_before_run",
    "outputs": [],
    "decision": { "file": "repro/P1-S02-census/decision.md", "note": "" }
  }
}
```

| field                    | what it holds                                                                    |
| ------------------------ | -------------------------------------------------------------------------------- |
| `question`               | what the study measures, one sentence                                            |
| `population.source`      | where the units come from: the census, crawl or registry, with its date          |
| `population.draw.kind`   | `all` (the whole population, a census: no seed) or `seeded` (a sample)           |
| `population.draw.method` | how the sample is drawn: `census`, `random`, `stratified` …                      |
| `population.draw.seed`   | `seeded` only, and required there: the draw's seed, a string or a number         |
| `arms`                   | the conditions compared, each `{ "name": … }`, each name once; `[]` for a census |
| `primary_outcome`        | the one number the study reports first                                           |
| `author_check`           | `null` until the author has seen the drawn units; then `by`, `date`, `quote`     |
| `extra`                  | optional: the paper's own keys (hypotheses, models, budget), kept unread         |
| `mode`                   | a measurement's: exactly one of `decide_before_run` or `exploratory`             |

`mode` is required of a `measurement` (other kinds may omit it): how its outcomes are kept from the
decisions on its inputs — decided before the run (the default the template writes; its `outputs`,
and its `decision` file relative to the paper, committed before the run) or `exploratory` with its
`reason`. Without it a measurement's plan is a draft whose empty text is `mode`. The modes, and the
rule that holds the order in git, [`repro/outputs-before-decision`](outputs-before-decision.md), are
in [`docs/design/study-modes.md`](../../design/study-modes.md).

The template's draw is of all the population; a sampled study changes it to
`{ "kind": "seeded", "method": "random", "seed": 7 }`. The population's size is not stored: it is
counted from the source, and a stored copy could only contradict it.

The plan is closed at every level, and holds no contradiction. Each of these makes the file "not a
study plan" (`bad-plan`, with the reason): a misspelt key; a key of the paper's own outside `extra`,
or a key of `extra` that is a field of the plan; a missing key — `null` is the one way to say "not
yet"; a `seeded` draw without its seed, or an `all` draw with one; two arms of one name; and an
`author_check` on a plan whose required texts are still empty — the author approves a complete plan.

A plan named `prereg.json`, its old name, is parsed by a loose schema — keys of its own accepted at
every level, those at the top kept in `extra`; a seed makes the draw `seeded`, none (or `null`)
makes it `all`; a size is not read; an absent check is `null` — and
[`repro/study-plan-name`](study-plan-name.md) warns that it moves to `plan.json`.

The rule reports:

- a folder at the top of `repro/` with no row (`tools/`, `data/` and what interpreters and package
  managers leave there, like `__pycache__/` and `node_modules/`, are not studies);
- a row whose folder does not exist, and a folder named by more than one row;
- an id that is not `<prefix>-S<digits>`, an id on more than one row, and a folder that is not
  `<id>-<slug>` — a row naming `../x` among them, through which no file is read;
- a title over 8 words;
- `done` without `result` or `result_file`, and a `result_file` that is not a file inside the folder;
- `superseded` without `superseded_by`, or naming an id that is not in the registry;
- an index out of sync: the block of `repro/README.md` between the markers below must hold the
  cells the registry and the plans generate, whatever padding a formatter gave the table — every
  column but the two `studies index` reads from git (below);

  ```text
  <!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->
  <!-- studies:end -->
  ```

- a `repro/` with study folders and no `repro/studies.json` (one finding naming the file), and a
  `studies.json` that is not JSON or not of the shape above (one finding with the reasons);
- when the registry has `measurements`: a row whose `measurement` is not one of them
  (`unknown-measurement`), a measurement no row names (`empty-measurement`), and a measurement that
  must meet a requirement the registry does not hold (`unknown-requirement`);
- a `headline` measurement with no `approval`, or, when the registry names its `author`, one approved
  by anyone else (`headline-approval`);
- a row's `plan` that is outside its folder, not a file, or not of the plan's shape — and, once the
  study has run (`running`, `done`, `stopped`, `superseded`), a plan that leaves `question`,
  `population.source`, `population.draw.method` or `primary_outcome` empty, or — for a measurement —
  declares no `mode` or leaves one of its texts empty (`bad-plan`);
- a study of a `headline` measurement that has run with no `author_check` in its plan — or no plan —
  or, when the registry names its `author`, a check by anyone else (`author-check`).

A study that is still `designing` owes neither a filled plan nor the author's check: the template
`studies new` writes is clean until the first run. A `dropped` study owes neither.

## Why

A paper's `repro/` grew to 79 study folders named `<slug>-YYYY-MM-DD`, and nobody could tell which was
which, which had ended, or which one a number in the paper came from. A date and a slug say when a
study began, not what it is. The registry gives each study a number that does not change and a name a
person can read, and says in one place where every study stands. A rule holds it, not a guideline: a
row the rule does not check is a row that drifts.

The index in `repro/README.md` is generated, so it is never edited by hand: the rule compares its
cells. It is a table padded the way prettier writes one, so formatting the README leaves it in sync.

Three of its columns say how each study kept its outcomes from its decisions
([`docs/design/study-modes.md`](../../design/study-modes.md)):

| column         | cell                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `mode`         | `decide_before_run`, `exploratory: <reason>`, or `—` for a study whose plan has none |
| `decision`     | the decision file's first commit (12 characters) and its date, or `not committed`    |
| `first output` | the first commit of the oldest output and its date, or `none`                        |

The `mode` comes from the plan, which is in the tree, so the rule compares it. The two commits are
what git's history said when `paperlint studies index` last ran: a squash merge or a rebase gives the
same files new commits, and a shallow CI clone has none to read, so the rule never compares those two
columns. Regenerate the index before reading them; the order itself is judged by
[`repro/outputs-before-decision`](outputs-before-decision.md), not by the table. In a shallow clone
`studies index` writes `unknown (shallow clone)`.

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

Failing: the census of the example above set to `running` while its plan is still the template —
the plan is reported for its empty fields, and the study for the author's check it lacks:

```text
papers/example/PIPELINE-STATUS.md
  1:1  error  The plan of `P1-S02`, `plan.json` in its folder, leaves `question`, `population.source`,
              `population.draw.method`, `primary_outcome`, `mode.outputs` and `mode.decision.note`
              empty, and the study is `running`: a plan is written before the runs. What to do: fill
              them in, or set the study back to `designing`.
  1:1  error  `P1-S02` is `running` in the headline measurement `M1`, and its plan has no
              `author_check`. What to do: show the author the drawn units, then record their answer
              in the plan's `author_check` — `by`, `date`, and their words in `quote`.
```

Passing: a paper with no study folder; and a `repro/` made only by `paperlint studies new`, its rows
edited as the studies end and its index regenerated:

```text
repro/
├── README.md
├── studies.json
├── P1-S01-baseline-pass-rate/
│   ├── README.md
│   ├── plan.json
│   └── results.tsv
├── tools/
└── data/
```

```markdown
<!-- studies:begin — generated from studies.json by `paperlint studies index`; do not edit -->

| id     | title              | status | result             | in paper | mode              | decision                | first output            | folder                                                   |
| ------ | ------------------ | ------ | ------------------ | -------- | ----------------- | ----------------------- | ----------------------- | -------------------------------------------------------- |
| P1-S01 | Baseline pass rate | done   | 41 of 60 runs pass | yes      | decide_before_run | 3f2a9c1d7e40 2026-10-14 | 8b51e0aa42c9 2026-10-15 | [P1-S01-baseline-pass-rate/](P1-S01-baseline-pass-rate/) |

<!-- studies:end -->
```

## Options / preset fields

No rule options.

## What it does not check

- Whether `question` is one sentence and `result` one line, beyond their being text.
- What a study's `README.md` says, or whether its frontmatter matches the row.
- Whether a plan's texts say anything true, beyond their being filled in; whether `arms` should be
  empty; whether the person in `approval` or `author_check` really said it — the rule sees the
  name, not who typed it.
- A repeated measurement or requirement id, and a requirement no measurement names.
- A `prereg.json` or `plan.json` that no row names.
- Whether the paper cites a study: `in_paper` is declared, not detected.
- The index's `decision` and `first output` cells: they name commits a squash merge renames.
- Inside a study folder that is a symbolic link: nothing is read through it, so its plan and its
  result file read as missing.
- What may stand at the top of `repro/` besides the study folders, and whether a study folder has a
  `README.md`: that is [`repro/allowed-files-only`](allowed-files-only.md).

## How to fix

Create every new study with the command, which takes the next id, makes the folder and its
`README.md`, appends the row and regenerates the index:

```sh
npx paperlint studies new papers/example "Baseline pass rate" --kind measurement
```

`studies new` also writes the study's `plan.json`: fill it in before the first run, and, for a
study of a headline measurement, show the author the drawn units and record their answer in its
`author_check`. A measurement is added by hand to `measurements`, with the author's `approval` when
it is the headline, and each of its studies' rows names it in `measurement`.

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
