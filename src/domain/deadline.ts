/**
 * A VENUE'S DEADLINE — what each page said about it, and which instant binds.
 *
 * One entry per deadline of an attempt, in a cycle's `deadlines`:
 *
 *   {
 *     "what": "submission",
 *     "observed": [
 *       { "at": "2026-10-20T04:00:00Z", "source": "portal", "url": "…/deadlines", "read": "2026-10-05" },
 *       { "at": "2026-10-23 AoE",       "source": "call",   "url": "…/cfp",       "read": "2026-10-05" }
 *     ],
 *     "override": { "at": "2026-10-27T04:00:00Z", "reason": "…", "evidence": "mail/extension.eml" }
 *   }
 *
 * ── OBSERVED, THEN OVERRIDDEN ──────────────────────────────────────────────────────────
 * A READING is what one page said on one day: its instant, whether the page was the portal (which
 * refuses the upload) or the call (which only announces), where, and when it was read. The portal
 * and the call often disagree — an AoE day in a call is a day after the portal's UTC instant, and a
 * HotCRP "submissions must be completed by" can fall on the call's abstract day — so both are kept,
 * and the EARLIER binds: the safe reading of two. An OVERRIDE is a human decision that another
 * instant binds (the chairs extended by mail); it wins, and it carries its reason and a file as
 * evidence, so it is never a silent edit of a reading.
 *
 * ── THE WORDS ───────────────────────────────────────────────────────────────────────────
 * A call says "abstract" and "paper"; HotCRP says registration, submission and resubmission. Here:
 * `registration` is the abstract registration (a call's "abstract" date), `submission` the full paper
 * (a call's "paper" date, HotCRP's "submissions must be completed by"), `resubmission` the updates a
 * portal allows to a completed submission. Recorded honestly, a call's "paper" day and a portal's
 * earlier "submission" cutoff are two readings of ONE deadline, and the earlier binds.
 *
 * Parsed by hand: the domain imports no schema library (see `src/CLAUDE.md`). Every object in the
 * record refuses a key it does not know: an `override` typed under another name would otherwise look
 * recorded and not be in force.
 */
import { err, ok, type Result } from "./result.ts";
import { isRecord } from "./record.ts";

/** A calendar day, `YYYY-MM-DD`. */
export type IsoDate = string;
/** A moment, as an ISO string in UTC: `2026-10-20T04:00:00Z`. Never a bare date. */
export type Instant = string;

export type DeadlineWhat =
  | "registration"
  | "submission"
  | "resubmission"
  | "notification"
  | "camera-ready";
/** The kinds, in the order a venue's deadlines keep. */
export const DEADLINE_WHATS: readonly DeadlineWhat[] = [
  "registration",
  "submission",
  "resubmission",
  "notification",
  "camera-ready",
];

/** What each kind is, in a call's words where they differ — said in every message that names the kinds. */
export const WHAT_MEANS: Readonly<Record<DeadlineWhat, string | null>> = {
  registration: 'abstract registration: a call\'s "abstract" date',
  submission: 'the full paper: a call\'s "paper" date',
  resubmission: "updates to a completed submission",
  notification: null,
  "camera-ready": null,
};

export type DeadlineSource = "portal" | "call";

/** What one page said about one deadline, and on which day it was read. */
export interface Observation {
  readonly at: Instant;
  readonly source: DeadlineSource;
  /** The page it was read on. */
  readonly url: string;
  readonly read: IsoDate;
}

/** A human decision that another instant binds, with why and the file it rests on. */
export interface Override {
  readonly at: Instant;
  readonly reason: string;
  /** A file in the paper folder: the mail, the saved page. `cycle/evidence` requires it on disk. */
  readonly evidence: string;
}

/** One deadline of an attempt, as the paper records it. */
export interface Deadline {
  readonly what: DeadlineWhat;
  readonly observed: readonly Observation[];
  readonly override: Override | null;
}

/** One reading of one deadline, as a venue preset carries it. */
export interface Reading extends Observation {
  readonly what: DeadlineWhat;
}

/** What binds a deadline: the override, or the reading that was earliest. */
export type Binding =
  | { readonly kind: "override"; readonly override: Override }
  | { readonly kind: "reading"; readonly reading: Observation };

/** A deadline in force: its instant, what set it, and every reading of it. */
export interface InForce {
  readonly what: DeadlineWhat;
  readonly at: Instant;
  readonly by: Binding;
  readonly readings: readonly Observation[];
}

