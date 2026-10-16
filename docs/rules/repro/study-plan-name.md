# repro/study-plan-name

**Level:** warning · **Reads:** `repro/studies.json` · **Reported on:** the first line of the
paper's `PIPELINE-STATUS.md`, once per study

## What it catches

A study whose row in `repro/studies.json` names its plan as `prereg.json` — the name the plan had
before `paperlint studies new` wrote it as `plan.json`.

```json
{
  "id": "P1-S01",
  "folder": "P1-S01-rule-census",
  "plan": "prereg.json",
  "…": "…"
}
```

The file is still read as the study's plan — by a loose schema, since it was written by hand before
the plan had one: keys of its own are accepted, a seed makes its draw `seeded` and none makes it a
draw of `all`, a size is not read, and an absent check is `null` —
and [`repro/study-registered`](study-registered.md) judges it like any `plan.json`. This rule only
asks for the new name. A `prereg.json` moved to `plan.json` is parsed strictly: its own keys go in
`extra`.

## Why

A study's plan was once a hand-written `prereg.json`. The name misled: it is not a pre-registration
with an outside registry, it is the study's own plan, fixed before the runs, with the author's check
of the drawn units. Papers that wrote one before `plan.json` existed keep working; this warning tells
them where the file moves, without failing their build.

## Examples

Failing (a warning):

```text
papers/example/PIPELINE-STATUS.md
  1:1  warning  The plan of `P1-S01` is `prereg.json`, its old name; it is read as the plan. What to
                do: rename it to `plan.json` in the study's folder (`git mv`) and set the row's `plan`
                to `plan.json`.
Rule repro/study-plan-name: https://github.com/zernie/paperlint/blob/main/docs/rules/repro/study-plan-name.md  repro/study-plan-name
```

Passing: the row names `"plan": "plan.json"`, as `paperlint studies new` writes it; or the row
names no plan.

## Options / preset fields

No rule options.

## What it does not check

- A `prereg.json` in a study folder whose row names no `plan`: the file is not the study's plan
  until the row says so, and is not read.
- Anything inside the plan: that is [`repro/study-registered`](study-registered.md).

## How to fix

```sh
git mv papers/example/repro/P1-S01-rule-census/prereg.json papers/example/repro/P1-S01-rule-census/plan.json
```

then set the row's `"plan": "plan.json"` in `repro/studies.json`. To keep the old name for one
paper, switch the rule off in its `paperlint.json`:

```json
{ "rules": { "repro/study-plan-name": "off" } }
```
