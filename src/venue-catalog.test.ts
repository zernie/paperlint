/**
 * The venue catalog, both halves: the shipped presets make the committed presets/catalog.json byte
 * for byte, and a planted preset that lacks a fact the site shows (a conference's field, a family's
 * label, a workshop's conference) throws instead of writing a catalog with a hole.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryFiles } from "./adapters/memory/index.ts";
import { VENUE_FIELDS } from "./domain/venue-field.ts";
import { presetsDir } from "./package-dirs.ts";
import { resolveShipped } from "./presets.ts";
import { parsePreset } from "./tex-requirements.ts";
import {
  CATALOG_FILE,
  catalogText,
  venueCatalog,
  type CatalogConference,
} from "./venue-catalog.ts";

const VENUES = presetsDir();
const shipped: Readonly<Record<string, string>> = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f), "utf8")]),
);
const at = (id: string): string => join(VENUES, `${id}.jsonc`);
/** The shipped presets with `edits` applied to the text of the named files. */
const presetsWith = (
  edits: Readonly<Record<string, (text: string) => string>>,
) =>
  resolveShipped({
    files: memoryFiles({
      ...shipped,
      ...Object.fromEntries(
        Object.entries(edits).map(([id, edit]) => [
          at(id),
          edit(String(shipped[at(id)])),
        ]),
      ),
    }),
    venuesDir: VENUES,
  });

/** Each workshop's id beside the id of the conference it is held at. */
const heldAt = (c: CatalogConference): readonly (readonly [string, string])[] =>
  c.workshops.map((w) => [w.id, c.id] as const);

describe("presets/catalog.json", () => {
  it("is what the shipped presets make (npm run catalog writes it)", () => {
    // Guards: the site reads a catalog that matches the presets it describes.
    expect(String(shipped[join(VENUES, CATALOG_FILE)])).toBe(
      catalogText(presetsWith({})),
    );
  });

  it("🔴 planted: a preset changed after the catalog was written makes it stale", () => {
    const edited = catalogText(
      presetsWith({
        "fse-2027": (t) =>
          t.replace('"field": "software-engineering"', '"field": "security"'),
      }),
    );
    // Guards: the freshness check above can fail at all.
    expect(edited).not.toBe(String(shipped[join(VENUES, CATALOG_FILE)]));
  });

  it("groups the real editions by field, workshops under their conference", () => {
    const catalog = venueCatalog(presetsWith({}));
    // Guards: the grid's structure, not today's list: every field a known one, in VENUE_FIELDS order.
    const named = new Set(catalog.fields.map((f) => f.field));
    expect(catalog.fields.map((f) => f.field)).toEqual(
      VENUE_FIELDS.filter((f) => named.has(f)),
    );
    const conferences = catalog.fields.flatMap((f) => f.conferences);
    const workshops = conferences.flatMap(heldAt);
    expect(workshops).toContainEqual(["agenticdev-2026", "ase-2026"]);
    expect(
      catalog.families
        .filter((f) => f.anyConferenceOf !== null)
        .map((f) => f.anyConferenceOf),
    ).toEqual(expect.arrayContaining(["ACM", "IEEE", "ACL"]));
  });

  it("orders conferences by series A→Z, the newest year first", () => {
    const se = venueCatalog(presetsWith({})).fields.find(
      (f) => f.field === "software-engineering",
    );
    const order = (se?.conferences ?? []).map((c) => [c.series, c.year]);
    // Guards: the order the site shows is the data's, not a directory listing's.
    expect(order).toEqual(
      [...order].sort((a, b) =>
        a[0] === b[0]
          ? Number(b[1]) - Number(a[1])
          : String(a[0]).localeCompare(String(b[0])),
      ),
    );
  });
});

describe("a preset that lacks what the catalog shows", () => {
  it("🔴 a conference with no field throws, naming it", () => {
    expect(() =>
      venueCatalog(
        presetsWith({
          "msr-2027": (t) =>
            t.replace('  "field": "software-engineering",\n', ""),
        }),
      ),
    ).toThrow('the conference msr-2027 has no "field"');
  });

  it("🔴 a family with no template_label throws, naming it", () => {
    expect(() =>
      venueCatalog(
        presetsWith({
          "icml-style": (t) =>
            t.replace(/ {2}"template_label": "[^"\n]*",\n/, ""),
        }),
      ),
    ).toThrow('the family icml-style has no "template_label"');
  });

  it("🔴 a workshop whose conference is not shipped throws", () => {
    const presets = presetsWith({});
    const withoutAse = presets.filter((p) => p.id !== "ase-2026");
    expect(() => venueCatalog(withoutAse)).toThrow(
      "the workshop agenticdev-2026 is held at ase-2026, which is no shipped conference",
    );
  });
});

describe("the schema holds the new keys where they belong", () => {
  const venue = (extra: Record<string, unknown>) =>
    JSON.stringify({
      type: "venue",
      name: "Our Workshop",
      url: "https://example.org/cfp",
      extends: "paperlint:acm-sigconf",
      ...extra,
    });

  it("a conference may name a field, and it is read", () => {
    expect(parsePreset(venue({ field: "nlp" }), "ours.jsonc").identity).toEqual(
      {
        type: "venue",
        name: "Our Workshop",
        url: "https://example.org/cfp",
        field: "nlp",
      },
    );
  });

  it("🔴 a field outside the list, a field on a workshop, and a family key on a venue are refused", () => {
    expect(() => parsePreset(venue({ field: "hci" }), "a.jsonc")).toThrow(
      /does not match/,
    );
    expect(() =>
      parsePreset(
        venue({ field: "nlp", workshop: true, parent: "paperlint:ase-2026" }),
        "b.jsonc",
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parsePreset(venue({ any_conference_of: "ACM" }), "c.jsonc"),
    ).toThrow(/does not match/);
  });

  it("🔴 a field on a family is refused", () => {
    expect(() =>
      parsePreset(
        JSON.stringify({
          type: "family",
          extends: "paperlint:acm-sigconf",
          field: "nlp",
        }),
        "d.jsonc",
      ),
    ).toThrow(/does not match/);
  });

  it("the schema's field enum is VENUE_FIELDS", () => {
    const schema = z
      .object({
        properties: z.object({
          field: z.object({ enum: z.array(z.string()) }),
        }),
      })
      .parse(
        JSON.parse(String(shipped[join(VENUES, "venue-profile.schema.json")])),
      );
    // Guards: the two lists of fields cannot drift apart.
    expect(schema.properties.field.enum).toEqual(VENUE_FIELDS);
  });
});
