/**
 * A paper's page geometry, as the domain sees it — measured by some measurer, or not measured and
 * why — with no tool named. The facts file's flat schema-2 fields are DERIVED from it
 * (`flatGeometry`), so `geometry_source` and the nine columns always come from the same branch.
 */
import type { Lines } from "./text.ts";

/** What a page-geometry measurer found, in the domain's field names. */
export interface PageGeometry {
  readonly pageWidthIn: number | null;
  readonly pageHeightIn: number | null;
  readonly columns: number | null;
  readonly bodyPt: number | null;
  readonly refPt: number | null;
  readonly bodyPages: number;
  readonly refPages: number;
  readonly appendixPages: number;
  readonly pagesByType: Readonly<Record<string, number>>;
}

/**
 * Who measured: `tool` is what the facts file writes as `geometry_source`, `path` the program that
 * ran, `how` which rule found it, in the adapter's words. Only a measurer's adapter builds one.
 */
export interface Provenance {
  readonly tool: string;
  readonly path: string;
  readonly how: string;
}

export type Geometry =
  | {
      readonly kind: "measured";
      readonly by: Provenance;
      readonly geometry: PageGeometry;
    }
  | {
      readonly kind: "unmeasured";
      readonly why: Lines;
      /** The measurer that was run and failed; null when none was found. */
      readonly tried: Provenance | null;
    };

/** Why there is no geometry, in one line — naming the measurer that failed, when one ran. */
export function whyNoGeometry(
  g: Extract<Geometry, { kind: "unmeasured" }>,
): string {
  const line = g.why.join("; ");
  return g.tried
    ? `${line} (${g.tried.tool} from ${g.tried.how}: ${g.tried.path})`
    : line;
}

/** The geometry columns as the facts file spells them. */
export interface FlatGeometry {
  readonly page_w_in: number | null;
  readonly page_h_in: number | null;
  readonly columns: number | null;
  readonly body_pt: number | null;
  readonly ref_pt: number | null;
  readonly body_pages: number;
  readonly ref_pages: number;
  readonly appendix_pages: number;
  readonly pages_by_type: Readonly<Record<string, number>>;
}

/** The geometry columns with nothing measured: every one null. */
export type NullGeometry = { readonly [K in keyof FlatGeometry]: null };

/**
 * The flat schema-2 fields. `geometry_source` is tied to its branch: a measurer's name only beside
 * measured columns, null only beside nine nulls — the file cannot name a measurer over an empty
 * measurement.
 */
export type FactsGeometryFields =
  | ({ readonly geometry_source: string } & FlatGeometry)
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

/** The ONE place the domain's names become the file's: camelCase in, schema-2 snake_case out. */
const flat = (g: PageGeometry): FlatGeometry => ({
  page_w_in: g.pageWidthIn,
  page_h_in: g.pageHeightIn,
  columns: g.columns,
  body_pt: g.bodyPt,
  ref_pt: g.refPt,
  body_pages: g.bodyPages,
  ref_pages: g.refPages,
  appendix_pages: g.appendixPages,
  pages_by_type: g.pagesByType,
});

/** The projection onto the file: one branch in, the matching fields out. */
export const flatGeometry = (g: Geometry): FactsGeometryFields =>
  g.kind === "measured"
    ? { geometry_source: g.by.tool, ...flat(g.geometry) }
    : { geometry_source: null, ...NO_GEOMETRY };
