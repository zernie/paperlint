/**
 * The PNG format as the image half of the `TalkMedia` port: an image's size, from its header.
 *
 * A PNG opens with an eight-byte signature and then the `IHDR` chunk, whose first eight data bytes
 * are the width and the height as big-endian unsigned integers (PNG specification, 11.2.2). That is
 * the whole of what is read; the pixels are never decoded.
 */
import type { PixelSize } from "../../domain/talk.ts";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Where the `IHDR` chunk's type and its width and height sit: after the signature and the length. */
const IHDR_TYPE_AT = 12;
const WIDTH_AT = 16;
const HEIGHT_AT = 20;

/** The bytes of an image → its size; null when they are not a PNG. */
export function imageSize(bytes: Uint8Array): PixelSize | null {
  if (bytes.length < HEIGHT_AT + 4) return null;
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const type = new TextDecoder("latin1").decode(
    bytes.subarray(IHDR_TYPE_AT, IHDR_TYPE_AT + 4),
  );
  if (type !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(WIDTH_AT),
    height: view.getUint32(HEIGHT_AT),
  };
}
