# The gates of a plan v2

Issue [#332](https://github.com/zernie/paperlint/issues/332). A measurement study's `plan.json` says,
before the run, what makes its number worth believing; after the run its `result.json` shows it.
Two rules hold it: [`repro/study-registered`](../rules/repro/study-registered.md) reads the plan,
[`repro/study-result`](../rules/repro/study-result.md) reads the result. The code is
`src/domain/study-gates.ts`, `src/domain/study-result.ts` and the parser in
`src/adapters/study-registry/`.

## Where it came from

A consumer paper's main measurement drew rules out of repositories, ran several executed "readings" of
each rule, and counted how often the readings disagreed. Refuting its design by hand found two holes:

- **It could not lose.** A reading that flagged nothing made every other reading "disagree", so the
  number came out in the design's favour whatever the rules said.
- **Readings were not tied to the rule's text.** For "max line length 100", readings of 79, 88, 100
  and 120 counted as interpretations, though three of them contradict the text. The number measured
  how varied configurations are, not how vague the rule is.

The neighbours of that paper that hold up report four checks this design lacked: two raters with an
agreement statistic (Cohen's kappa 0.86 and 0.89 in two of them), errors planted to see that the
checker catches them, every dropped unit counted, and an audit of the extractor — one neighbour read
50 files in full and reports that its extraction caught 66.3% of the eligible rules. A preregistration template —
AsPredicted's eight questions — asks "Specify exactly which analyses you will conduct to examine the
main question/hypothesis"; the plan had no field for what decides the question.

## Versions

A plan says it is v2 with `"$schema": "https://unpkg.com/paperlint/schemas/plan.v2.schema.json"`.

| plan              | judged                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| no `$schema` (v1) | as before; it may carry none of the gates                                 |
| v2                | every gate present: `null` (not decided: a draft), `"none"`, or its value |

A measurement registered on or after **2026-10-31** must have a plan v2 (`plan-version`), so dropping
the marker is no way around the gates. A measurement registered earlier keeps its plan v1; nothing it
had turns red. `paperlint studies new` writes a measurement's plan as v2. A later field is a v3, the
same way: v2 plans keep passing.

**There is no optional gate.** A gate left out of a plan v2 makes the file "not a study plan". The one
way to say "not this study" is the literal `"none"`, written where the reader of the diff sees it.

## The five gates

### `mode.we_lose_if` — the claim can lose

```json
"mode": {
  "kind": "decide_before_run",
  "outputs": ["result.json"],
  "decision": { "file": "repro/P1-S07-readings/decision.md", "note": "…" },
  "we_lose_if": { "result": "share_upper95", "below": 0.20 }
}
```

`result` names a number the study writes in `result.json`; `below` **or** `above` (exactly one) is
the threshold. It lives only in a decide-first mode: an `exploratory` study has no claim to lose, and
its mode cannot hold one. The name is the study's own: `share_upper95` in one study, `fix_rate` in
another.

- **Checked:** present, its shape; after the run, the number is there, and when it crosses the
  threshold `result.json` says `"claim": "lost"` (`claim-lost`), never of a claim that holds
  (`claim-holds`).
- **Not checked:** that the number named is the right one to decide the question — the author's
  check.

**Frozen at the first output.** All five gates are held by git's history
([`repro/outputs-before-decision`](../rules/repro/outputs-before-decision.md)): the plan as it stood
at the commit of the study's first output (the first that came after its decision) must declare each
gate exactly as HEAD's plan does. A gate edited since is `gates-changed`: a threshold moved after the
result was seen can only follow the result. A plan that was not in history yet at that commit, or was
a v1 or unreadable there, is `gates-not-fixed`. Edits to other parts of the plan (its question, its
source) are not reported.

### `second_check` — two raters on each labelling step

```json
"second_check": [
  { "step": "lint-checkable", "min_kappa": 0.60 },
  { "step": "admissible",     "min_kappa": 0.60 }
]
```

One entry per step on which a model or a person labels units, with the least Cohen's kappa
(agreement between two raters beyond chance) the two raters must reach. The threshold is fixed
before labelling, so a kappa of 0.4 cannot be called good enough after it is seen. Landis and Koch's
bands (0.61–0.80 "substantial") are a common reference, and an opinion, not evidence: the study
chooses its own and says why in its design. `"none"` when nothing is labelled.

In the consumer paper the second hole above is closed here: whether a reading fits the rule's text
is the `admissible` labelling step.

- **Checked:** each step's kappa is in `result.json`'s `kappa` and at least its `min_kappa`.
- **Not checked:** who the raters were, how the subset was drawn — that stays in the design. A
  `"none"` on a study that does label is caught only by the author's check.

### `self_test` — the checker is run on known answers first

```json
"self_test": { "made_by": "scripts/extract.selftest.mjs" }
"self_test": { "must_catch": "self-test/bad.js", "must_pass": "self-test/good.js" }
```

When the study runs a check (a linter rule, a script, a classifier) its zero means nothing until the
check has caught an input it must catch and passed one it must pass. Either a script makes and runs
such pairs (`made_by`), or the plan names one pair; the inputs are of whatever type the check reads.
Paths are inside the study's folder. `"none"` when the study runs no check.

- **Checked:** the paths stay in the folder; after the run, `result.json`'s
  `"self_test": { "passed": n, "failed": n }` is there and `failed` is 0.

### `funnel` — every drop counted

```json
"funnel": ["no linter rule", "< 2 admissible readings", "no files in scope", "clone failed"]
```

The reasons a drawn unit may be dropped, each once, fixed before the draw — a study cannot invent a
reason for a unit it would rather not count. Like a trial's flow diagram, which "displays the
progress of all participants through the trial" (CONSORT). `"none"` when no unit is dropped.

- **Checked:** `result.json`'s `funnel` holds a count for every reason (0 when none).

### `recall_audit` — how much the extractor misses

```json
"recall_audit": { "n_files": 50, "min_recall": 0.6 }
```

A study that draws units out of artefacts (rules out of instruction files, functions out of code)
counts only what its extractor found. A person reads `n_files` files of a seeded sample in full and
marks every unit there; the recall is the share of those units the extractor found too. Without it, a
reviewer's "how many did your parser miss?" has no number. `"none"` when nothing is extracted (the
units are given, or a person draws them by hand).

```
 STAGE          WHO WRITES                 WHICH RULE                  RED WHEN
 ─────────────  ─────────────────────────  ──────────────────────────  ──────────────────────────────
 1 plan         the author (+ agent):      repro/study-registered      key missing (schema error);
   (before        "recall_audit":                                      null while the study runs
    the run)      {n_files, min_recall}    repro/outputs-before-       changed after the first output
                                           decision                    (gates-changed)
 2 run          the study's script:        —                           —
                  extracts units
 3 audit        a PERSON reads n_files     —                           —
                  sampled files in full,
                  marks every unit (a
                  build-label-page page)
 4 result       the study's script:        repro/study-result          counts missing (no-recall-audit);
   (after         "recall_audit":          (when the study is done)    files < n_files (recall-sample);
    the run)      {files, units_in_files,                              extracted / units_in_files
                   extracted}                                          < min_recall (recall);
                                                                       extracted > units_in_files
                                                                       (result unreadable)
 FIRES:  in the editor on save · npx paperlint lint · the paper's CI
 CANNOT SEE:  whether the person really read the files in full, or counted right;
              whether the sample was drawn as the design says
```

`result.json` carries the counts, not a share: the files are checked against the plan, and the
recall is computed by the rule (`extracted / units_in_files`), so a share rounded in the study's
favour cannot pass.

- **Checked:** the counts are there; at least `n_files` files; the recall at least `min_recall`.
- **Not checked:** the reading itself — the labels of the audit are data the study exports and
  commits, like any other labels.

## `result.json`

The study's own script writes it beside the plan; the rule only reads it.

```json
{
  "share_upper95": 0.31,
  "kappa": { "lint-checkable": 0.71, "admissible": 0.64 },
  "self_test": { "passed": 212, "failed": 0 },
  "funnel": {
    "no linter rule": 400,
    "< 2 admissible readings": 37,
    "no files in scope": 5,
    "clone failed": 3
  },
  "recall_audit": { "files": 50, "units_in_files": 95, "extracted": 63 }
}
```

Its own numbers go at the top under any name. `kappa`, `self_test`, `funnel`, `recall_audit` and
`claim` have the shapes above. It is judged once the study is `done`.

## What a machine never sees

A `"none"` that is false, a threshold chosen to be easy, a `result` that names the wrong number. These
are read by the author when they approve the plan (`author_check`) — which is why the gates are few,
named in plain words, and visible in the diff.

## Rejected

- **Optional gates, "when they apply".** An author who forgets one would read as an author who did
  not need it. Every gate is present and says `"none"` out loud.
- **A "kind of measurement" field choosing which gates apply.** One more field that can be wrong;
  `"none"` per gate says the same thing where it is checked.
- **Free-text gates** (`why`, `raters`, the subset's share and seed). No check reads them; they stay
  in the study's design.
- **A gate per study design** (admissibility of executed versions, a replication frame, one unit per
  cluster). Specific to one paper so far; a paper keeps such keys in the plan's `extra` until two
  papers have needed them unchanged.
