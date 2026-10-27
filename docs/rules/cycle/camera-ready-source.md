# cycle/camera-ready-source

**Level:** error · **Reads:** `paperlint.json` (`cycles`), `versions/<accepted cycle>/submitted.tex` and
`camera-ready.tex` · **Reported on:** the first line of `paper.tex`

## What it catches

The last cycle is `accepted`, its camera-ready is frozen (`versions/<cycle>/camera-ready.tex`, written
by `npx paperlint submission update <paper> --save`), and that frozen source keeps less than half of the
lines of what was accepted, the cycle's frozen `submitted.tex`. The message names both files and the
count.

Until the camera-ready is frozen the rule is silent: while it is being edited, `paper.tex` differs from
what was accepted by design, since the reviewers' changes go in.

## Why

The camera-ready is what the venue accepted plus the changes its reviewers asked for. Between the upload
and the decision `paper.tex` usually moved on (see [`cycle/draft-drift`](draft-drift.md)). Built from
that drifted draft, the camera-ready would send the venue a paper its reviewers never read.

A camera-ready differs from what was accepted, so any difference cannot be the test. The rule counts
the accepted source's lines the camera-ready keeps unchanged, with the same line diff as
`cycle/draft-drift`: one that keeps at least half started from the accepted source; one that keeps less
was built from something else.

## Examples

Failing: cycle `open-2027` is accepted, and its frozen camera-ready was built from a draft that moved
on:

```text
papers/my-paper/paper.tex
  1:1  error  cycle «open-2027» is accepted, and its frozen camera-ready,
              `versions/open-2027/camera-ready.tex`, keeps 3 of the 13 lines of what was accepted,
              `versions/open-2027/submitted.tex` — under half, so it was not built from the accepted
              source. …  cycle/camera-ready-source
```

Passing:

- an accepted cycle whose camera-ready is not frozen yet, however far `paper.tex` has moved;
- a frozen camera-ready that is the accepted source plus the requested changes.

## Options / preset fields

No rule options.

## What it does not check

- Whether the changes are the ones the reviewers asked for. Half of the lines kept says the
  camera-ready started from the accepted source, not that every change in it was requested.
- `paper.tex` after the camera-ready is frozen. What the venue holds is fixed; the draft is free to head
  for the next paper.
- A camera-ready PDF frozen without its source: there is nothing to compare, and
  [`versions/layout`](../versions/layout.md) names the missing source.

## How to fix

Copy `versions/<cycle>/submitted.tex` over `paper.tex`, make the changes the reviewers asked for, build,
and send again with `npx paperlint submission update <paper> --save`. That replaces the frozen
`camera-ready.{pdf,tex}`.
