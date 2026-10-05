# cycle/evidence

**Level:** error · **Reads:** the paper's `paperlint.json` (`cycles`) and the paper folder ·
**Reported on:** the first line of the paper's `PIPELINE-STATUS.md`

## What it catches

A closed cycle — `outcome.kind` is `accepted`, `rejected` or `withdrawn` — names an `evidence`
file that is not in the paper folder: the decision mail, the reviews, or the note that records the
withdrawal was never saved, or the path is wrong.

The same for a deadline's `override`: the instant a human decided binds instead of what the pages
said rests on its `evidence` — the chairs' mail that extended the deadline, a saved page — and that
file must be in the paper folder.

## Why

The outcome of an attempt is a claim about what a venue decided, and the record is read by people
and programs that were not there when the mail arrived: a status command, a scorecard check, the
next attempt's prior-work delta. A decision whose evidence is not in the folder is a claim with
nothing behind it, and the day it is doubted there is nowhere to look. The record therefore refuses
an outcome without `evidence` at all, and this rule requires the file to exist.

## Examples

Failing — `paperlint.json`:

```json
{
  "cycles": [
    {
      "id": "first-2026",
      "venue": { "kind": "preset", "extends": "paperlint:acm-sigconf" },
      "opened": "2026-07-01",
      "outcome": {
        "kind": "rejected",
        "date": "2026-09-08",
        "evidence": "reviews/decision.md"
      }
    }
  ]
}
```

with no `reviews/decision.md` in the paper folder:

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  cycle «first-2026» is rejected (2026-09-08) with evidence `reviews/decision.md`, which is
              not in the paper folder — save the decision mail, the reviews or the note that records
              the decision there, or correct the path  cycle/evidence
```

An override whose evidence was never saved:

```text
  1:1  error  cycle «msr-2027»: the override of the "submission" deadline (2026-10-27T04:00:00Z)
              rests on `mail/extension.eml`, which is not in the paper folder — save the mail or the
              page that grants it there, or correct the path  cycle/evidence
```

Passing:

- the same record with `reviews/decision.md` present;
- an open cycle (`"outcome": { "kind": "open" }`, or no `outcome`): nothing has been decided;
- a paper whose `paperlint.json` has no `cycles`.

## Options / preset fields

No rule options. `evidence` is a path relative to the paper folder; it may name any file — the
saved mail, a markdown note with the reviews, a PDF.

## What it does not check

- What the file says. A rejection recorded as `accepted` with the rejection mail as evidence passes
  here; the person who records the outcome reads the mail. Likewise an override's mail is not read
  for its date.
- The `date`. It must be a day (`YYYY-MM-DD`), nothing more.
- Whether a `desk` rejection is marked as such (`"desk": true`); it changes what work follows, not
  whether the record is consistent.

## How to fix

Save the decision in the paper folder — the mail as it arrived, the reviews as the portal shows
them, or a dated note that records a withdrawal and why — and name that file in `evidence`. If the
file exists under another name, correct the path. For an override, save the mail or page that moved
the deadline and name it in the override's `evidence`.
