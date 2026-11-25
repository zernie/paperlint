# revision-plan/record

**Level:** off by default; in the set `paperlint:revision-plan`, turned on with `"warn"` ·
**Reads:** a paper's `revision-plan.json` · **Reported on:** `revision-plan.json`, at the field each
finding is about

## What it catches

A paper's `revision-plan.json` says, for its current cycle, which accepted papers it is held against
(`bar`), whether evidence is still being gathered (`measurement`), and the closed list of what remains
before it is submitted (`remaining`). The rule reports every field that breaks the plan's shape, at
that field:

- a key the shape does not name (a misspelling is a finding, not a field nobody reads);
- a field left out: a `done` row without `evidence`, a `dropped` row without `reason` and `kind`, a
  `corpus` bar without its `series` and at least one edition, a `none` bar without `why`, an `enough`
  measurement without `since` and the `evidence` file that decided it, a row without `from` or
  `added`;
- a value of the wrong kind: a date that is not `YYYY-MM-DD`, a cycle that is no cycle id, a row id
  that is not `R` and a number, a `by-rule` row whose `rule` is not a rule id, a path that is
  absolute or leaves the paper folder;
- two rows with one id.

A field left out is reported at the object that should hold it. Text that is not JSON is ESLint's
parse error on the file.

The shape, field by field, is the JSON Schema `skills/paper-pipeline/revision-plan.schema.json`,
generated from the parser the rule uses; point an editor at it for completion.

```json
{
  "cycle": "langcode-2027",
  "written": "2026-11-25",
  "bar": {
    "kind": "none",
    "why": "a first edition: no accepted papers to read yet"
  },
  "measurement": { "kind": "open" },
  "remaining": [
    {
      "id": "R1",
      "what": "a Limitations section after the conclusion",
      "from": { "kind": "venue" },
      "added": "2026-11-25",
      "state": "by-rule",
      "rule": "tex/required-section"
    },
    {
      "id": "R2",
      "what": "a second model family",
      "from": { "kind": "author" },
      "added": "2026-11-26",
      "state": "dropped",
      "reason": "out of budget before the deadline; the threats section says so",
      "kind": "accepted-cap"
    }
  ]
}
```

| field         | holds                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cycle`       | the cycle the plan is for, as `cycles[].id` in the paper's `paperlint.json` names it                                                                                                                                                                                                              |
| `written`     | the day the plan was written                                                                                                                                                                                                                                                                      |
| `bar`         | `corpus` (a venue corpus's `series` and `editions`), `proxy` (another venue's corpus `series`, and what it `stands_in_for`), or `none` with `why`                                                                                                                                                 |
| `measurement` | `open`, or `enough` with `since` and the paper's `evidence` file                                                                                                                                                                                                                                  |
| `remaining`   | the rows: each with `id`, `what`, `from` (`author`, `venue`, a review `finding` by `file` and id, or `prior-reviews` of a `cycle`), `added`, and a `state`: `todo`, `doing`, `done` with `evidence`, `dropped` with `reason` and `kind` (`not-doing` or `accepted-cap`), or `by-rule` with `rule` |

## Why

A paper whose target is not written down drifts: two consumer papers kept changing what they aimed
at within one cycle, and a reader's or a skill's bar decided when the work was done
([#502](https://github.com/zernie/paperlint/issues/502)). The plan makes the list closed: a review
finding outside it is a proposal until the author adds a row, and each row says where it came from
and when. The rule holds the file to its shape so that whatever reads it can trust each field.

It is **off**, because a plan is a way of working the author chooses, not a fact of the venue. A
paper without the file gets nothing; with the set off, the file is not even read, so a plan that is
not JSON gets no parse error either. Nothing opt-in ships at `error`: the set turns it on at
`"warn"`, and an author's own `"revision-plan/record": "error"` after the set raises it.

```json
{ "rules": { "paperlint:revision-plan": "warn" } }
```

With the set on, a project in which no paper has a `revision-plan.json` fails the run with the line
every optional rule gets when it reaches no file.

## Examples

Failing: a `corpus` bar without its series, a `done` row without evidence, and a key the shape does
not name.

```text
papers/p/revision-plan.json
   4:3  warning  `bar.series`: missing: the shape requires it here. What to do: correct the field; the fields are in the JSON Schema `revision-plan.schema.json` that `paper-pipeline` ships            revision-plan/record
   7:5  warning  `remaining.0.evidence`: missing: the shape requires it here. What to do: correct the field; the fields are in the JSON Schema `revision-plan.schema.json` that `paper-pipeline` ships  revision-plan/record
  22:7  warning  `remaining.1.owner`: Unrecognized key: "owner". What to do: correct the field; the fields are in the JSON Schema `revision-plan.schema.json` that `paper-pipeline` ships               revision-plan/record
```

Passing: the plan above.

## What it does not check

That the cycle is the paper's current one, that the corpus a bar names exists, that each named file
exists, that a finding exists in its review, or that a `by-rule` row's rule is one paperlint ships:
those need the disk and the settings, and are not checked yet.
