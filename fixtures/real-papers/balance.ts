/**
 * The mechanical part of «Growing this set without bias» (accepted/README.md), as one pure check
 * over the entries of `venue-manifest.json`, the field quotas of `accepted/sampling/queries.json` and
 * the directory names of `accepted/`. `balance.test.ts` runs it on planted defects and on the real
 * files. What it cannot see: whether the kept papers were the FIRST passing candidates in the fixed
 * order (that is `sampling/probe-log.jsonl`, read by a person or rerun by `scripts/grow-real-papers/main.ts`).
 */
import * as R from "remeda";
import { z } from "zod";
// The collector's own rules: at most PER_EDITION papers per venue edition, and the licences a paper
// may be redistributed under, as arXiv's metadata spells them.
import {
  committedLicenceProblems,
  PER_EDITION,
} from "../../scripts/grow-real-papers/rules.ts";

/**
 * The part of a `venue-manifest.json` entry this check reads. Everything but the id and the
 * directory is optional here, so that an entry missing it is reported, not thrown on.
 * `acceptance`: how acceptance was established, `arxiv-comment` (a quote) or `s2-venue-listing`.
 * `field`: set on the entries of a sampled batch only; the quota counts these.
 * `series` and `year`: the venue edition, on every entry, so editions count across batches.
 */
export const EntrySchema = z.object({
  arxiv_id: z.string(),
  dir: z.string(),
  license: z.string().optional(),
  accepted: z.object({ quote: z.string() }).optional(),
  acceptance: z.string().optional(),
  field: z.string().optional(),
  series: z.string().optional(),
  year: z.number().optional(),
});
export type Entry = Readonly<z.infer<typeof EntrySchema>>;


/** An `accepted/` directory named by an arXiv id; the six older papers are named by words. */
const isArxivDir = (name: string): boolean =>
  name.charAt(0) >= "0" && name.charAt(0) <= "9";

const editionOf = (e: Entry): string | null =>
  e.series === undefined || e.year === undefined
    ? null
    : `${e.series} ${String(e.year)}`;

const entryProblems = (e: Entry, dirs: ReadonlySet<string>): string[] => [
  ...(editionOf(e) === null ? [`${e.arxiv_id}: no series or year`] : []),
  ...committedLicenceProblems(e.arxiv_id, e.license),
  ...((e.accepted?.quote ?? "") !== "" || e.acceptance === "s2-venue-listing"
    ? []
    : [
        `${e.arxiv_id}: no acceptance evidence (a quote, or acceptance s2-venue-listing)`,
      ]),
  ...(dirs.has(e.dir) ? [] : [`${e.arxiv_id}: no directory accepted/${e.dir}`]),
];

/** How many of `keys` are each value, the undefined ones left out. */
const tally = (keys: readonly (string | undefined)[]): [string, number][] =>
  Object.entries(R.countBy(keys.filter(R.isDefined), (k: string) => k));

const editionProblems = (entries: readonly Entry[]): string[] =>
  tally(entries.map((e) => editionOf(e) ?? undefined))
    .filter(([, n]) => n > PER_EDITION)
    .map(
      ([ed, n]) =>
        `edition ${ed}: ${String(n)} papers, at most ${String(PER_EDITION)}`,
    );

const fieldProblems = (
  entries: readonly Entry[],
  quotas: Readonly<Record<string, number>>,
): string[] =>
  tally(entries.map((e) => e.field))
    .filter(([f, n]) => n > (quotas[f] ?? 0))
    .map(
      ([f, n]) =>
        `field ${f}: ${String(n)} papers, quota ${String(quotas[f] ?? 0)}`,
    );

/**
 * Every way the set breaks the rules, in a fixed order: per entry (series and year, licence,
 * acceptance evidence, directory), then editions over `PER_EDITION`, then fields over their quota
 * (a field with no quota has quota 0), then arXiv-id directories with no entry. Empty when balanced.
 */
export function balanceProblems(
  entries: readonly Entry[],
  quotas: Readonly<Record<string, number>>,
  dirs: readonly string[],
): readonly string[] {
  const dirSet = new Set(dirs);
  const named = new Set(entries.map((e) => e.dir));
  return [
    ...entries.flatMap((e) => entryProblems(e, dirSet)),
    ...editionProblems(entries),
    ...fieldProblems(entries, quotas),
    ...dirs
      .filter((d) => isArxivDir(d) && !named.has(d))
      .map((d) => `accepted/${d}: no entry in venue-manifest.json`),
  ];
}
