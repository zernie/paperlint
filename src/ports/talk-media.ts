/**
 * Reading a talk's files: what the talk rules need to know about a video, an image and captions.
 * Shaped by the questions the rules ask, not by any tool: the adapters behind it are MP4Box.js,
 * a PNG header reader and an SRT parser (`src/adapters/`).
 */
import type { AbsolutePath } from "../domain/paths.ts";
import type { Cue, PixelSize, VideoProbe } from "../domain/talk.ts";

export interface TalkMedia {
  /** The video's durations, size and brands; null when the bytes are not an ISO media file. */
  probeVideo(bytes: Uint8Array): VideoProbe | null;
  /** The image's size; null when the bytes are not a PNG. */
  imageSize(bytes: Uint8Array): PixelSize | null;
  /** The cues of a captions file, in file order; empty when it holds none. */
  captions(text: string): readonly Cue[];
}

/** The names in a directory; empty when there is no such directory. */
export type ListDir = (dir: AbsolutePath) => readonly string[];
