/**
 * SubRip (`.srt`) captions as the captions half of the `TalkMedia` port, through `srt-parser-2`
 * (MIT, no dependencies). Only the timing of each cue is kept: the rules judge coverage, not words.
 */
import Parser from "srt-parser-2";
import type { Cue } from "../../domain/talk.ts";

/** The text of an `.srt` file → its cues in file order; empty when it holds none. */
export function captions(text: string): readonly Cue[] {
  return new Parser()
    .fromSrt(text)
    .map((line) => ({ startS: line.startSeconds, endS: line.endSeconds }));
}
