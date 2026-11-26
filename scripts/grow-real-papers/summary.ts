/**
 * What a run of the collector reports, from data alone: per field the manifest's TOTAL against its
 * quota beside what the log judged (kept, and distinct ids probed); per venue edition the count of
 * every manifest entry of that series and year, a field or not, against the cap; and every edition
 * whose walk ended by time or a search error, so a short field is never mistaken for an exhausted
 * one. No I/O.
 */
import * as R from "remeda";
import type { Counted, ProbeLine, Queries, SlotEnd } from "./collect.ts";
import { PER_EDITION } from "./rules.ts";
import { baseId } from "./sources.ts";

export type FieldRow = Readonly<{
  field: string;
  total: number;
  quota: number;
  kept: number;
  probed: number;
  top: readonly (readonly [string, number])[];
}>;
export type EditionRow = Readonly<{
  edition: string;
  count: number;
  cap: number;
}>;
export type Summary = Readonly<{
  fields: readonly FieldRow[];
  editions: readonly EditionRow[];
  /** The walks ended by time or a search error; null when the walks were not run (`--summary`). */
  incomplete: readonly SlotEnd[] | null;
}>;

const editionOf = (
  e: Readonly<{ series?: string | undefined; year?: number | undefined }>,
): string | null =>
  e.series === undefined || e.year === undefined
    ? null
    : `${e.series} ${String(e.year)}`;

/**
 * The rejection reasons of `lines`, each counting distinct ids as `probed` does, most frequent
 * first, ties in first-seen order, at most 3.
 */
const topReasons = (
  lines: readonly ProbeLine[],
): readonly (readonly [string, number])[] =>
  R.pipe(
    lines.filter((l) => l.outcome === "rejected"),
    R.uniqueBy((l) => `${l.id} ${l.reason}`),
    R.groupBy((l) => l.reason),
    R.entries(),
    R.map(([reason, ls]) => [reason, ls.length] as const),
    R.sortBy([([, n]) => n, "desc"]),
    R.take(3),
  );

const fieldRow = (
  field: string,
  quota: number,
  entries: readonly Counted[],
  lines: readonly ProbeLine[],
): FieldRow => {
  const mine = lines.filter((l) => l.field === field);
  return {
    field,
    total: entries.filter((e) => e.field === field).length,
    quota,
    kept: mine.filter((l) => l.outcome === "kept").length,
    probed: new Set(mine.map((l) => l.id)).size,
    top: topReasons(mine),
  };
};

/** A walk that stopped before its edition was full or exhausted. */
const unfinished = (e: SlotEnd): boolean =>
  e.ended === "time" || e.ended === "search error";

/** The editions of the slots in their order, then any other the manifest holds, sorted. */
const editionsOf = (
  queries: Queries,
  entries: readonly Counted[],
): readonly string[] =>
  R.unique([
    ...queries.slots.map((s) => `${s.series} ${String(s.year)}`),
    ...entries
      .map(editionOf)
      .filter((e) => e !== null)
      .toSorted(),
  ]);

/** The summary of a run (or of a whole log) over the manifest as it stands after it. */
export function summarize({
  queries,
  entries,
  lines,
  ends,
}: Readonly<{
  queries: Queries;
  entries: readonly Counted[];
  lines: readonly ProbeLine[];
  ends: readonly SlotEnd[] | null;
}>): Summary {
  const cap = Math.min(queries.hardCap, PER_EDITION);
  return {
    fields: Object.entries(queries.quotas).map(([field, quota]) =>
      fieldRow(field, quota, entries, lines),
    ),
    editions: editionsOf(queries, entries).map((edition) => ({
      edition,
      count: entries.filter((e) => editionOf(e) === edition).length,
      cap,
    })),
    incomplete: ends?.filter(unfinished) ?? null,
  };
}

const fieldLine = (f: FieldRow): string =>
  [
    f.field,
    `${String(f.total)} / ${String(f.quota)}${f.total < f.quota ? " ⚠ short" : ""}`,
    String(f.kept),
    String(f.probed),
    f.probed === 0 ? "—" : `${((100 * f.kept) / f.probed).toFixed(1)}%`,
    f.top.length === 0
      ? "—"
      : f.top.map(([r, n]) => `${r} (${String(n)})`).join("; "),
  ].join(" | ");

const editionLine = (e: EditionRow): string =>
  `${e.edition} | ${String(e.count)} / ${String(e.cap)}${
    e.count > e.cap ? " ❌ over cap" : e.count === e.cap ? " full" : ""
  }`;

const endLine = (e: SlotEnd): string =>
  `not finished: ${e.slot} ended by ${e.ended}${
    e.error === undefined ? "" : ` (${e.error})`
  }; rerun to resume`;

/** The summary as lines; `scope` names what kept and probed count over («this run», «the log»). */
export const renderSummary = (s: Summary, scope: string): readonly string[] => [
  `field | total / quota | kept (${scope}) | probed (${scope}) | yield | top 3 rejection reasons`,
  ...s.fields.map(fieldLine),
  "edition | count / cap",
  ...s.editions.map(editionLine),
  ...(s.incomplete === null
    ? []
    : s.incomplete.length === 0
      ? ["every walk finished"]
      : s.incomplete.map(endLine)),
];

/**
 * What a run prints after its walks, and its exit code: the summary, then the one command to run
 * next. A walk stopped by time or a search error is not a finished run, so it exits 1.
 */
export function report(
  input: Parameters<typeof summarize>[0] &
    Readonly<{ ends: readonly SlotEnd[] }>,
  write: boolean,
): Readonly<{ lines: readonly string[]; code: number }> {
  const stopped = input.ends.some(unfinished);
  const next = stopped
    ? "next: rerun the same command to finish the walks"
    : write
      ? "next: npx vitest run fixtures/real-papers/balance.test.ts fixtures/real-papers/inputs.test.ts"
      : "next: commit the quotas, then rerun with --write fixtures";
  return {
    lines: [...renderSummary(summarize(input), "this run"), next],
    code: stopped ? 1 : 0,
  };
}

/** The ids the log says were kept that have no entry in the manifest. */
export const keptNotInManifest = (
  lines: readonly ProbeLine[],
  entries: readonly Counted[],
): readonly string[] => {
  const ids = new Set(entries.map((e) => baseId(e.arxiv_id)));
  return lines
    .filter((l) => l.outcome === "kept" && !ids.has(baseId(l.id)))
    .map((l) => l.id);
};

/**
 * What `--summary` prints, and its exit code: the summary of the whole log, then each id the log
 * says was kept that the manifest lacks; one such id exits 1.
 */
export function logReport(
  input: Omit<Parameters<typeof summarize>[0], "ends">,
): Readonly<{ lines: readonly string[]; code: number }> {
  const missing = keptNotInManifest(input.lines, input.entries);
  return {
    lines: [
      ...renderSummary(summarize({ ...input, ends: null }), "the log"),
      ...(missing.length === 0
        ? []
        : [
            `❌ kept in the log but not in venue-manifest.json: ${missing.join(", ")}`,
          ]),
    ],
    code: missing.length === 0 ? 0 : 1,
  };
}
