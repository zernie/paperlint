/**
 * MP4Box.js (GPAC's ISO-BMFF parser, pure JavaScript, no dependencies) as the video half of the
 * `TalkMedia` port: the movie header's duration, the first audio and video tracks, the brands.
 * No ffmpeg: the boxes that hold these numbers (`ftyp`, `moov/mvhd`, `trak/tkhd`, `mdhd`) are read
 * directly, in milliseconds even for a ten-megabyte file.
 */
import { createFile, MP4BoxBuffer, type Movie, type Track } from "mp4box";
import type { VideoProbe } from "../../domain/talk.ts";

/**
 * Whether the bytes open with an `ftyp` box, as every MP4 and QuickTime file written by a current
 * tool does. Anything else is refused here, before MP4Box.js — which would log its parse errors to
 * the console, in the middle of the lint output.
 */
const opensWithFtyp = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 &&
  new TextDecoder("latin1").decode(bytes.subarray(4, 8)) === "ftyp";

/** A track's duration in seconds, from its own media timescale. */
const seconds = (t: Readonly<Pick<Track, "duration" | "timescale">>): number =>
  t.duration / t.timescale;

/** The movie's info, or null when the bytes hold no complete `moov` box. */
function movieOf(bytes: Uint8Array): Readonly<Movie> | null {
  const file = createFile();
  const copy = bytes.slice().buffer;
  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(copy, 0));
  file.flush();
  // `moov` is typed as always present and is undefined until the box has been parsed.
  const parsed: unknown = file.moov;
  return parsed === undefined ? null : file.getInfo();
}

/** The bytes of a video file → its durations, size and brands; null when not an ISO media file. */
export function probeVideo(bytes: Uint8Array): VideoProbe | null {
  if (!opensWithFtyp(bytes)) return null;
  const movie = movieOf(bytes);
  if (movie === null) return null;
  const audio = movie.audioTracks[0];
  const video = movie.videoTracks[0];
  return {
    durationS: movie.duration / movie.timescale,
    audioS: audio === undefined ? null : seconds(audio),
    heightPx: video?.video?.height ?? null,
    widthPx: video?.video?.width ?? null,
    brands: [...new Set(movie.brands)],
  };
}
