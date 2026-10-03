/**
 * WHICH VENUE A NAME NAMES — a paper folder's name read as words, against what each venue is
 * called (a preset's label and its `aliases`).
 *
 * A name is compared by its WORDS, never by substring: `overrealm` and `realms` do not name REALM,
 * `aisec-2026` and `aisec2026` name AISec. A word is a run of letters or a run of digits; anything
 * else separates words, and case is ignored. A venue name of several words (`ACM CCS`) names the
 * venue only when those words stand in a row.
 *
 * Read by `paper/folder-venue-leftover` (a folder naming a venue other than the one the paper
 * extends) and by `paperlint new`, which refuses a new folder naming any venue at all.
 */

/** A venue as names know it: the word for it in messages, and the other names it goes by. */
export interface NamedVenue {
  readonly label: string;
  readonly aliases: readonly string[];
}

/** A venue a name names, and which of its names it used, as the venue spells it. */
export interface NamedIn {
  readonly venue: string;
  readonly name: string;
}

/** A name's words, lowercased: runs of letters and runs of digits; everything else separates. */
export const nameTokens = (name: string): readonly string[] =>
  name.toLowerCase().match(/\p{L}+|\p{N}+/gu) ?? [];

/** Where `words` stand in a row in `tokens`: the index of each first word. None for empty `words`. */
const placesIn = (
  tokens: readonly string[],
  words: readonly string[],
): readonly number[] =>
  words.length === 0
    ? []
    : tokens.flatMap((_, i) =>
        words.every((w, j) => tokens[i + j] === w) ? [i] : [],
      );

/** A name's words as one key, to compare two spellings of a name. */
const keyOf = (name: string): string => nameTokens(name).join(" ");

/** Every name of every venue that is not one of `own`, with its words. */
const candidates = (
  venues: readonly NamedVenue[],
  own: readonly string[],
): readonly (NamedIn & { readonly words: readonly string[] })[] => {
  const ownKeys = new Set(own.map(keyOf));
  return venues.flatMap((v) =>
    [v.label, ...v.aliases]
      .filter((n) => !ownKeys.has(keyOf(n)))
      .map((name) => ({ venue: v.label, name, words: nameTokens(name) })),
  );
};

/**
 * Each venue `name` names by one of its names (the label first, then its aliases), once per venue,
 * in the order `venues` lists them. A name that is also one of `own` — the paper's own venue's,
 * compared by words — is never counted: two workshops of one conference share its name.
 */
export function venuesNamedBy(
  name: string,
  venues: readonly NamedVenue[],
  own: readonly string[] = [],
): readonly NamedIn[] {
  const tokens = nameTokens(name);
  const hits = candidates(venues, own).filter(
    (c) => placesIn(tokens, c.words).length > 0,
  );
  return hits
    .filter((c, i) => hits.findIndex((d) => d.venue === c.venue) === i)
    .map(({ venue, name: n }) => ({ venue, name: n }));
}

/** A part of a name between separators, with the indices of its words in the whole name's words. */
interface Part {
  readonly text: string;
  readonly at: readonly number[];
}

/** A name's hyphen-, underscore- or dot-separated parts, each with where its words stand. */
const partsOf = (name: string): readonly Part[] =>
  name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((text) => text.length > 0)
    .reduce<{ readonly next: number; readonly out: readonly Part[] }>(
      (acc, text) => {
        const n = nameTokens(text).length;
        const at = Array.from({ length: n }, (_, j) => acc.next + j);
        return { next: acc.next + n, out: [...acc.out, { text, at }] };
      },
      { next: 0, out: [] },
    ).out;

/** The indices of the words of `name` that belong to a venue's name. */
const venueWordsIn = (
  name: string,
  venues: readonly NamedVenue[],
): ReadonlySet<number> => {
  const tokens = nameTokens(name);
  return new Set(
    candidates(venues, []).flatMap((c) =>
      placesIn(tokens, c.words).flatMap((at) => c.words.map((_, j) => at + j)),
    ),
  );
};

/**
 * `name` with every venue name taken out, as a name for the work — or null when that is not clean:
 * a venue's words glued to other words in one hyphen-, underscore- or dot-separated part
 * (`aisec2026`), or nothing but numbers left (`aisec-2026` → `2026` names no work). The parts left
 * are joined by `-`.
 */
export function withoutVenues(
  name: string,
  venues: readonly NamedVenue[],
): string | null {
  const venueWord = venueWordsIn(name, venues);
  const inVenue = (p: Part): number =>
    p.at.filter((i) => venueWord.has(i)).length;
  const parts = partsOf(name);
  if (parts.some((p) => inVenue(p) > 0 && inVenue(p) < p.at.length))
    return null;
  const left = parts.filter((p) => inVenue(p) === 0);
  return left.some((p) => /\p{L}/u.test(p.text))
    ? left.map((p) => p.text).join("-")
    : null;
}
