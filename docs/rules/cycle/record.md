# cycle/record

**Level:** error · **Reads:** the paper's `paperlint.json` (`cycles`) and the venue presets it names ·
**Reported on:** the first line of the paper's `PIPELINE-STATUS.md`

## What it catches

The paper's `cycles` — its attempts at venues, one entry each, oldest first — do not describe one
consistent history:

- **one source's deadlines are out of order.** The order a venue's deadlines keep is

  ```text
  registration ≤ submission ≤ resubmission < notification < camera-ready
  ```

  and it is checked within each source: the portal's readings among themselves, the call's among
  themselves, the overrides among themselves. A call's abstract day after its own paper day is a
  date typed wrong or an AoE day miscounted.

- **a portal reading the venue's preset already carries.** A cycle whose venue is a preset derives
  the portal's readings from it (`presets/msr.jsonc` carries MSR's); the same reading typed into the
  paper is a second copy, and it goes stale the day paperlint updates the preset.

The structural problems of the record — a bare date where an instant is needed, two open cycles, an
open cycle that is not the last, two cycles with one id, one deadline in two entries, two readings
from one source, an override without its reason or evidence, an unknown key anywhere in the record
— are refused earlier, by `paperlint lint` itself before any rule runs, with one line naming the
file, the place and the problem, and exit code 2, the same way an unknown key in `paperlint.json` is
refused. This rule judges what the record parses with.

## Why

A deadline is the one fact in the record whose error costs the attempt. The record keeps what each
page said — the portal, which refuses the upload, and the call, which only announces — with where and
when it was read, and the **earlier** reading binds unless a human override says otherwise. That the
portal and the call disagree is expected and is not a finding: at MSR 2027 the portal's "submissions
must be completed by" falls at 04:00 UTC on the call's _abstract_ day, four days before the call's
_paper_ day, and keeping both is how the earlier one is seen. What is a finding is a source that
contradicts itself, and a fact recorded in two places.

## Examples

Failing — `paperlint.json`, the call's own dates inverted:

```json
{
  "cycles": [
    {
      "id": "conf-2027",
      "venue": { "kind": "preset", "extends": "paperlint:acm-sigconf" },
      "opened": "2026-09-09",
      "deadlines": [
        {
          "what": "registration",
          "observed": [
            {
              "at": "2026-10-25 AoE",
              "source": "call",
              "url": "https://conf.example/cfp",
              "read": "2026-09-09"
            }
          ]
        },
        {
          "what": "submission",
          "observed": [
            {
              "at": "2026-10-23 AoE",
              "source": "call",
              "url": "https://conf.example/cfp",
              "read": "2026-09-09"
            }
          ]
        }
      ]
    }
  ]
}
```

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  paperlint.json, cycle «conf-2027»: the call's "registration" (2026-10-26T11:59:59Z) is
              after its "submission" (2026-10-24T11:59:59Z) — a date typed wrong, or an AoE day
              miscounted (write a call's date as "YYYY-MM-DD AoE" and paperlint converts it)
              cycle/record
```

Failing — a cycle at `paperlint:msr` that copies the portal's reading the preset carries:

```text
  1:1  error  paperlint.json, cycle «msr-2027»: the "submission" deadline records a portal reading,
              and the preset paperlint:msr carries the portal's reading of it (2026-10-20T04:00:00Z,
              read 2026-10-05) — a second copy drifts when paperlint updates the preset: delete this
              one (the call's reading and an override stay)  cycle/record
```

Passing:

- the first record with the registration on `2026-10-20 AoE`;
- a cycle at `paperlint:msr` recording the call's abstract day as `registration` (`2026-10-20 AoE`)
  and its paper day as `submission` (`2026-10-23 AoE`): the preset's portal `submission`
  (`2026-10-20T04:00:00Z`) is earlier than both, binds, and is not a contradiction;
- a cycle with no `deadlines` at all;
- a paper whose `paperlint.json` has no `cycles` (the flat form, `"extends": "paperlint:…"`).

## Options / preset fields

No rule options. One deadline entry:

```jsonc
{
  "what": "submission", // registration (the call's abstract) · submission (the full paper) · resubmission · notification · camera-ready
  "observed": [
    {
      "at": "2026-10-23 AoE", // or an instant with its zone: 2026-10-20T04:00:00Z
      "source": "call", // or "portal"
      "url": "https://conf.example/cfp",
      "read": "2026-10-05", // the day the page was read
    },
  ],
  // optional; wins over every reading
  "override": {
    "at": "2026-10-27T04:00:00Z",
    "reason": "the chairs extended the deadline by mail",
    "evidence": "mail/extension.eml",
  },
}
```

The preset field is `deadlines` in a venue preset: a list of readings `{ "what", "at", "source",
"url", "read" }`, `at` in UTC. Shipped presets carry their portal's readings and are refreshed by a
scheduled workflow in paperlint's repository; your own preset may carry readings the same way.

## What it does not check

- Whether a reading is still what the page says. The rule has no network and no clock; a shipped
  preset's readings are re-read daily in paperlint's repository and reach you as a patch release.
  A venue without a preset (`"kind": "named"`) is re-read by you.
- Whether a deadline has passed, or how long is left.
- A disagreement between sources — that is what the record holds; the earlier reading binds.
- Whether an override's evidence exists — that is [`cycle/evidence`](evidence.md).
- Whether the scorecard's stages name these cycles — that is [`cycle/stage`](stage.md).

## How to fix

Correct the date. For a deadline read from a call for papers, write it as the call prints it,
`"YYYY-MM-DD AoE"`, and let paperlint do the arithmetic; for one read from a portal, write the instant
the portal shows with its zone. Delete a portal reading the venue's preset already carries. A
deadline the chairs moved by mail is an `override`, with the mail saved in the paper folder as its
`evidence`.
