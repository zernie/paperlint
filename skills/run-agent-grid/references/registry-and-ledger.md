# The registry, the attempt ledger, and a driver that obeys the guard

`grid-guard` is `scripts/grid-guard.mjs` in this skill; every command below is run with
`node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs`. Exit codes: 0 allowed or clean, 1 refused or a
finding, 2 usage, 3 (`gate`) already counted.

## The registry — `grid.json`, committed

```json
{
  "author": "the-author-handle",
  "draw": {
    "population": "every unit of the measured kind, and where the list came from",
    "seed": 7349,
    "script": "draw.py"
  },
  "arms": ["control", "treatment"],
  "seeds": [1, 2, 3],
  "budget": {
    "cap": 300,
    "currency": "USD",
    "stopRule": "stop at the cap; report what ran"
  },
  "models": [
    {
      "id": "model-a",
      "smoke": {
        "timeoutSec": 2400,
        "costPerRun": 1.8,
        "readBy": "who read the smoke runs",
        "at": "ISO time"
      }
    }
  ],
  "units": [
    {
      "id": "unit-017",
      "role": "counted",
      "stratum": "s2",
      "requirement": "the author's requirement on this unit, verbatim",
      "approval": {
        "by": "the-author-handle",
        "at": "ISO time",
        "channel": "where the author said it"
      },
      "proof": {
        "toolVisible": true,
        "firesOnPinned": true,
        "acceptsReference": true,
        "at": "ISO time"
      }
    },
    { "id": "unit-smoke", "role": "smoke" },
    { "id": "unit-031", "role": "excluded", "reason": "why, in one line" }
  ]
}
```

What `gate` requires, field by field:

| field                                        | for          | refused when                                                       |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| the file itself                              | every run    | not in git, not committed, or the working copy differs from `HEAD` |
| `units[].id`, `arms`, `models[].id`, `seeds` | every run    | the cell's unit, arm, model or seed is not declared                |
| `units[].role`                               | every run    | anything but `counted` or `smoke`                                  |
| `units[].reason`                             | every run    | an `excluded` unit has none                                        |
| `budget.cap`                                 | every run    | missing, or ledger spend + next cost would pass it                 |
| `units[].approval`                           | counted runs | `by` ≠ `author`, or `at` / `channel` empty                         |
| `units[].proof`                              | counted runs | any of the three facts is not `true`                               |
| `draw.seed`                                  | counted runs | missing                                                            |
| `models[].smoke`                             | counted runs | `timeoutSec` or `costPerRun` is not a number                       |

On success `gate` prints one JSON line: `{"allowed":true,"cell":{…},"counted":…,"timeoutSec":…,"spent":…}`.
The driver takes the run's timeout from `timeoutSec`.

## The attempt ledger — `attempts.jsonl`, append-only

One JSON object per line. A driver writes a line when an attempt **starts** and another when it
**ends**, with the same `attempt` id; later lines add to earlier ones. A crashed attempt therefore
stays on record with a start and no end.

```json
{"attempt":"a-0042","agent":"cli-a","model":"model-a","unit":"unit-017","arm":"control","seed":1,"root":"/scratch/w1","start":"2026-01-01T10:00:00Z"}
{"attempt":"a-0042","end":"2026-01-01T10:31:00Z","status":"complete","cost":1.62}
```

| field    | meaning                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- |
| `status` | `complete` — counted, whatever the outcome; `harness-error` — kept on record, not counted, re-run  |
| `root`   | the working-copy root the attempt used: what `overlap` compares                                    |
| `agent`  | the agent CLI that ran; with `model` and `<unit>/<arm>/<seed>` it names the cell a label refers to |
| `cost`   | what the attempt cost, counted toward the cap even for a harness error                             |

The outcome itself lives in the run folder (`runs/<attempt>/`), whose completion record
(`done.json` by default) is written **last**.

## A driver loop

```bash
#!/usr/bin/env bash
set -uo pipefail
G="node ${CLAUDE_SKILL_DIR}/scripts/grid-guard.mjs"
ROOT=/scratch/w1            # this driver's own working-copy root
$G lock "$ROOT" --owner "driver-w1" --pid $$ || exit 1
trap '$G release "$ROOT" --owner driver-w1' EXIT

while read -r unit arm model seed; do
  verdict=$($G gate --registry grid.json --ledger attempts.jsonl \
            --unit "$unit" --arm "$arm" --model "$model" --seed "$seed")
  rc=$?
  [ $rc -eq 3 ] && continue           # already counted: resume past it
  [ $rc -ne 0 ] && exit $rc           # refused: stop the grid, read why
  timeout_sec=$(node -e 'console.log(JSON.parse(process.argv[1]).timeoutSec ?? 3600)' "$verdict")
  id="a-$(date +%s)-$unit-$arm-$model-$seed"
  # 1. start record   2. fresh working copy of the unit in $ROOT   3. the agent CLI under
  #    `timeout $timeout_sec`   4. the scorer   5. runs/$id/done.json LAST   6. end record
done < cells.txt
```

Start it detached so the agent session's limits cannot kill it, and let something else wake the
session:

```bash
setsid nohup ./driver.sh > driver.log 2>&1 < /dev/null &
```

## The pre-commit hook

`.git/hooks/pre-commit` (or the hook manager the repository already uses):

```bash
#!/usr/bin/env bash
exec node "<path to this skill>/scripts/grid-guard.mjs" precommit --runs runs --done done.json
```

A hook in `.git/hooks/` is not versioned; record in the study's README that it is installed, and
run the same command in CI if the repository has CI.
