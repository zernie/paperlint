# talk/captions-cover

**Level:** warn · **Reads:** `paper.tex` → `paperlint.json` (`talk`), the captions file (SubRip,
`.srt`) and the video's headers

## What it catches

Captions that do not cover the video:

- no cue at all (`noCues`);
- the first cue starts more than `maxStartS` into the video (`lateStart`);
- the last cue ends more than `maxEndGapS` before the video does (`earlyEnd`);
- two consecutive cues are more than `maxGapS` apart (`gap`).

The `.srt` is read with a parser (`srt-parser-2`); only the cue times are used.

## Why

Captions generated from one take and attached to another, or cut short by a tool, still play — and
stop matching the speech partway through. Coverage against the video's length is the part a count
can see.

## Examples

Warning — the AgenticDev talk's last cue ends 4.2 s before the video:

> papers/agenticdev-2026/talk/agenticdev-2026-talk.srt: the last caption ends at 5:16.6 (316.6 s),
> and the video runs 5:20.8 (320.84 s) — more than 2 s uncaptioned at the end

Passing: cues from 0 s to within 2 s of the end, no silence between cues over 5 s.

## Options / preset fields

`{ "maxStartS": 1, "maxEndGapS": 2, "maxGapS": 5 }`. ⚠️ **These thresholds are not calibrated.**
They are a first guess, checked against one real talk only (which ends on a 4 s closing slide and
so warns on `maxEndGapS`). They should be set from the posted talks of a venue, measured with this
same rule, before the rule is raised above a warning.

## What it does not check

Whether the words match the speech, their spelling, line length, reading speed. Captions in another
format than SubRip.

## How to fix

Regenerate the captions from the final video, or extend the last cue; raise a threshold in the
paper's `rules` when a silence is intended (a closing slide).
