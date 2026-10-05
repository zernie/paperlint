# cycle/record

**Level:** error · **Reads:** the paper's `paperlint.json` (`cycles`) · **Reported on:** the first
line of the paper's `PIPELINE-STATUS.md`

## What it catches

The paper's `cycles` — its attempts at venues, one entry each, oldest first — do not describe one
consistent history: a deadline is recorded twice, or the deadlines of one cycle are out of order.
The order a cycle's deadlines must keep is

```text
registration ≤ submission ≤ resubmission < notification < camera-ready
```

A registration deadline after the submission deadline, or a camera-ready before the notification,
is a date typed wrong or an AoE day miscounted.

The structural problems of the record — a bare date where an instant is needed, two open cycles,
an open cycle that is not the last, two cycles with one id, an unknown key — are refused earlier,
by `paperlint lint` itself before any rule runs, with one line naming the file and the problem and
exit code 2, the same way an unknown key in `paperlint.json` is refused. This rule judges what the
record parses with.

## Why

A deadline is the one fact in the record whose error costs the attempt. The record exists so that
a deadline is written once, as an instant with its zone, where it was read (`"source": "portal"` or
`"call"`), and compared against the portal later. Two values for one deadline, or deadlines that
contradict each other, mean one of them is wrong, and nothing else can tell which.

## Examples

Failing — `paperlint.json`:

```json
{
  "cycles": [
    {
      "id": "conf-2027",
      "venue": { "kind": "preset", "extends": "paperlint:acm-sigconf" },
      "opened": "2026-09-09",
      "deadlines": [
        {
          "what": "submission",
          "at": "2026-10-20T04:00:00Z",
          "source": "portal",
          "url": "https://conf.example/deadlines"
        },
        {
          "what": "registration",
          "at": "2026-10-21T04:00:00Z",
          "source": "call",
          "url": "https://conf.example/cfp"
        }
      ]
    }
  ]
}
```

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  paperlint.json, cycle «conf-2027»: the "registration" deadline (2026-10-21T04:00:00Z) is
              after the "submission" deadline (2026-10-20T04:00:00Z) — a date typed wrong, or an AoE
              day miscounted (write the call's date as "YYYY-MM-DD AoE" and let paperlint convert it)
              cycle/record
```

Passing:

- the same record with the registration on `2026-10-13T04:00:00Z`;
- a cycle with no `deadlines` at all;
- a paper whose `paperlint.json` has no `cycles` (the flat form, `"extends": "paperlint:…"`).

## Options / preset fields

No rule options. The record's shape is fixed; one cycle:

```jsonc
{
  "id": "conf-2027", // what a stage's `cycle:` names
  "venue": { "kind": "preset", "extends": "paperlint:aidc" }, // or { "kind": "named", "name", "url" }
  "kind": "regular", // a key of the preset's format.kinds
  "opened": "2026-09-09", // the day this attempt was decided
  "phase": "porting", // optional; default "prepared"
  "deadlines": [
    {
      "what": "submission",
      "at": "2026-10-20T04:00:00Z",
      "source": "portal",
      "url": "…",
    },
  ],
  "submission": { "id": 7 }, // the paper's number on the portal
  "outcome": { "kind": "open" }, // or accepted | rejected | withdrawn, with date and evidence
}
```

`at` is an instant with its zone (`2026-10-20T04:00:00Z`, `2026-10-20T09:00:00+05:00`) or a call's
`"2026-10-20 AoE"`, which paperlint converts to the end of that day at UTC−12. A bare date is
refused.

## What it does not check

- Whether the recorded deadline is the venue's real one. The rule has no network and no clock; the
  record says where each deadline was read (`source`, `url`), so it can be re-read there.
- Whether a deadline has passed.
- Whether the evidence of a closed cycle exists — that is [`cycle/evidence`](evidence.md).
- Whether the scorecard's stages name these cycles — that is [`cycle/stage`](stage.md).

## How to fix

Correct the date. For a deadline read from a call for papers, write it as the call prints it,
`"YYYY-MM-DD AoE"`, and let paperlint do the arithmetic; for one read from the portal, write the
instant the portal shows with its zone. Delete the duplicate when a deadline is recorded twice.
