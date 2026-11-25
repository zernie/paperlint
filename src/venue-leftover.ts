/**
 * `tex/venue-leftover`'s judge: where the rendered text names another shipped venue than the
 * paper's edition. Pure; the rule module (`tex-venue-rules.ts`) reads the paper and the presets and
 * hands them here.
 *
 * Where it reads (#552): the commands that state the paper's venue (`\acmConference` …) wherever
 * they stand, and of the other prose what the rule's `body` option says. A leftover from an earlier
 * submission sits in the front matter — the author block, the title-page footnotes, the abstract —
 * so that is read always; the body, where related work names venues and recent years on every page,
 * only when `body` is set. The front matter ends where the first `\section` begins; a paper with no
 * section is all front matter.
 */
import { z } from "zod";
import {
  runText,
  spanIn,
  type Outline,
  type Place,
  type Span,
  type TextRun,
} from "./domain/tex-document.ts";
import { editionLabel } from "./domain/edition.ts";
import type { NamedVenue } from "./domain/venue-name.ts";
import type { Preset } from "./presets.ts";
import type { Located } from "./tex-venue-rules.ts";

/** Where the front matter ends: at the first section heading, or null when the paper has none. */
export function frontMatterEnd(outline: Outline): number | null {
  const first = outline.sections[0]?.place;
  return first?.kind === "at" ? first.span.start : null;
}

/** The rule's options as its `meta.schema` declares them to ESLint. */
export const LEFTOVER_SCHEMA = [
  {
    type: "object",
    properties: { body: { type: "boolean" } },
    additionalProperties: false,
  },
] as const;

/** The same options, parsed: none, or `{ body }`. */
const LeftoverOptions = z.union([
  z.tuple([]),
  z.tuple([z.object({ body: z.boolean().optional() }).strict()]),
]);

/** Of a name found at `at` (null: the parser gave it no place): is it in a venue line, is it read. */
export interface LeftoverPlaces {
  readonly inLine: (at: Span | null) => boolean;
  readonly read: (at: Span | null) => boolean;
}

/**
 * The places of one paper: `lines` are its venue-stating commands; prose is read in the front
 * matter, or anywhere when `body` is set. A name with no place is read only when everything is.
 */
export function leftoverPlaces(
  lines: readonly Place[],
  outline: Outline,
  options: readonly unknown[],
): LeftoverPlaces {
  const body = LeftoverOptions.parse(options)[0]?.body ?? false;
  const end = frontMatterEnd(outline);
  return {
    inLine: (at) =>
      at !== null &&
      lines.some(
        (l) =>
          l.kind === "at" && l.span.start <= at.start && at.start < l.span.end,
      ),
    read: (at) => body || end === null || (at !== null && at.start < end),
  };
}

/**
 * Another shipped venue as the text names it: the word for it (its `name`), every name it goes by,
 * and its edition's year (from its id).
 */
export type OtherVenue = NamedVenue & Pick<Preset, "year" | "declaredAliases">;

/**
 * A year beside a name, right after it: `2027`, `'27` or `’27`, after spaces or none (`~` renders
 * as a no-break space). Anchored: it is tried on the text after the name.
 */
const YEAR_AFTER = /^[\s\u00a0]*(?:(\d{4})|['’](\d{2}))(?![\p{L}\p{N}])/u;

/** The year written right after offset `end` of `text`, or null. `'27` is 2027. Pure. */
function yearAfter(text: string, end: number): number | null {
  const m = YEAR_AFTER.exec(text.slice(end));
  if (m === null) return null;
  return m[1] !== undefined
    ? Number.parseInt(m[1], 10)
    : 2000 + Number.parseInt(String(m[2]), 10);
}

/** `s` as a pattern that matches it literally. */
const literal = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** One name a match is judged by: whether it is the paper's own, and the venue it shows as. */
interface NameToJudge {
  readonly name: string;
  readonly own: boolean;
  readonly shows: string;
}

/**
 * Every name to look for, once each: every other shipped venue's, shown as that venue's `name`, and
 * the paper's own and its parent's, which count only in another edition. Pure.
 */
function namesToJudge(
  preset: Pick<Preset, "label" | "aliases" | "parentNames">,
  others: readonly OtherVenue[],
): readonly NameToJudge[] {
  const own = new Set([...preset.aliases, ...preset.parentNames]);
  const shownBy = (name: string): string =>
    others.find((o) => o.aliases.includes(name))?.label ??
    (preset.aliases.includes(name) ? preset.label : name);
  const all = [...new Set([...others.flatMap((o) => o.aliases), ...own])];
  return all.map((name) => ({
    name,
    own: own.has(name),
    shows: shownBy(name),
  }));
}

/**
 * Whether a name at a place, with `year` beside it (null: none), names another venue than the
 * paper's edition (of year `paperYear`). Inside a venue-identity command (`inLine`) any other
 * venue's name counts; in prose only beside a year no older than the paper's year minus one, so
 * related work («ICSE 2019») and a bare acronym are not leftovers. The paper's own names, and its
 * parent's, count only beside another year: another edition of its own series. Pure.
 */
export function namesAnotherEdition(
  n: { readonly own: boolean; readonly inLine: boolean },
  year: number | null,
  paperYear: number | null,
): boolean {
  const recent = paperYear === null || (year !== null && year >= paperYear - 1);
  if (n.own)
    return (
      year !== null &&
      paperYear !== null &&
      year !== paperYear &&
      (n.inLine || recent)
    );
  return n.inLine || (year !== null && recent);
}

/** A name to look for, with the pattern that finds it as a whole word. */
type NameMatcher = NameToJudge & { readonly re: RegExp };

/**
 * The findings of one name in one run: each whole-word match judged with the year beside it and
 * whether it stands in a venue-stating command (`inLine`). Pure.
 */
function matchesIn(
  run: TextRun,
  n: NameMatcher,
  paper: LeftoverPlaces & {
    readonly year: number | null;
    readonly venue: string;
  },
): readonly Located[] {
  const { inLine, read, venue } = paper;
  const text = runText(run);
  return [...text.matchAll(n.re)].flatMap((m) => {
    const at = spanIn(run, m.index, m.index + m[0].length);
    const year = yearAfter(text, m.index + m[0].length);
    const judged = { own: n.own, inLine: inLine(at) };
    if (!judged.inLine && !read(at)) return [];
    if (!namesAnotherEdition(judged, year, paper.year)) return [];
    const other = editionLabel(n.shows, year);
    return [{ messageId: "leftover", data: { name: m[0], other, venue }, at }];
  });
}

/**
 * Each place the rendered text names another venue than the paper's edition — a name as a whole
 * word, case and all, judged with the year beside it (`namesAnotherEdition`), in the `places` the
 * rule reads (`leftoverPlaces`). A family preset names no venue, so nothing is another venue:
 * silent.
 */
export function judgeLeftover(
  runs: readonly TextRun[],
  preset: Preset,
  others: readonly OtherVenue[],
  places: LeftoverPlaces,
): readonly Located[] {
  if (preset.identity.type !== "venue") return [];
  const venue = editionLabel(preset.label, preset.year);
  const names: readonly NameMatcher[] = namesToJudge(preset, others).map(
    (n) => ({
      ...n,
      re: new RegExp(
        `(?<![\\p{L}\\p{N}])${literal(n.name)}(?![\\p{L}\\p{N}])`,
        "gu",
      ),
    }),
  );
  return runs.flatMap((run) =>
    names.flatMap((n) =>
      matchesIn(run, n, { ...places, year: preset.year, venue }),
    ),
  );
}
