/**
 * Where a banal may be, in order; which one is there; and which rule found it. The order:
 * `$BANAL` (an explicit choice — if it names nothing, there is NO fallback), `<project>/vendor/banal`
 * (a project that vendors its own copy), then the one `rpp toolchain` installed.
 */
import { join } from "node:path";
import type { Opaque } from "ts-essentials";
import type { AbsolutePath } from "../../domain/ports.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import { BANAL_PIN } from "./pin.ts";
import type { BanalSettings } from "./settings.ts";

export type Provenance =
  | { readonly kind: "env" }
  | { readonly kind: "vendor" }
  | { readonly kind: "cache" };

export interface BanalCandidate {
  readonly path: AbsolutePath;
  readonly provenance: Provenance;
}

/** A candidate the `Files` port confirmed is a file. Minted by `pickBanal` only. */
export type LocatedBanal = Opaque<BanalCandidate, "LocatedBanal">;

/**
 * `rpp toolchain`'s banal after its bytes hashed to the pin AND it measured the probe page. Minted by
 * `ensureBanal` / `checkBanal` only (`./index.ts`): a "ready" line cannot be printed without one.
 */
export type PinnedBanal = Opaque<BanalCandidate, "PinnedBanal">;

/** Why there is no banal to run. */
export type BanalMissing =
  /** `$BANAL` names a file that is not there. An explicit choice: no fallback to another banal. */
  | { readonly kind: "explicit-not-found"; readonly path: string }
  /** Nothing named, nothing vendored, and `rpp toolchain` has not installed it (here). */
  | { readonly kind: "not-installed"; readonly installed: string };

/** Where to look. An explicit `$BANAL` is the whole search; otherwise vendor, then the cache. */
export type LookupOrder =
  | { readonly kind: "explicit"; readonly path: AbsolutePath }
  | {
      readonly kind: "search";
      readonly vendor: AbsolutePath;
      readonly cache: AbsolutePath;
    };

/** Where `rpp toolchain` puts the pinned banal: one directory per HotCRP commit. */
export const installedBanal = (s: BanalSettings): AbsolutePath =>
  join(s.cacheDir, BANAL_PIN.commit.slice(0, 12), "banal") as AbsolutePath;

export function lookupOrder(
  s: BanalSettings,
  projectRoot: AbsolutePath,
): LookupOrder {
  if (s.explicit) return { kind: "explicit", path: s.explicit };
  return {
    kind: "search",
    vendor: join(projectRoot, "vendor", "banal") as AbsolutePath,
    cache: installedBanal(s),
  };
}

const located = (path: AbsolutePath, kind: Provenance["kind"]) =>
  ok({ path, provenance: { kind } } as LocatedBanal);

export function pickBanal(
  order: LookupOrder,
  isFile: (p: AbsolutePath) => boolean,
): Result<LocatedBanal, BanalMissing> {
  if (order.kind === "explicit")
    return isFile(order.path)
      ? located(order.path, "env")
      : err({ kind: "explicit-not-found", path: order.path });
  if (isFile(order.vendor)) return located(order.vendor, "vendor");
  if (isFile(order.cache)) return located(order.cache, "cache");
  return err({ kind: "not-installed", installed: order.cache });
}

/** Which rule found it, as a person reads it. */
export const provenanceLabel = (p: Provenance): string =>
  ({ env: "$BANAL", vendor: "vendor/banal", cache: "rpp toolchain" })[p.kind];
