// The venue catalog: every shipped edition and family as the website lists them, built from the
// resolved presets (`resolveShipped`), so a reader that cannot import this package (paperlint.dev,
// built from site/ alone) reads one JSON file instead of re-implementing the preset merge.
// `scripts/venue-catalog.ts` writes it to presets/catalog.json; `src/venue-catalog.test.ts` fails
// when that file is not what this module builds. Pure.

import * as R from "remeda";
import { FIELD_TITLES, VENUE_FIELDS, type VenueField } from "./domain/venue-field.ts";
import type { Preset } from "./presets.ts";

/** One kind of paper an edition takes, and its page limits; null where the preset sets none. */
export interface CatalogKind {
  readonly kind: string;
  readonly pagesMax: number | null;
  readonly bodyPagesMax: number | null;
  readonly refPagesMax: number | null;
}

/** One shipped edition. */
export interface CatalogEdition {
  /** The preset id: `agent-2027`. */
  readonly id: string;
  /** The series, without a year: «AGENT». */
  readonly series: string;
  readonly year: number;
  /** The family preset id it builds on: `ieee-conference`. */
  readonly family: string;
  /** The family's `template_label`: «IEEE IEEEtran, conference». */
  readonly templateLabel: string;
  readonly blind: boolean;
  /** In the preset's order; empty for a minimal preset (the format only, no page limit). */
  readonly kinds: readonly CatalogKind[];
}

/** A conference, with the shipped workshops held at it. */
export interface CatalogConference extends CatalogEdition {
  readonly workshops: readonly CatalogEdition[];
}

export interface CatalogField {
  readonly field: VenueField;
  readonly title: string;
  readonly conferences: readonly CatalogConference[];
}

export interface CatalogFamily {
  readonly id: string;
  readonly templateLabel: string;
  /** «ACM» when any ACM conference may use this family; null for one venue's own template. */
  readonly anyConferenceOf: string | null;
}

/**
 * The whole catalog. Order is part of the contract: fields in `VENUE_FIELDS` order (a field with no
 * edition is left out), conferences and workshops by series A→Z then the newest year first,
 * families by id.
 */
export interface VenueCatalog {
  readonly fields: readonly CatalogField[];
  readonly families: readonly CatalogFamily[];
}

/** Why the shipped presets cannot make a catalog. */
const fail = (what: string): never => {
  throw new Error(`venue catalog: ${what}`);
};

/** The file name of a chain entry without its directory and extension: the preset id. */
const idOfFile = (file: string): string =>
  file.replace(/^.*[\\/]/, "").replace(/\.jsonc?$/, "");

const byEdition = <T extends Pick<CatalogEdition, "series" | "year">>(
  editions: readonly T[],
): readonly T[] =>
  R.sortBy(editions, [(e) => e.series, "asc"], [(e) => e.year, "desc"]);

/** The catalog of the resolved shipped presets. Throws, naming the preset, on a fact it lacks. */
export function venueCatalog(presets: readonly Preset[]): VenueCatalog {
  const families = R.sortBy(
    presets.flatMap((p) =>
      p.identity.type === "family"
        ? [
            {
              id: p.id,
              templateLabel:
                p.identity.templateLabel ??
                fail(`the family ${p.id} has no "template_label"`),
              anyConferenceOf: p.identity.anyConferenceOf,
            },
          ]
        : [],
    ),
    (f) => f.id,
  );
  const venues = presets.flatMap((p) =>
    p.identity.type === "venue" ? [{ preset: p, identity: p.identity }] : [],
  );
  const editionOf = (p: Preset): CatalogEdition => {
    const family =
      [...p.chain]
        .reverse()
        .map(idOfFile)
        .map((id) => families.find((f) => f.id === id))
        .find((f) => f !== undefined) ??
      fail(`${p.id} extends no family`);
    return {
      id: p.id,
      series: p.label,
      year: p.year ?? fail(`${p.id} has no edition year`),
      family: family.id,
      templateLabel: family.templateLabel,
      blind: p.blind,
      kinds: [...p.format.kinds].map(([kind, l]) => ({
        kind,
        pagesMax: l.pagesMax,
        bodyPagesMax: l.bodyPagesMax,
        refPagesMax: l.refPagesMax,
      })),
    };
  };
  const conferences = venues.filter((v) => v.preset.parentId === null);
  const workshops = venues.filter((v) => v.preset.parentId !== null);
  const orphan = workshops.find(
    (w) => !conferences.some((c) => c.preset.id === w.preset.parentId),
  );
  if (orphan !== undefined)
    fail(
      `the workshop ${orphan.preset.id} is held at ${String(orphan.preset.parentId)}, which is no shipped conference`,
    );
  const fields = VENUE_FIELDS.map((field) => ({
    field,
    title: FIELD_TITLES[field],
    conferences: byEdition(
      conferences
        .filter(
          (c) =>
            (c.identity.field ??
              fail(`the conference ${c.preset.id} has no "field"`)) === field,
        )
        .map((c) => ({
          ...editionOf(c.preset),
          workshops: byEdition(
            workshops
              .filter((w) => w.preset.parentId === c.preset.id)
              .map((w) => editionOf(w.preset)),
          ),
        })),
    ),
  })).filter((f) => f.conferences.length > 0);
  return { fields, families };
}

/** The catalog's file in the presets directory. */
export const CATALOG_FILE = "catalog.json";

/** The catalog as presets/catalog.json holds it: two-space JSON and a final newline. */
export const catalogText = (presets: readonly Preset[]): string =>
  `${JSON.stringify(venueCatalog(presets), null, 2)}\n`;
