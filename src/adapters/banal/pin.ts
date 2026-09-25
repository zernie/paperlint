/**
 * The banal rpp runs: HotCRP at one commit, one file, one sha256. The licence boundary is in
 * `./index.ts`: rpp downloads and runs banal, it never contains it.
 */
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

/** Where to download banal from, and the bytes to accept. The pin by default; a test passes a local file. */
export interface BanalSource {
  readonly url: string;
  readonly sha256: Sha256;
}

export interface BanalPin extends BanalSource {
  readonly version: string;
  readonly commit: string;
}

/** Parsed at module load: a typo in the pin fails on import, not at the first download. */
export const BANAL_PIN: BanalPin = {
  version: "1.2",
  commit: "f3e4352133f3184c7c42b0d5e6501124bead18e6",
  url: "https://raw.githubusercontent.com/kohler/hotcrp/f3e4352133f3184c7c42b0d5e6501124bead18e6/src/banal",
  sha256: parseSha256(
    "fd8cc4ae189b9da02460ae442a34f14434e5784210489fb668313ac671006911",
  ),
};

/** How a person reads the pin: `banal 1.2 (HotCRP f3e4352)`. */
export const pinLabel = (pin: BanalPin = BANAL_PIN): string =>
  `banal ${pin.version} (HotCRP ${pin.commit.slice(0, 7)})`;
