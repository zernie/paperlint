// The venues paperlint ships, grouped by field, read from docs/venues.md › "What paperlint ships" at
// build time. Its "Editions, by field" tables say which edition belongs to which field and which
// conference a workshop is held at; the README's venue table adds the format and page limits of the
// editions it lists, and the families table the template of the rest. Every reader throws when the
// text it looks for is gone or reshaped.

import * as R from "remeda";
import { fail, tableAfter, type Venue } from "./content.ts";

/** One shipped edition, as the venue grid shows it. */
export interface Edition {
  /** The preset id without its prefix: `agent-2027`. */
  readonly id: string;
  /** The series and the year: «AGENT 2027». */
  readonly name: string;
  /** The series of the conference a workshop is held at: «ICSE»; none for a conference. */
  readonly parent?: string;
  readonly format: string;
  readonly limits: string;
}

/** One field of docs/venues.md and its editions, in the doc's order. */
export interface VenueField {
  readonly field: string;
  readonly editions: readonly Edition[];
}

/** The grid: the fields, and the organisations whose template alone is a preset (ACM, IEEE, ACL). */
export interface VenueGrid {
  readonly fields: readonly VenueField[];
  readonly families: readonly string[];
}

const PREFIX = "paperlint:";

/** `paperlint:agent-2027` → `agent-2027`; anything else is a reshaped table. */
const presetId = (cell: string): string =>
  cell.startsWith(PREFIX)
    ? cell.slice(PREFIX.length)
    : fail(`"${cell}" is not a paperlint: preset id`);

/** The edition's year, from its id: `agent-2027` → «2027». */
const yearOf = (id: string): string =>
  /-(\d{4})$/.exec(id)?.[1] ?? fail(`"${id}" has no edition year`);

/** A preset file's `"name"`: the series, without a year. */
export const presetName = (jsonc: string): string =>
  /^\s*"name":\s*"([^"]+)"/m.exec(jsonc)?.[1] ??
  fail('a preset with no "name"');

/** The text from `anchor` up to the next heading of the same level or above, or the end. */
const sectionAt = (text: string, anchor: string): string => {
  const at = text.indexOf(anchor);
  const rest = at === -1 ? fail(`no "${anchor}"`) : text.slice(at);
  const end = rest.slice(anchor.length).search(/^#{1,3} /m);
  return end === -1 ? rest : rest.slice(0, anchor.length + end);
};

/** «ACM, IEEE or ACL». */
export const orList = (names: readonly string[]): string =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} or ${names.slice(-1).join("")}`;

/**
 * The fields of docs/venues.md's "Editions, by field", each a bold line alone and its table; a field
 * with no table yet («none shipped yet») is left out. `nameOf` reads a preset's series from its file.
 */
export const venueGrid = (
  venuesDoc: string,
  readme: readonly Venue[],
  nameOf: (id: string) => string,
): VenueGrid => {
  const families = tableAfter(venuesDoc, "### Families").map(
    ([id = "", template = ""]) => ({ id, template }),
  );
  const section = sectionAt(venuesDoc, "### Editions, by field");
  const heads = [...section.matchAll(/^\*\*[^*\n]+\*\*$/gm)];
  const fields = heads.map((head, i) => {
    const body = section.slice(head.index, heads[i + 1]?.index);
    const field = head[0].slice(2, -2);
    const editions = tableAfter(body, head[0]).map(
      ([edition = "", parent = "", family = "", checked = ""]): Edition => {
        const id = presetId(edition);
        const listed = readme.find((v) => v.preset === edition);
        const template =
          families.find((f) => f.id === family)?.template ??
          fail(`"${edition}" names an unknown family "${family}"`);
        return {
          id,
          name: `${nameOf(id)} ${yearOf(id)}`,
          ...(parent === "—" ? {} : { parent: nameOf(presetId(parent)) }),
          format: listed?.format ?? template,
          limits: listed?.limits ?? `Checked: ${checked}.`,
        };
      },
    );
    return { field, editions };
  });
  const orgs = R.unique(
    families.flatMap(
      (f) => /^([A-Z]{2,})(?:'s)?\s/.exec(f.template)?.slice(1, 2) ?? [],
    ),
  );
  return {
    fields: fields.length > 0 ? fields : fail("no field in docs/venues.md"),
    families: orgs.length > 0 ? orgs : fail("no ACM, IEEE or ACL family"),
  };
};
