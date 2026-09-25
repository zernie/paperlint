/**
 * The install decisions, on bytes: is what is on disk the pin, and may downloaded bytes be kept.
 * One predicate for `rpp toolchain` and `rpp toolchain --check`, so the two cannot disagree.
 */
import type { Opaque } from "ts-essentials";
import { err, ok, type Result } from "../../domain/result.ts";
import { sha256Hex, type Sha256 } from "../../domain/sha256.ts";
import type { BanalSource } from "./pin.ts";

/** Bytes that hash to the pin. Minted by `verifyPin` only; the installer writes nothing else. */
export type PinnedBytes = Opaque<Uint8Array, "PinnedBytes">;

export interface ShaMismatch {
  readonly expected: Sha256;
  readonly got: Sha256;
}

export function verifyPin(
  bytes: Uint8Array,
  source: BanalSource,
): Result<PinnedBytes, ShaMismatch> {
  const got = sha256Hex(bytes);
  return got === source.sha256
    ? ok(bytes as PinnedBytes)
    : err({ expected: source.sha256, got });
}

/** What is installed, judged against the pin. */
export type InstalledState =
  | { readonly kind: "absent" }
  | { readonly kind: "other-bytes"; readonly mismatch: ShaMismatch }
  | { readonly kind: "pinned" };

export function installedState(
  current: Uint8Array | null,
  source: BanalSource,
): InstalledState {
  if (current === null) return { kind: "absent" };
  const v = verifyPin(current, source);
  return v.ok ? { kind: "pinned" } : { kind: "other-bytes", mismatch: v.error };
}
