/**
 * Where a banal may be, in order; which one is there; and which rule found it. The order:
 * `$BANAL` (an explicit choice — if it names nothing, there is NO fallback), `<project>/vendor/banal`
 * (a project that vendors its own copy), then the one `paperlint toolchain` installed.
 */
import { joinPath, type AbsolutePath } from "../../domain/paths.ts";
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

// Not exported: only this module can write the property, so only `locate` can make a LocatedBanal.
const LOCATED = Symbol("LocatedBanal");

/** A candidate the `Files` port confirmed is a file. Minted by `pickBanal` (through `locate`) only. */
export type LocatedBanal = BanalCandidate & { readonly [LOCATED]: true };

/** `path` as a banal to run — when the `Files` port says it is a file, else null. */
function locate(
  path: AbsolutePath,
  kind: Provenance["kind"],
  isFile: (p: AbsolutePath) => boolean,
): LocatedBanal | null {
  return isFile(path) ? { path, provenance: { kind }, [LOCATED]: true } : null;
}

/** Why there is no banal to run. */
export type BanalMissing =
  /** `$BANAL` names a file that is not there. An explicit choice: no fallback to another banal. */
  | { readonly kind: "explicit-not-found"; readonly path: string }
  /** Nothing named, nothing vendored, and `paperlint toolchain` has not installed it (here). */
  | { readonly kind: "not-installed"; readonly installed: string };

/** Where to look. An explicit `$BANAL` is the whole search; otherwise vendor, then the cache. */
export type LookupOrder =
  | { readonly kind: "explicit"; readonly path: AbsolutePath }
  | {
      readonly kind: "search";
      readonly vendor: AbsolutePath;
      readonly cache: AbsolutePath;
    };

/** Where `paperlint toolchain` puts the pinned banal: one directory per HotCRP commit. */
export const installedBanal = (s: BanalSettings): AbsolutePath =>
  joinPath(s.cacheDir, BANAL_PIN.commit.slice(0, 12), "banal");

export function lookupOrder(
  s: BanalSettings,
  projectRoot: AbsolutePath,
): LookupOrder {
  if (s.explicit) return { kind: "explicit", path: s.explicit };
  return {
    kind: "search",
    vendor: joinPath(projectRoot, "vendor", "banal"),
    cache: installedBanal(s),
  };
}

export function pickBanal(
  order: LookupOrder,
  isFile: (p: AbsolutePath) => boolean,
): Result<LocatedBanal, BanalMissing> {
  if (order.kind === "explicit") {
    const own = locate(order.path, "env", isFile);
    return own
      ? ok(own)
      : err({ kind: "explicit-not-found", path: order.path });
  }
  const found =
    locate(order.vendor, "vendor", isFile) ??
    locate(order.cache, "cache", isFile);
  return found
    ? ok(found)
    : err({ kind: "not-installed", installed: order.cache });
}

/** Which rule found it, as a person reads it. */
export const provenanceLabel = (p: Provenance): string =>
  ({ env: "$BANAL", vendor: "vendor/banal", cache: "paperlint toolchain" })[
    p.kind
  ];
