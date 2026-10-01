/** `probeVideo` on the committed synthetic media (`fixtures/talk/`): 3 s, 1280×720, no voice. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { probeVideo } from "./index.ts";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/talk",
);
const bytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(FIXTURES, name)));

describe("probeVideo", () => {
  it("reads the movie header's duration, the audio track's, the size and the brands", () => {
    expect(probeVideo(bytes("talk.mp4"))).toEqual({
      durationS: 3,
      audioS: 3.064,
      heightPx: 720,
      widthPx: 1280,
      brands: ["isom", "iso2", "avc1", "mp41"],
    });
  });

  it("reads an audio track that stops before the video", () => {
    expect(probeVideo(bytes("short-audio.mp4"))?.audioS).toBe(1.064);
  });

  it("reads a QuickTime file, with its `qt  ` brand and no audio track", () => {
    expect(probeVideo(bytes("talk.mov"))).toMatchObject({
      durationS: 3,
      audioS: null,
      brands: ["qt  "],
    });
  });

  it("is null for bytes that do not open with an ftyp box", () => {
    expect(probeVideo(bytes("one-slide.png"))).toBeNull();
    expect(probeVideo(new Uint8Array(3))).toBeNull();
  });

  it("reads a Node Buffer that is a view into a larger buffer, as readFileSync returns for small files", () => {
    const mov = bytes("talk.mov");
    const big = new Uint8Array(mov.length + 100);
    big.set(mov, 50);
    expect(probeVideo(Buffer.from(big.buffer, 50, mov.length))?.brands).toEqual(
      ["qt  "],
    );
  });

  it("is null for an ftyp box with no moov after it", () => {
    const ftyp = bytes("talk.mp4").slice(0, 32);
    expect(probeVideo(ftyp)).toBeNull();
  });

  it("has no size for a file without a video track", () => {
    expect(probeVideo(bytes("audio-only.mp4"))).toMatchObject({
      heightPx: null,
      widthPx: null,
    });
  });
});
