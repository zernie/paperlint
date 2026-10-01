/** `captions`: the cues of an `.srt` file, their times in seconds. */
import { describe, expect, it } from "vitest";
import { captions } from "./index.ts";

describe("captions", () => {
  it("reads every cue's start and end", () => {
    const srt =
      "1\n00:00:00,000 --> 00:00:01,200\nA line.\n\n2\n00:01:01,400 --> 00:01:02,900\nAnother.\n";
    expect(captions(srt)).toEqual([
      { startS: 0, endS: 1.2 },
      { startS: 61.4, endS: 62.9 },
    ]);
  });

  it("reads Windows line endings", () => {
    expect(captions("1\r\n00:00:03,000 --> 00:00:04,000\r\nx\r\n")).toEqual([
      { startS: 3, endS: 4 },
    ]);
  });

  it("is empty for text that holds no cue", () => {
    expect(captions("not captions")).toEqual([]);
  });
});
