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

The fields, an example plan and the JSON Schema an editor can complete it from are in
[the configuration reference](../../configuration.md#a-papers-revision-planjson-what-is-left-before-submitting).

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
