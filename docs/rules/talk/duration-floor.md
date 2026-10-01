# talk/duration-floor

**Level:** warn · **Reads:** `paper.tex` → `paperlint.json` (`talk`, `kind`), the preset's
`talk.kinds`, and the video's headers

## What it catches

The video runs shorter than the slot's `talk_s_min` for the paper's kind (`tooShort`).

## Why

A venue that states a window ("6–7 min talk") states a floor, and a ceiling-only check pushes every
talk toward shorter. Whether a short talk is a problem is the author's call — some sessions welcome
extra questions — so this is a warning, and a separate rule: turn it off for a paper, or raise it to
an error, without touching the ceiling.

## Examples

Warning — the AgenticDev talk measured 320.84 s against the organizers' 6–7 minutes:

> papers/agenticdev-2026/talk/agenticdev-2026-talk.mp4 runs 5:20.8 (320.84 s), under the 6:00.0
> (360 s) talk agenticdev asks for a short paper — decide whether that is fine, or set this rule to
> off for the paper

Passing: any length from `talk_s_min` up.

## Options / preset fields

No rule options. Preset: `talk.kinds.<kind>.talk_s_min`; without it the rule is silent.

## What it does not check

The ceiling (`talk/duration`).

## How to fix

Lengthen the talk, or decide it is fine and set `"talk/duration-floor": "off"` in the paper's
`rules`.