/**
 * What a venue's portal says about its deadlines, in paperlint's words — what the scheduled refresh
 * of the shipped presets reads (`scripts/refresh-deadlines.ts`). One adapter per portal kind.
 */
export interface PortalDeadlines {
  /** The portal's clock when it answered, Unix seconds. */
  readonly now: number;
  /** Whether the portal takes submissions now. */
  readonly open: boolean;
  /** How the venue reviews, as the portal says it; null when it does not say. */
  readonly blind: boolean | "optional" | "until-review" | null;
  readonly deadlines: readonly PortalDeadline[];
}

/** One deadline the portal lists: its kind when it is one paperlint names, the portal's own label, and when. */
export interface PortalDeadline {
  readonly what: DeadlineWhat | null;
  readonly label: string;
  readonly at: Instant;
}

// ── instants ───────────────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is IsoDate =>
  typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

const asInstant = (ms: number): Instant =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Unix seconds → the instant, in UTC. */
export const instantOfUnix = (seconds: number): Instant =>
  asInstant(seconds * 1000);

/** The forms `at` takes, for every message that refuses one. */
const INSTANT_FORMS = `an instant with its zone (2026-10-20T04:00:00Z) or a call's "YYYY-MM-DD AoE"`;

/**
 * An ISO instant with its zone (`Z` or `±hh:mm`), or a call's `YYYY-MM-DD AoE`; normalised to UTC.
 * A bare date or a zoneless time is refused: it is the deadline people get wrong.
 */
export function instantOf(text: string): Result<Instant, string> {
  const bad = err(
    `"${text}" must be an instant with its zone (2026-10-20T04:00:00Z, 2026-10-20T09:00:00+05:00) or a call's "YYYY-MM-DD AoE"`,
  );
  const aoe = /^(\d{4}-\d{2}-\d{2}) AoE$/i.exec(text.trim());
  if (aoe) {
    const day = String(aoe[1]); // the group always participates in a match
    // The end of that day at UTC−12: 23:59:59 there is 11:59:59 UTC of the next day.
    const ms = Date.parse(`${day}T23:59:59-12:00`);
    return Number.isNaN(ms) ? bad : ok(asInstant(ms));
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(text))
    return bad;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? bad : ok(asInstant(ms));
}

// ── parsing ────────────────────────────────────────────────────────────────────────────

/** The first key of `v` that is not in `known`, as the refusal naming it; null when there is none. */
export const unknownKey = (
  v: Readonly<Record<string, unknown>>,
  known: readonly string[],
  at: string,
  whose: string,
): string | null => {
  const k = Object.keys(v).find((x) => !known.includes(x));
  return k === undefined
    ? null
    : `${at}: unknown key "${k}" — ${whose} keys: ${known.join(", ")}`;
};

/** `v[key]` as an instant, or the refusal naming the key and both forms. */
const instantField = (
  v: Readonly<Record<string, unknown>>,
  key: string,
  at: string,
): Result<Instant, string> => {
  const text = v[key];
  const instant =
    typeof text === "string" ? instantOf(text) : err("not a string");
  return instant.ok
    ? instant
    : err(
        `${at}: "${key}" must be ${INSTANT_FORMS}, got ${JSON.stringify(text)}`,
      );
};

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v !== "";

const READING_KEYS: readonly string[] = ["at", "source", "url", "read"];

/** `source`, `url` and `read` of a reading: where and when it was read. */
function provenance(
  v: Readonly<Record<string, unknown>>,
  at: string,
): Result<Omit<Observation, "at">, string> {
  const { source, url, read } = v;
  if (source !== "portal" && source !== "call")
    return err(
      `${at}: "source" must be "portal" or "call", got ${JSON.stringify(source)} — a deadline moved by mail is an "override", with the mail as its "evidence"`,
    );
  if (!nonEmpty(url))
    return err(`${at}: "url" must be where the deadline was read`);
  if (!isIsoDate(read))
    return err(`${at}: "read" must be the day the page was read, YYYY-MM-DD`);
  return ok({ source, url, read });
}

function parseObservation(v: unknown, at: string): Result<Observation, string> {
  if (!isRecord(v))
    return err(`${at}: a reading must be { "at", "source", "url", "read" }`);
  const unknown = unknownKey(v, READING_KEYS, at, "a reading's");
  if (unknown !== null) return err(unknown);
  const instant = instantField(v, "at", at);
  if (!instant.ok) return instant;
  const rest = provenance(v, at);
  return rest.ok ? ok({ at: instant.value, ...rest.value }) : rest;
}

