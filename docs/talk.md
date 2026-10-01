# The talk

A venue that accepts a paper usually asks for a talk too: a video for a remote presenter, a
one-slide image, sometimes captions. paperlint does not make the talk. It **judges the finished
files** against what the venue asks, so the same check works whether the video came from Keynote,
OBS, Zoom, a script, or by hand.

## Declaring a talk

The paper's own `paperlint.json` says how it is presented:

```json
{
  "extends": "paperlint:agenticdev",
  "kind": "short",
  "talk": { "mode": "remote-video" }
}
```

| key         | meaning                                                                                      | default   |
| ----------- | -------------------------------------------------------------------------------------------- | --------- |
| `mode`      | `remote-video`, `remote-live` or `in-person` — must be one the venue allows                  | required  |
| `dir`       | the talk folder, relative to the paper                                                       | `talk`    |
| `files`     | the file name of each artifact in that folder, when it is not the default (no slashes)       | see below |
| `one_slide` | `{ "width_px": 1920, "height_px": 1080 }` — the one-slide's size, when the venue states none | none      |

`talk` is a paper's setting: the root `paperlint.json` refuses it.

**File names.** Each artifact is looked for under one name in the talk folder:

| artifact     | default name    |
| ------------ | --------------- |
| `video`      | `talk.mp4`      |
| `one-slide`  | `one-slide.png` |
| `captions`   | `talk.srt`      |
| `slides-pdf` | `slides.pdf`    |
| `poster`     | `poster.pdf`    |

A video named after the paper is declared once:

```json
"talk": {
  "mode": "remote-video",
  "files": { "video": "agenticdev-2026-talk.mp4", "captions": "agenticdev-2026-talk.srt" }
}
```

## What the venue says — the preset's `talk` block

```jsonc
"talk": {
  "modes": ["remote-video"],
  "artifacts": { "remote-video": { "required": ["video", "one-slide"], "optional": ["poster"] } },
  "kinds": { "short": { "slot_s": 600, "talk_s_min": 360, "talk_s_max": 420, "qa_s": 210 } },
  "video": { "container": "mp4", "min_height_px": 720, "max_bytes": 500000000, "captions": "optional" },
  "one_slide": { "width_px": 1920, "height_px": 1080 }
}
```

Every key is optional. Durations are seconds. `kinds` uses the names of `format.kinds`, and the
paper's `kind` picks one. `video.captions: "required"` adds the captions to the files the video's
mode owes. A child preset's `talk` block replaces its parent's whole. The shipped `agenticdev`
preset carries the organizers' numbers, each quoted beside it; it states no one-slide size, because
the venue did not.

## What is checked

All rules run on the paper's `paper.tex` and are silent for a paper that declares no `talk`, except
`talk/undeclared`.

| rule                                                  | level | fails when                                                                                      |
| ----------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| [`talk/profile`](rules/talk/profile.md)               | error | no preset, a preset with no `talk` block, a mode the venue does not allow, no slot for the kind |
| [`talk/required-files`](rules/talk/required-files.md) | error | a file the venue requires for the mode is not in the talk folder                                |
| [`talk/undeclared`](rules/talk/undeclared.md)         | warn  | an `.mp4` sits in `talk/` and the paper declares no `talk`                                      |
| [`talk/duration`](rules/talk/duration.md)             | error | the video runs longer than `talk_s_max`, or its audio track is more than 1 s off its length     |
| [`talk/duration-floor`](rules/talk/duration-floor.md) | warn  | the video runs shorter than `talk_s_min`                                                        |
| [`talk/video-format`](rules/talk/video-format.md)     | error | not an MP4 (QuickTime inside, or not ISO media at all), under `min_height_px`, over `max_bytes` |
| [`talk/one-slide-size`](rules/talk/one-slide-size.md) | error | the one-slide PNG is not the declared size                                                      |
| [`talk/captions-cover`](rules/talk/captions-cover.md) | warn  | the captions start late, end early, or leave a long gap (thresholds uncalibrated)               |

The video is read with [MP4Box.js](https://github.com/gpac/mp4box.js) — the container's own
headers, in JavaScript, in milliseconds. There is no ffmpeg anywhere in paperlint and no build step
for the talk.

## What is not checked

- **What the talk says.** Whether the video matches the paper, its tone, its claims, the QR code on
  a slide — those need a reader, not a count.
- **How it was made.** A script, slides, a voice recording, cut points: paperlint never sees them,
  and nothing here requires them to exist.
- **Deadlines and upload channels.** A deadline is a clock condition; it belongs in a calendar.
- **Whether the file was sent.** Freezing what was sent is not part of the talk rules yet.
- **Codecs, frame rate, bitrate, loudness.** Only the container, the height and the byte size.
