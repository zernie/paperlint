# repro/study-result

**Level:** error · **Reads:** `repro/studies.json`, each `done` study's `plan.json` (v2) and
`result.json` · **Reported on:** `PIPELINE-STATUS.md`, line 1

A study whose plan is v2 fixed, before its run, what makes its number believable: when its claim
loses, how well two raters must agree, that its checker is tried on known answers, and why a unit may
be dropped ([the gates](../../design/study-gates.md)). Once the study is `done`, its `result.json`
must show each of them.

## What it catches

For each study that is `done`, whose plan is ready and v2:

| problem             | when                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-result-file`    | the study's folder has no `result.json`                                                                                                                               |
| `result-linked`     | `result.json` is reached through a symbolic link                                                                                                                      |
| `result-unreadable` | `result.json` is not JSON, or `kappa`, `self_test`, `funnel` or `claim` is not of its shape (a kappa outside -1..1, such as a percentage written as `75`, is not one) |
| `no-number`         | the number `mode.we_lose_if.result` names is not a number in `result.json`                                                                                            |
| `claim-lost`        | that number crosses the threshold, and `result.json` does not say `"claim": "lost"`                                                                                   |
| `claim-holds`       | `result.json` says `"claim": "lost"`, and the number does not cross the threshold                                                                                     |
| `kappa`             | a step of `second_check` has no kappa in `result.json`'s `kappa`, or one below its `min_kappa`                                                                        |
| `self-test`         | `self_test` is declared, and `result.json`'s `self_test` is missing or `failed` is not 0                                                                              |
| `funnel`            | a reason of `funnel` has no count in `result.json`'s `funnel`                                                                                                         |

A gate that is `"none"` asks nothing; an exploratory study has no `we_lose_if`.

## Why

A threshold fixed before the run and checked by hand after it can be moved, forgotten or quietly
reinterpreted. Here the plan holds the threshold and the result holds the number, and the engine
compares them on every lint. A claim that lost stays red until the result says so in so many words —
`"claim": "lost"` — where the paper reads its numbers from, so the loss cannot sit unnoticed in a
table. The same holds for a kappa below the bar set before labelling, a checker that missed a known
answer, and a dropped unit nobody counted.

## Examples

Failing — the plan declares the funnel reason `timed out`, the result counts none:

```json
{
  "pass_rate": 0.7,
  "kappa": { "pass": 0.71 },
  "self_test": { "passed": 4, "failed": 0 },
  "funnel": {}
}
```

```text
PIPELINE-STATUS.md
  1:1  error  The `result.json` of `P1-S01` counts no drop for `timed out`, declared in its plan's
              `funnel`. What to do: write each in `funnel`, 0 when none was dropped for it.
```

Failing — `we_lose_if` is `{ "result": "pass_rate", "below": 0.5 }` and the rate is 0.4:

```text
  1:1  error  `P1-S01`'s claim LOST: its `pass_rate` is 0.4, below 0.5, the threshold its plan fixed
              before the run. What to do: report the loss in the paper, and say so in `result.json`
              with `"claim": "lost"`; the threshold is not moved after the run.
```

Passing — every gate shown:

```json
{
  "pass_rate": 0.7,
  "kappa": { "pass": 0.71 },
  "self_test": { "passed": 4, "failed": 0 },
  "funnel": { "timed out": 2 }
}
```

## Options / preset fields

None. The rule is on at `error` in paperlint's config; a paper turns it off in its `paperlint.json`.

## What it does not check

- A study that is not `done`, a plan v1, a draft or a plan that does not parse
  ([`repro/study-registered`](study-registered.md) reports those).
- Whether a gate's `"none"` is true, whether the threshold is a sensible one, or whether the number
  is computed right: the author's check of the plan, and the study's own artifact.
- When the plan was written: git orders the decision file before the outputs
  ([`repro/outputs-before-decision`](outputs-before-decision.md)), not the plan.

## How to fix

Have the study's script write `result.json` beside its plan, with the number `we_lose_if` names at
the top, and `kappa`, `self_test` and `funnel` as the plan declares them
([the shape](../../design/study-gates.md#resultjson)). A lost claim is reported, not hidden: add
`"claim": "lost"` and say so in the paper. Never edit the plan's thresholds after the run.