/** Each item of a list through `one`; the first refusal, naming its index. */
function eachOf<T>(
  list: readonly unknown[],
  at: string,
  one: (v: unknown, at: string) => Result<T, string>,
): Result<readonly T[], string> {
  return list.reduce<Result<readonly T[], string>>((acc, v, i) => {
    if (!acc.ok) return acc;
    const p = one(v, `${at}[${String(i)}]`);
    return p.ok ? ok([...acc.value, p.value]) : p;
  }, ok([]));
}

/** The readings of one deadline: at most one per source — a re-read replaces the earlier one. */
function parseObserved(
  v: unknown,
  at: string,
): Result<readonly Observation[], string> {
  if (v === undefined) return ok([]);
  if (!Array.isArray(v))
    return err(
      `${at}: "observed" must be a list of readings { "at", "source", "url", "read" }`,
    );
  const list = eachOf(v, `${at}.observed`, parseObservation);
  if (!list.ok) return list;
  const twice = (["portal", "call"] as const).find(
    (s) => list.value.filter((o) => o.source === s).length > 1,
  );
  return twice === undefined
    ? list
    : err(
        `${at}: two "${twice}" readings — keep one per source, the latest (its "read" says when)`,
      );
}

const OVERRIDE_KEYS: readonly string[] = ["at", "reason", "evidence"];

function parseOverride(
  v: unknown,
  at: string,
): Result<Override | null, string> {
  if (v === undefined) return ok(null);
  if (!isRecord(v))
    return err(`${at}: "override" must be { "at", "reason", "evidence" }`);
  const where = `${at}.override`;
  const unknown = unknownKey(v, OVERRIDE_KEYS, where, "an override's");
  if (unknown !== null) return err(unknown);
  const instant = instantField(v, "at", where);
  if (!instant.ok) return instant;
  const { reason, evidence } = v;
  if (!nonEmpty(reason))
    return err(
      `${where}: "reason" must say why this instant binds rather than the readings (the chairs extended it by mail, …)`,
    );
  return nonEmpty(evidence)
    ? ok({ at: instant.value, reason, evidence })
    : err(
        `${where}: "evidence" must be a file in the paper folder — the mail or the saved page the override rests on`,
      );
}

const isWhat = (v: unknown): v is DeadlineWhat =>
  DEADLINE_WHATS.some((w) => w === v);

/** Every kind with what it is, for the message that refuses an unknown one. */
const KINDS_TEXT = DEADLINE_WHATS.map((w) => {
  const means = WHAT_MEANS[w];
  return means === null ? w : `${w} (${means})`;
}).join(", ");

const DEADLINE_KEYS: readonly string[] = ["what", "observed", "override"];

function parseDeadline(v: unknown, at: string): Result<Deadline, string> {
  if (!isRecord(v))
    return err(
      `${at}: a deadline must be { "what", "observed": [ … ], "override"? }`,
    );
  const unknown = unknownKey(v, DEADLINE_KEYS, at, "a deadline's");
  if (unknown !== null) return err(unknown);
  const what = v["what"];
  if (!isWhat(what))
    return err(
      `${at}: "what" must be one of ${KINDS_TEXT}; got ${JSON.stringify(what)}`,
    );
  const observed = parseObserved(v["observed"], at);
  if (!observed.ok) return observed;
  const override = parseOverride(v["override"], at);
  if (!override.ok) return override;
  return observed.value.length === 0 && override.value === null
    ? err(
        `${at}: the "${what}" deadline records nothing — add what a page said ("observed") or an "override"`,
      )
    : ok({ what, observed: observed.value, override: override.value });
}

/** The first kind with two entries, as the refusal naming both; null when each kind has one. */
function twoEntries(list: readonly Deadline[], at: string): string | null {
  const second = list.findIndex(
    (d, i) => list.findIndex((e) => e.what === d.what) !== i,
  );
  const d = list[second];
  if (d === undefined) return null;
  const first = list.findIndex((e) => e.what === d.what);
  return `${at}: the "${d.what}" deadline has two entries (deadlines[${String(first)}] and deadlines[${String(second)}]) — one entry per deadline: put every reading of it in that entry's "observed" list`;
}

