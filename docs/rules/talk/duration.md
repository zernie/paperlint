# talk/duration

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (`talk`, `kind`), the preset's
`talk.kinds`, and the video's headers

## What it catches

- The video runs longer than the slot's `talk_s_max` for the paper's kind (`tooLong`).
- The video's first audio track is more than `trackToleranceS` (default 1 s) shorter or longer than
  the video itself (`trackMismatch`) — a cut or a re-encode dropped or padded sound.

The length is the container's own (the movie header), read with MP4Box.js; the audio track's length
is its own media duration. On the AgenticDev talk both read 320.84 s and 320.86 s, the same numbers
ffmpeg prints.

## Why

A remote talk is played in a fixed slot; a video over it is cut by the session chair, usually at the
conclusion. Measuring the file — not a word count of the script — is the only number the venue
limits: a script of 948 words, timed at the script's own assumed 125 words per minute, predicted
7.6 minutes; the recording ran 5.35.

## Examples

Failing — an AgenticDev short paper (`talk_s_max` 420):

> papers/p/talk/talk.mp4 runs 7:12.0 (432 s), over the 7:00.0 (420 s) talk agenticdev sets for this
> kind of paper — cut it

Passing: a 5:20.8 video with its audio track ending within a second of it.

## Options / preset fields

`{ "trackToleranceS": 1 }`. Preset: `talk.kinds.<kind>.talk_s_max`.

## What it does not check

The floor — that is `talk/duration-floor`, separate so its severity can be set on its own. A video
that does not parse (see `talk/video-format`) or is missing (see `talk/required-files`).

## How to fix

Cut the talk; re-export with the audio and the picture the same length.
