/**
 * ONE PRESET PER EDITION — what a preset's id says about it.
 *
 * A venue preset is one edition of a series, and its id says which: `<series>-<year>`, the year in
 * four digits after the last hyphen (`icse-2028`, `nlbse-2027`, `usenix-sec-2027`). The year has one
 * source, this id: a venue's `name` carries none (`ICSE`), and a display that needs the year is the
 * name and the id's year (`ICSE 2028`). A template family is a format, not an edition, so its id
 * ends in no year (`acm-sigconf`, `ieee-conference`).
 *
 * A bare series (`paperlint:icse`) is never an alias for the latest edition: a paper that names one
 * would have its rules change under it the day a new edition ships. It is refused, listing the
 * editions (`src/presets.ts`).
 */
import { sortBy } from "remeda";

/** A series: lowercase words and digits joined by hyphens (`icse`, `usenix-sec`). */
const SERIES = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** A venue preset's id: a series, then `-<year>`. */
export const EDITION_ID = new RegExp(`^(${SERIES})-(\\d{4})$`, "u");

/** A series id's shape, the part of an edition's id before its year; whether it ends in a year is `endsInYear`. */
export const SERIES_ID = new RegExp(`^${SERIES}$`, "u");

/** An edition: its series and its year. */
export interface Edition {
  readonly series: string;
  readonly year: number;
}

/** The edition an id names, or null when the id ends in no year (a family, or a file of one's own). Pure. */
export function editionOf(id: string): Edition | null {
  const m = EDITION_ID.exec(id);
  return m === null
    ? null
    : { series: String(m[1]), year: Number.parseInt(String(m[2]), 10) };
}

/** Whether `id` ends in a year, as a family's id must not: `-2027`, or `2027` glued on. Pure. */
export const endsInYear = (id: string): boolean => /\d{4}$/u.test(id);

/** A venue's name with its edition's year, `ICSE 2028`; the bare name when the year is not known. Pure. */
export const editionLabel = (name: string, year: number | null): string =>
  year === null ? name : `${name} ${String(year)}`;

/**
 * The shipped editions of `series`, oldest first, as ids (`icse-2027`, `icse-2028`): what a bare
 * series spec is refused with. Pure.
 */
export const editionsOf = (
  series: string,
  shipped: readonly string[],
): readonly string[] => editionsWithIds(series, shipped).map((e) => e.id);

/** The shipped editions of `series` after `e`'s year, oldest first, as ids. Pure. */
export const newerEditions = (
  e: Edition,
  shipped: readonly string[],
): readonly string[] =>
  editionsWithIds(e.series, shipped)
    .filter((x) => x.year > e.year)
    .map((x) => x.id);

/** Each shipped edition of `series` with its id, oldest first. Pure. */
const editionsWithIds = (
  series: string,
  shipped: readonly string[],
): readonly (Edition & { readonly id: string })[] =>
  sortBy(
    shipped.flatMap((id) => {
      const e = editionOf(id);
      return e !== null && e.series === series ? [{ ...e, id }] : [];
    }),
    (e) => e.year,
  );

/**
 * Why a shipped preset's id does not fit what the file declares itself to be, or null: a venue's id
 * is `<series>-<year>`, a family's ends in no year. Pure.
 */
export function idProblem(
  id: string,
  type: "venue" | "family" | "base",
): string | null {
  if (type === "venue" && editionOf(id) === null)
    return `${id}: a venue preset is one edition, and its id is <series>-<year> (icse-2028)`;
  if (type === "family" && endsInYear(id))
    return `${id}: a template family is a format, not an edition, and its id ends in no year`;
  return null;
}

/**
 * Each deadline of the edition `year` that falls outside [year − 2, year + 1], as a line naming it.
 * An edition's dates fall in the two years before it and the year it is held, and its camera-ready
 * may follow it: anything else is a reading of another edition. Pure.
 */
export const deadlineYearProblems = (
  id: string,
  year: number,
  deadlines: readonly { readonly what: string; readonly at: string }[],
): readonly string[] =>
  deadlines
    .filter((d) => {
      const y = Number.parseInt(d.at.slice(0, 4), 10);
      return y < year - 2 || y > year + 1;
    })
    .map(
      (d) =>
        `${id}: the ${d.what} deadline ${d.at} is outside ${String(year - 2)}–${String(year + 1)}, the years an edition of ${String(year)} falls in`,
    );
