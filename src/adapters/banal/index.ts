/**
 * banal's adapter — its ENTRY POINT. Everything under `src/adapters/banal/` exists because banal
 * (HotCRP's page-geometry script, GPL, run as a separate program — see `./run.ts` for the licence
 * boundary) exists; nothing outside this folder names it. What the rest of rpp sees is two ports:
 *
 *   `banalMeasurer` — `MeasureGeometry`: the page geometry of a paper's text boxes, or why none.
 *   `banalInstaller` — `ToolInstaller`: `rpp toolchain`'s banal, pinned, verified and running.
 *
 * Both are composites over the generic ports a composition root builds (processes, files, scratch
 * directories, downloads), so this file is pure; its settings are parsed from the environment value
 * the root read (`parseBanalSettings`).
 */
import type { Geometry, Provenance } from "../../domain/geometry.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import { err, ok } from "../../domain/result.ts";
import type { MeasureGeometry } from "../../ports/measure-geometry.ts";
import type { Ready, ToolInstaller } from "../../ports/tool-installer.ts";
import { describe } from "./failure.ts";
import { provenanceLabel, type BanalCandidate } from "./locate.ts";
import { pinLabel, type BanalSource } from "./pin.ts";
import {
  checkBanal,
  ensureBanal,
  measureGeometry,
  type BanalDeps,
  type Installed,
  type InstallDeps,
} from "./run.ts";
import type { BanalSettings } from "./settings.ts";

export {
  BANAL_DIR_ENV,
  BANAL_ENV,
  parseBanalSettings,
  type BanalSettings,
} from "./settings.ts";
export type { BanalDeps, InstallDeps } from "./run.ts";
export type { BanalSource } from "./pin.ts";

/** The domain's provenance for a banal: what the facts file writes, and which rule found it. */
const provenance = (c: BanalCandidate): Provenance => ({
  tool: "banal",
  path: c.path,
  how: provenanceLabel(c.provenance),
});

/** banal as the `MeasureGeometry` port: `$BANAL`, the project's `vendor/banal`, then the cache. */
export function banalMeasurer(
  d: BanalDeps,
  s: BanalSettings,
  projectRoot: AbsolutePath,
): MeasureGeometry {
  return {
    measure(pages): Geometry {
      const g = measureGeometry(d, s, projectRoot, pages);
      return g.source === "banal"
        ? { kind: "measured", by: provenance(g.by), geometry: g.geometry }
        : {
            kind: "unmeasured",
            why: describe(g.why),
            tried: g.tried ? provenance(g.tried) : null,
          };
    },
  };
}

/** The one place banal's `Ready` is minted: from an `Installed`, whose `PinnedBanal` only run.ts mints. */
const ready = (i: Installed): Ready =>
  ({
    where: i.banal.path as string,
    fresh: i.fresh,
    verified: "sha256 verified, and it measured a probe page",
  }) as Ready;

/**
 * banal as the `ToolInstaller` port: download at the pin, check the sha256, accept by measuring a
 * probe page. `source` is the pin unless a test passes a local file.
 */
export function banalInstaller(
  d: InstallDeps,
  s: BanalSettings,
  source?: BanalSource,
): ToolInstaller {
  return {
    label: pinLabel(),
    ensure(report) {
      const r = ensureBanal(d, s, {
        ...(source ? { source } : {}),
        onDownload: report,
      });
      return r.ok ? ok(ready(r.value)) : err(describe(r.error));
    },
    check() {
      const r = checkBanal(d, s, source);
      return r.ok
        ? ok(ready({ banal: r.value, fresh: false }))
        : err(describe(r.error));
    },
  };
}
