/** `imageSize`: the PNG header's width and height, or null for anything that is not a PNG. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { imageSize } from "./index.ts";

const png = new Uint8Array(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../fixtures/talk/one-slide.png",
    ),
  ),
);

describe("imageSize", () => {
  it("reads the IHDR width and height", () => {
    expect(imageSize(png)).toEqual({ width: 16, height: 9 });
  });

  it("reads a size above 65 535 (four bytes, big-endian)", () => {
    const big = png.slice();
    big.set([0, 1, 0, 0], 16);
    expect(imageSize(big)).toEqual({ width: 65_536, height: 9 });
  });

  it("is null for bytes too short to hold the header", () => {
    expect(imageSize(png.slice(0, 20))).toBeNull();
  });

  it("is null without the PNG signature", () => {
    const jpeg = png.slice();
    jpeg.set([0xff, 0xd8], 0);
    expect(imageSize(jpeg)).toBeNull();
  });

  it("is null when the first chunk is not IHDR", () => {
    const odd = png.slice();
    odd.set(new TextEncoder().encode("IDAT"), 12);
    expect(imageSize(odd)).toBeNull();
  });
});
