/**
 * The banal paperlint runs: HotCRP at one commit, one file, one sha256. The licence boundary is in
 * `./index.ts`: paperlint downloads and runs banal, it never contains it.
 */
import { parseSha256, type Sha256 } from "../../domain/sha256.ts";

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
