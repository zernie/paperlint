# cycle/prior-reviews-answered

**Level:** error · **Reads:** `paper.tex` → the paper's `paperlint.json` (`cycles`) → the points
file the rejection names (`outcome.points`) · **Reported on:** `paper.tex`

## What it catches

The current attempt is open, and the attempt just before it was rejected with reviews
(`"desk": false`). Then:

- the rejection's points file is missing, is not YAML, or is not of the shape below;
- a point has no `answer`;
- a `changed` or `argued` answer names a place (`where`) that is no `\section` of the paper.

## Why

A paper rejected with reviews goes to the next venue, and nothing kept the reviews in view: which
points the rewrite answers was tracked from memory. A reviewer at the next venue who read the
earlier reviews, or the same reviewer on a shared committee, sees an unanswered point as ignored
feedback. Journal response letters and ACL Rolling Review's resubmission notes keep the same record:
each point, how it was answered, and where.

Part of it is not this rule's: a rejection that does not say `"desk": true | false`, or a reviewed
one with no `"points"`, does not parse at all ([configuration](../../configuration.md)), so every
command refuses it, not only the lint.

## The points file

Named by the rejected cycle's `outcome.points`, a path in the paper folder (for example
`reviews/<cycle>-response.yaml`). YAML, because a review's quote spans lines:

```yaml
points:
  - id: A1
    reviewer: A
    quote: |
      The evaluation uses two repositories only.
    answer:
      kind: changed # changed | argued | declined
      where: Threats to Validity # changed, argued: the \section title in paper.tex
  - id: B3
    reviewer: B
    quote: Why not compare against auto mode?
    answer:
      kind: declined
      reason: Auto mode did not exist when the runs were made.
```

Refused, naming the point: an unknown key, an empty `id`, `reviewer` or `quote`, two points with one
`id`, an `answer.kind` other than the three, a `changed` or `argued` answer without `where`, a
`declined` answer without `reason`, and a `where` on a `declined` answer. A point may stay without
an `answer` until the next attempt is open.

## Examples

Failing — `paperlint.json`:

```json
{
  "cycles": [
    {
      "id": "alpha-2026",
      "venue": {
        "kind": "named",
        "name": "Alpha",
        "url": "https://alpha.example"
      },
      "opened": "2026-06-01",
      "outcome": {
        "kind": "rejected",
        "date": "2026-09-08",
        "evidence": "reviews/alpha.eml",
        "desk": false,
        "points": "reviews/alpha-response.yaml"
      }
    },
    {
      "id": "beta-2027",
      "venue": {
        "kind": "named",
        "name": "Beta",
        "url": "https://beta.example"
      },
      "opened": "2026-09-09"
    }
  ]
}
```

with point A1 answered `where: Limitations` while `paper.tex` has no `\section{Limitations}`:

```text
papers/my-paper/paper.tex
  1:1  error  reviews/alpha-response.yaml: point A1 (reviewer A) is answered in «Limitations», and
              paper.tex has no \section titled so — correct the title in the answer, or the section
              cycle/prior-reviews-answered
```

Passing:

- every point answered, each `changed` or `argued` answer in a `\section` the paper has;
- a desk rejection (`"desk": true`): there are no reviews to answer;
- a rejection with no attempt after it yet, or an open attempt after an acceptance or a withdrawal;
- a paper whose `paperlint.json` has no `cycles`.

## Options / preset fields

No rule options and no preset fields.

## What it does not check

- Whether the section really answers the point: a reader decides that, not a machine.
- Rejections before the one just before the open attempt: their points were the earlier attempt's
  to answer.
- `\subsection` titles: `where` names a `\section` (or `\section*`), compared with whitespace
  collapsed, as [`tex/required-section`](../tex/required-section.md) compares.

## How to fix

Write the points file the message names, with one entry per point the reviews made, and answer
each: `changed` or `argued` with the `\section` title that answers it, or `declined` with the
reason.
