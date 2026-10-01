# talk/video-format

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (`talk`), the preset's `talk.video`,
and the video's headers and size

## What it catches

- The file is not ISO media at all — no `ftyp` box first, or no `moov` box (`unreadable`). Reported
  whatever the preset says, because no other talk rule can read such a file.
- `container: "mp4"` and the file is QuickTime inside (major brand `qt  `), whatever its extension
  (`container`).
- `min_height_px` and the video track is shorter (`height`), or there is no video track
  (`noVideoTrack`).
- `max_bytes` and the file is larger (`bytes`).

## Why

Upload forms reject by format and size, and "HD" is a stated requirement. A `.mov` renamed to
`.mp4` plays on the author's machine and fails in the form or in the session's player.

## Examples

Failing — a 1280×720 video against a venue asking for 1080 px:

> papers/p/talk/talk.mp4 is 720 px high, under the 1080 px myvenue asks for — export at a higher
> resolution

Passing: the AgenticDev talk, 1920×1080 H.264 in an `isom` MP4, against `min_height_px` 720.

## Options / preset fields

No rule options. Preset: `talk.video.container`, `talk.video.min_height_px`, `talk.video.max_bytes`.
A field the preset does not set is not checked. Without a `talk` block the rule is silent.

## What it does not check

Codec, frame rate, bitrate, audio format, rotation metadata (the height is the track's, before any
rotation), loudness.

## How to fix

Export as MP4 (H.264 and AAC are what every player takes) at the venue's resolution; re-encode at a
lower bitrate to fit the size limit.
