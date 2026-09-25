/**
 * A sha256 as a value: bytes hashed, or a digest written down as text and checked where it is
 * written. Tool-free — a pinned download, a facts file's `pdf_sha256` and a cache key all use it.
 */
import { createHash } from "node:crypto";
import type { Opaque } from "ts-essentials";

/** 64 lowercase hex digits. Minted by `parseSha256` (a literal) or `sha256Hex` (bytes) only. */
export type Sha256 = Opaque<string, "Sha256">;

const SHA256 = /^[0-9a-f]{64}$/;

/** A sha256 written down as text — a pin, an option — checked where it is written, not where it is used. */
export function parseSha256(s: string): Sha256 {
  if (!SHA256.test(s))
    throw new Error(`not a sha256 (64 lowercase hex digits): ${s}`);
  return s as Sha256;
}

export const sha256Hex = (bytes: Uint8Array): Sha256 =>
  createHash("sha256").update(bytes).digest("hex") as Sha256;
