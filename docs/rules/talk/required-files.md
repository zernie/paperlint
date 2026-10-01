# talk/required-files

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (`talk`), the preset's
`talk.artifacts` and `talk.video.captions`, and the talk folder

## What it catches

A file the venue requires for the paper's talk mode that is not in the talk folder — one finding per
missing file (`missing`). The required set is `talk.artifacts[<mode>].required`, plus `captions`
when `talk.video.captions` is `"required"` and the mode owes a video.

## Why

Submitting a talk is usually a form with several uploads, the evening before. A missing one-slide
image is noticed when the form asks for it; this rule notices it when the paper is linted.

## Examples

Failing — AgenticDev requires a video and a one-slide for a remote talk, and `talk/one-slide.png` is
not there:

> agenticdev asks for the one-slide of a remote-video talk, and papers/p/talk/one-slide.png is not
> there — add it, or name the file in `talk.files`

Passing: `talk/talk.mp4` and `talk/one-slide.png` both present (or the names given in `talk.files`).

## Options / preset fields

No rule options. Preset: `talk.artifacts`, `talk.video.captions`. Paper: `talk.dir`, `talk.files`.

## What it does not check

Whether a present file is any good — the other talk rules read the contents. Optional artifacts.
A paper that declares no `talk` (see `talk/undeclared`).

## How to fix

Put the file in the talk folder under its default name ([`docs/talk.md`](../../talk.md)), or name
it in the paper's `talk.files`.
