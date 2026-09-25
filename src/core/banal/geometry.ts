/**
 * The page geometry of a paper, as the domain sees it: measured by a banal that was found, or not
 * measured and why. The facts file's flat schema-2 fields are DERIVED from this (`flatGeometry`),
 * so `geometry_source` and the nine columns always come from the same branch.
 */
import type { BanalFailure } from "./failure.ts";
import { describeLine } from "./failure.ts";
import { provenanceLabel, type BanalCandidate } from "./locate.ts";
import type { BanalGeometry } from "./output.ts";

export type Geometry =
  | {
      readonly source: "banal";
      readonly by: BanalCandidate;
      readonly geometry: BanalGeometry;
    }
  | {
      readonly source: "none";
      readonly why: BanalFailure;
      /** The banal that was run and failed; null when none was found. */
      readonly tried: BanalCandidate | null;
    };

/** Why there is no geometry, in one line — naming the banal that failed, when one ran. */
export function whyNoGeometry(
  g: Extract<Geometry, { source: "none" }>,
): string {
  const line = describeLine(g.why);
  return g.tried
    ? `${line} (banal from ${provenanceLabel(g.tried.provenance)}: ${g.tried.path})`
    : line;
}

/** The geometry columns with nothing measured: every one null. */
export type NullGeometry = { readonly [K in keyof BanalGeometry]: null };

/**
 * The flat schema-2 fields. `geometry_source` is tied to its branch: `"banal"` only beside measured
 * columns, null only beside nine nulls — the file cannot say "banal" over an empty measurement.
 */
export type FactsGeometryFields =
  | ({ readonly geometry_source: "banal" } & BanalGeometry)
  | ({ readonly geometry_source: null } & NullGeometry);

export const NO_GEOMETRY: NullGeometry = {
  page_w_in: null,
  page_h_in: null,
  columns: null,
  body_pt: null,
  ref_pt: null,
  body_pages: null,
  ref_pages: null,
  appendix_pages: null,
  pages_by_type: null,
};

/** The projection onto the file: one branch in, the matching fields out. */
export const flatGeometry = (g: Geometry): FactsGeometryFields =>
  g.source === "banal"
    ? { geometry_source: "banal", ...g.geometry }
    : { geometry_source: null, ...NO_GEOMETRY };
