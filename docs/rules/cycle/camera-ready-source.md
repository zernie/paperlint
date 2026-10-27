# cycle/camera-ready-source

**Level:** error · **Reads:** `paper.tex` (with the files the last build spliced in), `paperlint.json`
(`cycles`), `versions/<accepted cycle>/` · **Reported on:** the first line of `paper.tex`

## What it catches

The last cycle is `accepted`, no `camera-ready.pdf` or `camera-ready.tex` is frozen in its folder yet,
and `paper.tex` differs from its frozen `submitted.tex`. The message names that file.

## Why

The camera-ready is what the venue accepted plus the changes its reviewers asked for. `paperlint build`
builds `paper.tex`, and between the upload and the decision `paper.tex` usually moved on (see
[`cycle/draft-drift`](draft-drift.md)). Built from the drifted draft, the camera-ready would send the
venue a paper its reviewers never read. The frozen source is the one to start from.

## Examples

Failing — cycle `open-2027` is accepted, and `paper.tex` changed after `submitted.tex` was frozen:

```text
papers/my-paper/paper.tex
  1:1  error  cycle «open-2027» is accepted, and paper.tex has moved on from what was accepted,
              `versions/open-2027/submitted.tex`: 18 lines added, 18 removed. The camera-ready starts
              from that frozen source — …  cycle/camera-ready-source
```

Passing: `paper.tex` as frozen; or a camera-ready already frozen in the cycle's folder.

## Options / preset fields

No rule options.

## What it does not check

- Whether the changes since the freeze are the ones the reviewers asked for: once `paper.tex` starts
  from the frozen source and takes the requested changes, it differs again, and the rule keeps
  speaking until the camera-ready is sent and frozen. A paper in that state turns it off in its
  `paperlint.json` for those weeks — `"rules": { "cycle/camera-ready-source": "off" }` — and back on
  once the camera-ready is frozen.

## How to fix

Copy `versions/<cycle>/submitted.tex` over `paper.tex`, make the changes the reviewers asked for, build,
and send with `npx paperlint submission update <paper> --save`, which freezes the camera-ready as
`versions/<cycle>/camera-ready.{pdf,tex}`.