/** A cycle's `deadlines` value → the list, or one line naming the place and the cure. Pure. */
export function parseDeadlines(
  v: unknown,
  at: string,
): Result<readonly Deadline[], string> {
  if (v === undefined) return ok([]);
  if (!Array.isArray(v)) return err(`${at}: "deadlines" must be a list`);
  const list = eachOf(v, `${at}.deadlines`, parseDeadline);
  if (!list.ok) return list;
  const twice = twoEntries(list.value, at);
  return twice === null ? list : err(twice);
}

// ── deriving ───────────────────────────────────────────────────────────────────────────

/** The earliest of the readings; the first of equals. */
const earliest = (readings: readonly Observation[]): Observation | undefined =>
  readings.reduce<Observation | undefined>(
    (best, o) => (best === undefined || o.at < best.at ? o : best),
    undefined,
  );

const withoutWhat = ({ at, source, url, read }: Reading): Observation => ({
  at,
  source,
  url,
  read,
});

/** One kind in force from the preset's readings and the paper's entry; null when neither says anything. */
function oneInForce(
  what: DeadlineWhat,
  own: Deadline | undefined,
  preset: readonly Reading[],
): InForce | null {
  const readings = [
    ...preset.filter((r) => r.what === what).map(withoutWhat),
    ...(own?.observed ?? []),
  ];
  const override = own?.override ?? null;
  if (override !== null)
    return {
      what,
      at: override.at,
      by: { kind: "override", override },
      readings,
    };
  const first = earliest(readings);
  return first === undefined
    ? null
    : { what, at: first.at, by: { kind: "reading", reading: first }, readings };
}

/**
 * Every deadline in force for an attempt: the paper's own entries over the venue preset's readings
 * (empty for a venue without a preset). The override, else the earliest reading. Pure.
 */
export function deadlinesInForce(
  own: readonly Deadline[],
  preset: readonly Reading[],
): readonly InForce[] {
  return DEADLINE_WHATS.flatMap((what) => {
    const d = oneInForce(
      what,
      own.find((x) => x.what === what),
      preset,
    );
    return d === null ? [] : [d];
  });
}

/** One instant per kind, the earliest a layer holds for it, in the order of the kinds. */
type Layer = readonly { readonly what: DeadlineWhat; readonly at: Instant }[];

const layerOf = (entries: Layer): Layer =>
  DEADLINE_WHATS.flatMap((what) => {
    const ats = entries.filter((e) => e.what === what).map((e) => e.at);
    const first = ats.toSorted()[0];
    return first === undefined ? [] : [{ what, at: first }];
  });

/** The pairs of a layer out of the order registration ≤ submission ≤ resubmission < notification < camera-ready. */
const inversions = (
  layer: Layer,
  says: (what: DeadlineWhat, at: Instant, later: boolean) => string,
): readonly string[] =>
  layer.flatMap((d, i) => {
    const before = layer[i - 1];
    return before !== undefined && before.at > d.at
      ? [
          `${says(before.what, before.at, false)} is after ${says(d.what, d.at, true)}`,
        ]
      : [];
  });

const readingsOf = (
  own: readonly Deadline[],
  preset: readonly Reading[],
  source: DeadlineSource,
): Layer => [
  ...preset.filter((r) => r.source === source),
  ...own.flatMap((d) =>
    d.observed
      .filter((o) => o.source === source)
      .map((o) => ({ what: d.what, at: o.at })),
  ),
];

/**
 * The deadlines out of order WITHIN one source — the portal's readings, the call's, the overrides —
 * the shape a date typed wrong or an AoE day miscounted takes. Across sources a disagreement is what
 * the record holds, and the earlier binds; it is not a problem. Pure.
 */
export function deadlineOrderProblems(
  own: readonly Deadline[],
  preset: readonly Reading[],
): readonly string[] {
  const overrides = own.flatMap((d) =>
    d.override === null ? [] : [{ what: d.what, at: d.override.at }],
  );
  return [
    ...inversions(
      layerOf(readingsOf(own, preset, "portal")),
      (w, at, later) => `${later ? "its" : "the portal's"} "${w}" (${at})`,
    ),
    ...inversions(
      layerOf(readingsOf(own, preset, "call")),
      (w, at, later) => `${later ? "its" : "the call's"} "${w}" (${at})`,
    ),
    ...inversions(
      layerOf(overrides),
      (w, at) => `the override of "${w}" (${at})`,
    ),
  ];
}
