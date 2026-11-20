/**
 * The walk: for each field, the venue editions of `queries.json` in round-robin rounds; in each
 * edition the candidates in their fixed order; each candidate through rules 1 to 4, the first
 * failing rule logged as its reason; the first passing ones kept. Nothing is picked by hand.
 *
 * Quotas, caps and the 5 per edition are TOTALS over every entry of `venue-manifest.json`, earlier
 * batches included: a field's quota counts the entries with that `field`, an edition's cap the
 * entries of that series and year. So growing the set is raising a quota in `queries.json` and
 * rerunning; a quota already met adds nothing.
 */
import { stagingPlan, sha256, unpack } from "./archive.ts";
import { keptPaper, type Candidate, type KeptPaper } from "./paper.ts";
import {
  judgeClass,
  judgeComment,
  judgeLicence,
  judgeListedVenue,
  judgeSize,
  PER_EDITION,
  preambleOf,
  SlotSchema,
  type Slot,
} from "./rules.ts";
import {
  arxivCandidates,
  baseId,
  eprint,
  licenceUrl,
  s2Candidates,
  type Found,
  type Get,
} from "./sources.ts";
import { z } from "zod";

export const QueriesSchema = z.object({
  hardCap: z.number(),
  maxPages: z.number(),
  quotas: z.record(z.string(), z.number()),
  slots: z.array(SlotSchema),
});
export type Queries = Readonly<z.infer<typeof QueriesSchema>>;

/** The part of a manifest entry the counts read. */
export type Counted = Readonly<{
  arxiv_id: string;
  field?: string;
  series?: string;
  year?: number;
}>;

/** One line of `probe-log.jsonl`: every candidate that reached a rule, kept or with its reason. */
export type ProbeLine = Readonly<{
  id: string;
  field: string;
  series: string;
  year: number;
  rank: number;
  query: string;
  source: "arxiv-comment" | "semantic-scholar";
  acceptance: "arxiv-comment" | "s2-venue-listing";
  outcome: "kept" | "rejected";
  reason: string;
  [detail: string]: unknown;
}>;

/** How a venue edition's walk ended. */
export type SlotEnd = Readonly<{
  slot: string;
  ended: "full" | "exhausted" | "time" | "search error";
  walkedTo: number;
  error?: string;
}>;

/** What the walk is given: the world through `get`, and everything already decided. */
export type Walk = Readonly<{
  queries: Queries;
  /** Only these fields; all when null. */
  only: readonly string[] | null;
  /** Every entry of the venue manifest (the counts) — with the preprints', the ids to skip. */
  entries: readonly Counted[];
  otherIds: ReadonlySet<string>;
  /** Earlier log lines: a candidate already judged for this edition is not judged again. */
  logged: readonly ProbeLine[];
  shipped: ReadonlySet<string>;
  get: Get;
  outOfTime: () => boolean;
  /** Called on each new log line, with the paper when it is kept, as soon as it is decided. */
  emit: (line: ProbeLine, paper?: KeptPaper) => void | Promise<void>;
}>;

const edition = (s: Readonly<{ series?: string; year?: number }>): string =>
  `${String(s.series)} ${String(s.year)}`;
export const slotKey = (s: Slot): string =>
  `${s.field}/${s.series} ${String(s.year)}`;

/** The rounds of one field: each slot's target per round, `cap + round`, at most `hardCap` and 5. */
export const targets = (
  slots: readonly Slot[],
  hardCap: number,
): readonly (readonly [Slot, number])[] => {
  const cap = Math.min(hardCap, PER_EDITION);
  return Array.from({ length: cap + 1 }, (_, round) => round).flatMap((round) =>
    slots
      .map((s) => [s, Math.min(cap, s.cap + round)] as const)
      .filter(
        ([s, t]) => round === 0 || t !== Math.min(cap, s.cap + round - 1),
      ),
  );
};

/** Rules 2 to 4, and the staging, for a candidate that passed rule 1. */
async function judgeSources(
  w: Walk,
  c: Candidate,
  slot: Slot,
  track: string | null,
): Promise<Readonly<{ reason: string; detail?: object; paper?: KeptPaper }>> {
  const oai = await licenceUrl(w.get, c.id);
  if (!oai.ok) return { reason: `download failed: OAI ${oai.status}` };
  const licence = judgeLicence(oai.url);
  if (!licence.ok) return { reason: licence.reason };
  const src = await eprint(w.get, c.id);
  if (!src.ok) return { reason: `download failed: src ${src.status}` };
  const files = unpack(src.bytes);
  if (!files.ok) return { reason: files.reason };
  const plan = stagingPlan(files.files);
  if (!plan.ok) return { reason: plan.reason };
  const preamble = preambleOf(plan.mainText);
  const cls = judgeClass(slot.classSpec, preamble);
  if (!cls.ok)
    return {
      reason: cls.reason,
      detail: { cls: preamble.cls, clsOpts: preamble.clsOpts },
    };
  const size = judgeSize(plan.size);
  if (!size.ok) return { reason: size.reason };
  const paper = keptPaper({
    c,
    slot,
    track,
    licence,
    plan,
    preamble,
    ...(cls.style === undefined
      ? {}
      : { style: cls.style, styleOpts: cls.styleOpts ?? "" }),
    sourceSha: sha256(src.bytes),
    shipped: w.shipped,
  });
  return {
    reason: `passes rules 1-4`,
    detail: { licence: licence.name },
    paper,
  };
}

