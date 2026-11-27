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
import { judgeDeclaredVenue } from "./declared-venue.ts";
import { keptPaper, type Candidate, type KeptPaper } from "./paper.ts";
import {
  judgeClass,
  judgeComment,
  judgeLicence,
  judgeListedVenue,
  judgeSize,
  PER_EDITION,
  preambleOf,
  type Preamble,
  SlotSchema,
  type Slot,
  type Verdict,
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
import * as R from "remeda";
import { z } from "zod";

export const QueriesSchema = z.object({
  hardCap: z.number(),
  maxPages: z.number(),
  quotas: z.record(z.string(), z.number()),
  slots: z.array(SlotSchema),
});
export type Queries = Readonly<z.infer<typeof QueriesSchema>>;

/** The part of a manifest entry the counts read. */
export const CountedSchema = z.looseObject({
  arxiv_id: z.string(),
  field: z.string().optional(),
  series: z.string().optional(),
  year: z.number().optional(),
});
export type Counted = Readonly<z.infer<typeof CountedSchema>>;

/** One line of `probe-log.jsonl`: every candidate that reached a rule, kept or with its reason. */
export const ProbeLineSchema = z.looseObject({
  id: z.string(),
  field: z.string(),
  series: z.string(),
  year: z.number(),
  rank: z.number(),
  query: z.string(),
  source: z.enum(["arxiv-comment", "semantic-scholar"]),
  acceptance: z.enum(["arxiv-comment", "s2-venue-listing"]),
  outcome: z.enum(["kept", "rejected"]),
  reason: z.string(),
});
export type ProbeLine = Readonly<z.infer<typeof ProbeLineSchema>>;

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

const edition = (
  s: Readonly<{ series?: string | undefined; year?: number | undefined }>,
): string => `${String(s.series)} ${String(s.year)}`;
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

type Judged = Readonly<{ reason: string; detail?: object; paper?: KeptPaper }>;
type Sources = Readonly<{
  licence: Extract<ReturnType<typeof judgeLicence>, { ok: true }>;
  plan: Extract<ReturnType<typeof stagingPlan>, { ok: true }>;
  sourceSha: string;
}>;

/** Rule 2 and the download: the licence, then the e-print and what it stages. */
async function fetchSources(
  get: Get,
  id: string,
): Promise<Sources | Readonly<{ reason: string }>> {
  const oai = await licenceUrl(get, id);
  if (!oai.ok) return { reason: `download failed: OAI ${oai.status}` };
  const licence = judgeLicence(oai.url);
  if (!licence.ok) return licence;
  const src = await eprint(get, id);
  if (!src.ok) return { reason: `download failed: src ${src.status}` };
  const files = unpack(src.bytes);
  if (!files.ok) return files;
  const plan = stagingPlan(files.files);
  return plan.ok ? { licence, plan, sourceSha: sha256(src.bytes) } : plan;
}

/** Rules 3 and 4 on what the e-print staged: the class and style, then the size. */
function judgeStaged(
  slot: Slot,
  plan: Sources["plan"],
):
  | Readonly<{
      preamble: Preamble;
      style?: string;
      styleOptions?: readonly string[];
    }>
  | Judged {
  const preamble = preambleOf(plan.mainText);
  const cls = judgeClass(slot.classSpec, preamble);
  if (!cls.ok)
    return {
      reason: cls.reason,
      detail: { cls: preamble.cls, clsOptions: preamble.clsOptions },
    };
  const size = judgeSize(plan.size);
  if (!size.ok) return { reason: size.reason };
  return { preamble, ...R.omit(cls, ["ok"]) };
}

/** Rules 2 to 4, and the staging, for a candidate that passed rule 1. */
async function judgeSources(
  w: Walk,
  c: Candidate,
  slot: Slot,
  track: string | null,
): Promise<Judged> {
  const got = await fetchSources(w.get, c.id);
  if ("reason" in got) return { reason: got.reason };
  // The comment or the listing says where it was accepted; the TeX says what this source is.
  const edition: Verdict = judgeDeclaredVenue(got.plan.mainText, slot);
  if (!edition.ok) return { reason: edition.reason };
  const staged = judgeStaged(slot, got.plan);
  if ("reason" in staged) return staged;
  return {
    reason: "passes rules 1-4",
    detail: { licence: got.licence.name, comment: c.comment.slice(0, 200) },
    paper: keptPaper({ ...got, ...staged, c, slot, track, shipped: w.shipped }),
  };
}

/** What a walk remembers across editions: the counted entries, the ids taken, the pairs judged. */
type State = Readonly<{
  counted: Counted[];
  ids: Set<string>;
  judged: Set<string>;
}>;

const judgedKey = (id: string, s: Readonly<{ series: string; year: number }>) =>
  `${id} ${s.series} ${String(s.year)}`;

/** A failed download is judged again on the next run; every other verdict stands. */
const stateOf = (w: Walk): State => ({
  counted: [...w.entries],
  ids: new Set([...w.otherIds, ...w.entries.map((e) => baseId(e.arxiv_id))]),
  judged: new Set(
    w.logged
      .filter(
        (l) => l.outcome === "kept" || !l.reason.startsWith("download failed"),
      )
      .map((l) => judgedKey(l.id, l)),
  ),
});

/** Rule 1, then the rest, for one candidate. */
async function judge(w: Walk, st: State, c: Candidate, slot: Slot) {
  if (st.ids.has(baseId(c.id))) return { reason: "already in the corpora" };
  if (c.s2 !== undefined && c.updated === "")
    return { reason: "arXiv metadata missing for the listed id" };
  const rule1 =
    c.s2 === undefined
      ? judgeComment(c, slot)
      : judgeListedVenue(c.s2.venue, { comment: c.comment, slot });
  if (rule1.ok) return judgeSources(w, c, slot, rule1.track);
  return {
    reason: rule1.reason,
    detail: c.s2 === undefined ? { comment: c.comment.slice(0, 160) } : {},
  };
}

const lineOf = (slot: Slot, c: Candidate, v: Judged): ProbeLine => {
  const s2 = slot.source === "semantic-scholar";
  return {
    id: c.id,
    field: slot.field,
    series: slot.series,
    year: slot.year,
    rank: c.rank,
    query: c.query,
    source: s2 ? "semantic-scholar" : "arxiv-comment",
    acceptance: s2 ? "s2-venue-listing" : "arxiv-comment",
    outcome: v.paper === undefined ? "rejected" : "kept",
    reason: v.reason,
    ...v.detail,
  };
};

/** Judges one candidate not judged before for this edition, counts it when kept, emits its line. */
async function probe(
  w: Walk,
  st: State,
  slot: Slot,
  c: Candidate,
): Promise<void> {
  const key = judgedKey(c.id, slot);
  if (st.judged.has(key)) return;
  st.judged.add(key);
  const verdict: Judged = await judge(w, st, c, slot);
  if (verdict.paper !== undefined) {
    const { field, series, year } = slot;
    st.counted.push({ arxiv_id: c.id, field, series, year });
    st.ids.add(baseId(c.id));
  }
  await w.emit(lineOf(slot, c, verdict), verdict.paper);
}

type Stop = Omit<SlotEnd, "slot" | "walkedTo">;

/** The candidate to judge next, or why the walk stops before it. */
const next = (
  f: Found,
  w: Walk,
  full: () => boolean,
): Readonly<{ stop: Stop }> | Readonly<{ candidate: Candidate }> => {
  if ("searchError" in f)
    return { stop: { ended: "search error", error: f.searchError } };
  if (w.outOfTime()) return { stop: { ended: "time" } };
  return full() ? { stop: { ended: "full" } } : { candidate: f };
};

async function walkSlot(
  w: Walk,
  st: State,
  slot: Slot,
  full: () => boolean,
): Promise<Omit<SlotEnd, "slot">> {
  const found =
    slot.source === "semantic-scholar"
      ? s2Candidates(w.get, slot)
      : arxivCandidates(w.get, slot, w.queries.maxPages);
  let walkedTo = 0;
  for await (const f of found) {
    const n = next(f, w, full);
    if ("stop" in n) return { ...n.stop, walkedTo };
    walkedTo = n.candidate.rank;
    await probe(w, st, slot, n.candidate);
  }
  return { ended: full() ? "full" : "exhausted", walkedTo };
}

/**
 * Walks every field of `w.queries`, and returns how each edition's walk ended. An edition is full
 * when the manifest holds its round's target for it, or its field's quota: both TOTALS.
 */
export async function collect(w: Walk): Promise<readonly SlotEnd[]> {
  const st = stateOf(w);
  const count = (keep: (e: Counted) => boolean) =>
    st.counted.filter(keep).length;
  const slots = w.queries.slots.filter(
    (s) => w.only === null || w.only.includes(s.field),
  );
  const order = [...new Set(slots.map((s) => s.field))].flatMap((field) =>
    targets(
      slots.filter((s) => s.field === field),
      w.queries.hardCap,
    ),
  );
  const ends: SlotEnd[] = [];
  // An edition that ran out of candidates or failed its search is not walked again in a later round.
  const done = new Set<string>();
  for (const [slot, target] of order) {
    if (done.has(slotKey(slot))) continue;
    const full = () =>
      count((e) => edition(e) === edition(slot)) >= target ||
      count((e) => e.field === slot.field) >=
        (w.queries.quotas[slot.field] ?? 0);
    if (full()) continue;
    const end = await walkSlot(w, st, slot, full);
    ends.push({ slot: slotKey(slot), ...end });
    if (end.ended === "time") break;
    if (end.ended !== "full") done.add(slotKey(slot));
  }
  return ends;
}
