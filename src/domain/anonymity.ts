/**
 * WHO WROTE THIS PAPER, FOUND IN THE PAPER — the matching `anonymity/identity` judges a blind submission
 * by. A rule cannot know who the author is, so the author DECLARES it (`identity` in
 * `paperlint.json`); given that list, finding it is mechanical, and this module is the mechanism.
 *
 * ── WHAT A MATCH TOLERATES, AND WHY EACH ─────────────────────────────────────────
 * PDF text is not the source text. pdf.js hands back runs of glyphs, and the same name comes out
 * in several spellings of the same letters:
 *
 *   ligatures        `ﬁ` for `fi`                    → both sides NFKC-normalized
 *   case             `ADA EXAMPLE` in small caps       → Unicode case folding (the `iu` flags: no
 *                                                         locale is consulted, Cyrillic folds too)
 *   kerning splits   `Ex` `ample` as two items         → the page text joins items without a space
 *   letter-spacing   `A d a  E x a m p l e`            → whitespace may stand between any two letters
 *   line breaks      `Ada` ⏎ `Example`, `Exam-` ⏎ `ple` → so may a hyphen and a line break
 *   soft hyphens     U+00AD inside a word              → treated like a hyphen
 *   a reference list `A. Example`, `Example, A.`       → a personal name's bibliographic forms
 *                                                         are searched too (`spellingsOf`)
 *
 * Only the ENDS of a token are anchored: the letter or digit before its first character and after
 * its last must be absent, so `Ada` does not match inside `Canada`. Between its characters anything
 * of the above may stand. The token's own spaces and hyphens are separators too, so
 * `Ada Example` also finds `Ada-Example` and `AdaExample` — the same person.
 */

/** Where a declared string was found: a page's text, a metadata field, or a link's target. */
export type LeakPlace =
  | { readonly kind: "page"; readonly page: number }
  | { readonly kind: "metadata"; readonly field: string }
  | { readonly kind: "link"; readonly page: number; readonly uri: string };

/** One text to search, and where it came from. */
export interface Searchable {
  readonly place: LeakPlace;
  readonly text: string;
}

/** One declared string found in one place, with the text it matched as it stands there. */
export interface Leak {
  readonly token: string;
  readonly place: LeakPlace;
  readonly found: string;
}

/** What may stand between two characters of a token: whitespace, hyphens, soft hyphens. */
const SEPARATOR = "[\\s\\u00AD-]*";
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

/** `c` as a pattern that matches it literally. */
const literal = (c: string): string =>
  c.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");

/** The characters of a token that must appear: NFKC, without its own separators. */
const lettersOf = (token: string): readonly string[] =>
  token
    .normalize("NFKC")
    .replace(/[\s\u00AD-]/gu, "")
    .match(/./gsu) ?? [];

/** A word of a personal name: letters, with an apostrophe or a hyphen inside. */
const NAME_WORD = /^\p{Lu}[\p{L}'’-]*$/u;

/**
 * The spellings a bibliography gives a personal name, besides the name itself. A token of two to
 * four capitalized words (`Ada Example`, `Ada B. Example` is not one: an initial is not a word)
 * is read as given names and a surname, and the reference list's forms are added: initials
 * (`A. Example`), surname first (`Example, Ada`, `Example, A.`). A token that is not a name — a
 * handle, an address, one word — has only itself.
 */
export function spellingsOf(token: string): readonly string[] {
  const words = token.trim().split(/\s+/u);
  if (
    words.length < 2 ||
    words.length > 4 ||
    !words.every((w) => NAME_WORD.test(w))
  )
    return [token];
  const surname = words.slice(-1).join("");
  const given = words.slice(0, -1);
  const initials = given.map((w) => `${w.slice(0, 1)}.`).join(" ");
  return [
    token,
    `${initials} ${surname}`,
    `${surname}, ${given.join(" ")}`,
    `${surname}, ${initials}`,
  ];
}

/** One spelling as a pattern body: its characters, separators allowed between any two. */
const bodyOf = (spelling: string): string =>
  lettersOf(spelling).map(literal).join(SEPARATOR);

/**
 * A declared token as the pattern that finds it and its bibliographic spellings (see the module
 * header), or null for a token with nothing but separators in it — which would match everywhere,
 * and is refused where it is read.
 */
export function tokenPattern(token: string): Readonly<RegExp> | null {
  if (lettersOf(token).length === 0) return null;
  const bodies = spellingsOf(token).map(bodyOf).join("|");
  return new RegExp(`${BEFORE}(?:${bodies})${AFTER}`, "iu");
}

/**
 * Every token found in the sources, once per place: its first match there. Two tokens that match
 * the same text in the same place (`Ada Example` and `adaexample` both finding `AdaExample`) are one
 * leak, reported under the first token declared. Pure.
 */
export function findLeaks(
  tokens: readonly string[],
  sources: readonly Searchable[],
): readonly Leak[] {
  const patterns = tokens.flatMap((token) => {
    const re = tokenPattern(token);
    return re === null ? [] : [{ token, re }];
  });
  return sources.flatMap((s) => {
    const text = s.text.normalize("NFKC");
    const leaks = patterns.flatMap(({ token, re }) => {
      const m = re.exec(text);
      return m === null ? [] : [{ token, place: s.place, found: m[0] }];
    });
    const key = (l: Leak): string => l.found.toLowerCase();
    return leaks.filter(
      (l, i) => leaks.findIndex((x) => key(x) === key(l)) === i,
    );
  });
}