/** Walks every field of `w.queries`, and returns how each edition's walk ended. */
export async function collect(w: Walk): Promise<readonly SlotEnd[]> {
  const counted: Counted[] = [...w.entries];
  const ids = new Set([
    ...w.otherIds,
    ...w.entries.map((e) => baseId(e.arxiv_id)),
  ]);
  const judged = new Set(
    w.logged
      .filter(
        (l) => l.outcome === "kept" || !l.reason.startsWith("download failed"),
      )
      .map((l) => `${l.id} ${l.series} ${String(l.year)}`),
  );
  const inField = (f: string) => counted.filter((e) => e.field === f).length;
  const inEdition = (s: Slot) =>
    counted.filter((e) => edition(e) === edition(s)).length;
  const ends: SlotEnd[] = [];
  const slots = w.queries.slots.filter(
    (s) => w.only === null || w.only.includes(s.field),
  );
  for (const field of [...new Set(slots.map((s) => s.field))]) {
    const quota = w.queries.quotas[field] ?? 0;
    for (const [slot, target] of targets(
      slots.filter((s) => s.field === field),
      w.queries.hardCap,
    )) {
      const full = () => inEdition(slot) >= target || inField(field) >= quota;
      if (full()) continue;
      const end = await walkSlot(slot, full);
      ends.push({ slot: slotKey(slot), ...end });
      if (end.ended === "time") return ends;
    }
  }
  return ends;

  async function walkSlot(
    slot: Slot,
    full: () => boolean,
  ): Promise<Omit<SlotEnd, "slot">> {
    const s2 = slot.source === "semantic-scholar";
    const found: AsyncGenerator<Found> = s2
      ? s2Candidates(w.get, slot)
      : arxivCandidates(w.get, slot, w.queries.maxPages);
    let walkedTo = 0;
    for await (const c of found) {
      if ("searchError" in c)
        return { ended: "search error", walkedTo, error: c.searchError };
      if (w.outOfTime()) return { ended: "time", walkedTo };
      if (full()) return { ended: "full", walkedTo };
      walkedTo = c.rank;
      const key = `${c.id} ${slot.series} ${String(slot.year)}`;
      if (judged.has(key)) continue;
      judged.add(key);
      const verdict = await judge(c, slot, s2);
      const line: ProbeLine = {
        id: c.id,
        field: slot.field,
        series: slot.series,
        year: slot.year,
        rank: c.rank,
        query: c.query,
        source: s2 ? "semantic-scholar" : "arxiv-comment",
        acceptance: s2 ? "s2-venue-listing" : "arxiv-comment",
        outcome: verdict.paper === undefined ? "rejected" : "kept",
        reason: verdict.reason,
        ...verdict.detail,
      };
      if (verdict.paper !== undefined) {
        counted.push(verdict.paper.entry as Counted);
        ids.add(baseId(c.id));
      }
      await w.emit(line, verdict.paper);
    }
    return { ended: full() ? "full" : "exhausted", walkedTo };
  }

  async function judge(c: Candidate, slot: Slot, s2: boolean) {
    if (ids.has(baseId(c.id))) return { reason: "already in the corpora" };
    if (c.s2 !== undefined && c.updated === "")
      return { reason: "arXiv metadata missing for the listed id" };
    const rule1 =
      c.s2 === undefined ? judgeComment(c, slot) : judgeListedVenue(c.s2.venue);
    if (!rule1.ok)
      return {
        reason: rule1.reason,
        detail: s2 ? {} : { comment: c.comment.slice(0, 160) },
      };
    const rest = await judgeSources(w, c, slot, rule1.track);
    return rest.paper === undefined
      ? rest
      : {
          ...rest,
          detail: { ...rest.detail, comment: c.comment.slice(0, 200) },
        };
  }
}

/** The per-field table of a run: kept against quota, candidates probed, yield, top 3 reasons. */
export function summary(
  queries: Queries,
  entries: readonly Counted[],
  lines: readonly ProbeLine[],
): string {
  const reasonKey = (r: string) =>
    r
      .replace(/[0-9]+ bytes|\(.*?\)|\[.*?\]|\d{4}/g, "")
      .trim()
      .slice(0, 60);
  const rows = Object.entries(queries.quotas).map(([f, quota]) => {
    const kept = entries.filter((e) => e.field === f).length;
    const probed = new Set(lines.filter((l) => l.field === f).map((l) => l.id))
      .size;
    const reasons = Object.entries(
      lines
        .filter((l) => l.field === f && l.outcome === "rejected")
        .reduce<Record<string, number>>((t, l) => {
          t[reasonKey(l.reason)] = (t[reasonKey(l.reason)] ?? 0) + 1;
          return t;
        }, {}),
    )
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k} (${String(n)})`)
      .join("; ");
    const pct = probed === 0 ? "0" : ((100 * kept) / probed).toFixed(1);
    return `| ${f} | ${String(kept)} / ${String(quota)} | ${String(probed)} | ${pct}% | ${reasons} |`;
  });
  return [
    "| field | kept / quota | probed | yield | top 3 rejection reasons |",
    "| --- | --- | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}
