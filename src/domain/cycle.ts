/**
 * THE CYCLE — one attempt of a paper at one venue: where it goes, as what kind, when the attempt was
 * decided, the venue's deadlines as they were read, which submission on the portal is this paper's,
 * and how the attempt ended. A paper's `paperlint.json` holds them as a LIST, `cycles`, oldest first:
 *
 *   {
 *     "id": "beta-2027",
 *     "venue": { "kind": "preset", "extends": "paperlint:beta" },   // or { "kind": "named", "name", "url" }
 *     "kind": "technical",
 *     "opened": "2026-09-09",
 *     "phase": "porting",                                             // default "prepared"
 *     "deadlines": [{ "what": "submission", "at": "2026-10-20T04:00:00Z", "source": "portal", "url": "…" }],
 *     "submission": { "id": 7 },
 *     "outcome": { "kind": "open" }
 *   }
 *
 * ── WHY A LIST OF ATTEMPTS, NOT ONE VENUE ───────────────────────────────────────────────
 * A paper goes to a venue, is rejected, and goes to the next one; the settings that every reader
 * takes from the file — `extends`, `kind`, `submission` — are the CURRENT attempt's, and change
 * together when the attempt changes. Held flat, they lag the decision (the preset is switched "when
 * the port lands", weeks later) and the decision itself has no field, so it is written as a comment.
 * Here it is a record: the new attempt is a new entry, the old one gets its `outcome`.
 *
 * ── THE PHASE, and why it is DECLARED ────────────────────────────────────────────────────
 * The day a new venue is chosen, the source is still in the old venue's template. The venue's format
 * checks are then not wrong, but not applicable: a page count under the wrong template says nothing
 * about the new limit. `"phase": "porting"` says the port is open work; the format rules are silent
 * under it, and `cycle/port-done` fires when the class line already matches the venue's template
 * and the phase still says porting. The declaration cannot lie for long in either direction, and it
 * is a record of work, not a softer severity. Absent, the phase is `prepared`.
 *
 * ── THE DEADLINE SAYS WHERE IT WAS READ ───────────────────────────────────────────────────
 * The portal refuses uploads; the call only announces. The two differ (an AoE date in a call is a
 * day after the portal's UTC instant), so a deadline carries its `source` and `url`, and `at` is an
 * INSTANT with its zone, never a bare date. `instantOf` does the one piece of arithmetic a call
 * needs: `YYYY-MM-DD AoE` is the end of that day at UTC−12.
 *
 * Parsed by hand: the domain imports no schema library (see `src/CLAUDE.md`).
 */
import { err, ok, type Result } from "./result.ts";
import { fieldOf, isRecord } from "./record.ts";

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
export const DEADLINE_WHATS: readonly DeadlineWhat[] = [
  "registration",
  "submission",
  "resubmission",
  "notification",
  "camera-ready",
];

export type DeadlineSource = "portal" | "call";

/** One deadline, and where it was read. */
export interface Deadline {
  readonly what: DeadlineWhat;
  readonly at: Instant;
  readonly source: DeadlineSource;
  readonly url: string;
}

/** The venue of an attempt: a preset paperlint resolves, or a venue named by hand (no preset yet). */
export type CycleVenue =
  | { readonly kind: "preset"; readonly extends: string }
  | { readonly kind: "named"; readonly name: string; readonly url: string };

/** How an attempt ended; `open` while it has not. */
export type Outcome =
  | { readonly kind: "open" }
  | {
      readonly kind: "accepted";
      readonly date: IsoDate;
      readonly evidence: string;
    }
  | {
      readonly kind: "rejected";
      readonly date: IsoDate;
      readonly evidence: string;
      /** A desk rejection (format, scope) — different work follows than after reviews. */
      readonly desk: boolean;
    }
  | {
      readonly kind: "withdrawn";
      readonly date: IsoDate;
      readonly evidence: string;
    };
export const OUTCOME_KINDS: readonly Outcome["kind"][] = [
  "open",
  "accepted",
  "rejected",
  "withdrawn",
];

export type Phase = "porting" | "prepared";

export interface Cycle {
  /** What a stage refers to (`stages[].cycle`): unique in the list. */
  readonly id: string;
  readonly venue: CycleVenue;
  /** A key of the preset's `format.kinds`; null when the venue has one kind or none is chosen. */
  readonly kind: string | null;
  /** The day this attempt was decided: the rows of the scorecard are judged against it. */
  readonly opened: IsoDate;
  readonly phase: Phase;
  readonly deadlines: readonly Deadline[];
  /** Which submission on the venue's portal is this paper's; null before one exists. */
  readonly submission: { readonly id: number } | null;
  readonly outcome: Outcome;
}

/** Which attempt the paper is on. */
export type Current =
  | { readonly kind: "cycle"; readonly cycle: Cycle }
  /** The last cycle is closed and none is open: between venues. */
  | { readonly kind: "parked"; readonly last: Cycle }
  /** `cycles: []`. */
  | { readonly kind: "none" };

/** Why a list of cycles names no current attempt. */
export type CycleProblem =
  | { readonly kind: "two-open"; readonly ids: readonly string[] }
  | { readonly kind: "open-not-last"; readonly id: string }
  | { readonly kind: "duplicate-id"; readonly id: string };

// ── parsing ────────────────────────────────────────────────────────────────────────────

const KNOWN_KEYS: readonly string[] = [
  "id",
  "venue",
  "kind",
  "opened",
  "phase",
  "deadlines",
  "submission",
  "outcome",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (v: unknown): v is IsoDate =>
  typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

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
    const day = aoe[1] ?? "";
    // The end of that day at UTC−12: 23:59:59 there is 11:59:59 UTC of the next day.
    const ms = Date.parse(`${day}T23:59:59-12:00`);
    return Number.isNaN(ms) ? bad : ok(asInstant(ms));
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(text))
    return bad;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? bad : ok(asInstant(ms));
}

const asInstant = (ms: number): Instant =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const where = (i: number): string => `cycles[${String(i)}]`;

function parseVenue(v: unknown, at: string): Result<CycleVenue, string> {
  const bad = err(
    `${at}: "venue" must be { "kind": "preset", "extends": … } or { "kind": "named", "name": …, "url": … }`,
  );
  if (!isRecord(v)) return bad;
  const kind = v["kind"];
  const ext = v["extends"];
  if (kind === "preset" && typeof ext === "string" && ext !== "")
    return ok({ kind: "preset", extends: ext });
  const name = v["name"];
  const url = v["url"];
  if (
    kind === "named" &&
    typeof name === "string" &&
    name !== "" &&
    typeof url === "string" &&
    url !== ""
  )
    return ok({ kind: "named", name, url });
  return bad;
}

const isWhat = (v: unknown): v is DeadlineWhat =>
  DEADLINE_WHATS.some((w) => w === v);

function parseDeadline(v: unknown, at: string): Result<Deadline, string> {
  if (!isRecord(v))
    return err(`${at}: a deadline must be { "what", "at", "source", "url" }`);
  const what = v["what"];
  if (!isWhat(what))
    return err(
      `${at}: "what" must be one of ${DEADLINE_WHATS.join(", ")}, got ${JSON.stringify(what)}`,
    );
  const atText = v["at"];
  const instant =
    typeof atText === "string" ? instantOf(atText) : err("not a string");
  if (!instant.ok)
    return err(
      `${at}: "at" must be an instant with its zone (2026-10-20T04:00:00Z), got ${JSON.stringify(atText)}`,
    );
  const source = v["source"];
  if (source !== "portal" && source !== "call")
    return err(
      `${at}: "source" must be "portal" or "call", got ${JSON.stringify(source)}`,
    );
  const url = v["url"];
  if (typeof url !== "string" || url === "")
    return err(`${at}: "url" must be where the deadline was read`);
  return ok({ what, at: instant.value, source, url });
}

function parseDeadlines(
  v: unknown,
  at: string,
): Result<readonly Deadline[], string> {
  if (v === undefined) return ok([]);
  if (!Array.isArray(v)) return err(`${at}: "deadlines" must be a list`);
  return v.reduce<Result<readonly Deadline[], string>>((acc, d: unknown, i) => {
    if (!acc.ok) return acc;
    const p = parseDeadline(d, `${at}.deadlines[${String(i)}]`);
    return p.ok ? ok([...acc.value, p.value]) : p;
  }, ok([]));
}

const isOutcomeKind = (v: unknown): v is Outcome["kind"] =>
  OUTCOME_KINDS.some((k) => k === v);

/** A decision's shape by kind: `rejected` also says whether it was a desk rejection. */
const decisionOf = (
  kind: Exclude<Outcome["kind"], "open">,
  decided: { readonly date: IsoDate; readonly evidence: string },
  desk: unknown,
  at: string,
): Result<Outcome, string> => {
  switch (kind) {
    case "accepted":
      return ok({ kind, ...decided });
    case "withdrawn":
      return ok({ kind, ...decided });
    case "rejected":
      return typeof desk === "boolean" || desk === undefined
        ? ok({ kind, ...decided, desk: desk === true })
        : err(`${at}: "outcome.desk" must be true or false`);
  }
};

function parseOutcome(v: unknown, at: string): Result<Outcome, string> {
  const kind = fieldOf(v, "kind");
  if (!isRecord(v) || !isOutcomeKind(kind))
    return err(
      `${at}: "outcome" kind must be one of ${OUTCOME_KINDS.join(", ")}, got ${JSON.stringify(kind)}`,
    );
  if (kind === "open") return ok({ kind });
  const date = v["date"];
  if (!isIsoDate(date))
    return err(`${at}: "outcome" of kind ${kind} needs "date" (YYYY-MM-DD)`);
  const evidence = v["evidence"];
  if (typeof evidence !== "string" || evidence === "")
    return err(
      `${at}: "outcome" of kind ${kind} needs "evidence": a file in the paper folder (the decision mail, the reviews, the note that records the withdrawal)`,
    );
  return decisionOf(kind, { date, evidence }, v["desk"], at);
}

function parseSubmission(
  v: unknown,
  at: string,
): Result<{ readonly id: number } | null, string> {
  if (v === undefined || v === null) return ok(null);
  const id = fieldOf(v, "id");
  return typeof id === "number" && Number.isInteger(id) && id > 0
    ? ok({ id })
    : err(
        `${at}: "submission" must be { "id": <the submission number on the venue's portal> }`,
      );
}

/** The fields that say WHICH attempt this is: id, venue, kind, the day it opened, its phase. */
type Head = Pick<Cycle, "id" | "venue" | "kind" | "opened" | "phase">;

const isPhase = (v: unknown): v is Phase => v === "porting" || v === "prepared";

/** `kind`: a string, or null when absent — the venue has one kind, or none is chosen yet. */
const kindOf = (v: unknown): Result<string | null, string> =>
  v === undefined || v === null
    ? ok(null)
    : typeof v === "string"
      ? ok(v)
      : err('"kind" must be a string or null');

function parseHead(
  v: Readonly<Record<string, unknown>>,
  at: string,
): Result<Head, string> {
  const id = v["id"];
  if (typeof id !== "string" || id === "")
    return err(`${at}: "id" must be a non-empty string (what stages refer to)`);
  const venue = parseVenue(v["venue"], at);
  if (!venue.ok) return venue;
  const kind = kindOf(v["kind"]);
  if (!kind.ok) return err(`${at}: ${kind.error}`);
  const opened = v["opened"];
  if (!isIsoDate(opened))
    return err(
      `${at}: "opened" must be a date YYYY-MM-DD — the day this attempt was decided`,
    );
  const phase = v["phase"] ?? "prepared";
  if (!isPhase(phase))
    return err(`${at}: "phase" must be "porting" or "prepared"`);
  return ok({
    id,
    venue: venue.value,
    kind: kind.value,
    opened,
    phase,
  });
}

/** The fields that say how the attempt is going: deadlines, the submission, the outcome. */
type Tail = Pick<Cycle, "deadlines" | "submission" | "outcome">;

function parseTail(
  v: Readonly<Record<string, unknown>>,
  at: string,
): Result<Tail, string> {
  const deadlines = parseDeadlines(v["deadlines"], at);
  if (!deadlines.ok) return deadlines;
  const submission = parseSubmission(v["submission"], at);
  if (!submission.ok) return submission;
  const outcome = parseOutcome(v["outcome"] ?? { kind: "open" }, at);
  if (!outcome.ok) return outcome;
  return ok({
    deadlines: deadlines.value,
    submission: submission.value,
    outcome: outcome.value,
  });
}

function parseCycle(v: unknown, i: number): Result<Cycle, string> {
  const at = where(i);
  if (!isRecord(v)) return err(`${at} must be an object`);
  const unknown = Object.keys(v).find((k) => !KNOWN_KEYS.includes(k));
  if (unknown !== undefined)
    return err(
      `${at}: unknown key "${unknown}" — known keys: ${KNOWN_KEYS.join(", ")}`,
    );
  const head = parseHead(v, at);
  if (!head.ok) return head;
  const tail = parseTail(v, at);
  return tail.ok ? ok({ ...head.value, ...tail.value }) : tail;
}

/** A `cycles` value → the list, null when absent, or one line naming the entry and the key. Pure. */
export function parseCycles(
  v: unknown,
): Result<readonly Cycle[] | null, string> {
  if (v === undefined) return ok(null);
  if (!Array.isArray(v))
    return err(
      `"cycles" must be a LIST of attempts, oldest first — a paper can go to several venues`,
    );
  return v.reduce<Result<readonly Cycle[] | null, string>>(
    (acc, c: unknown, i) => {
      if (!acc.ok) return acc;
      const p = parseCycle(c, i);
      return p.ok ? ok([...(acc.value ?? []), p.value]) : p;
    },
    ok([]),
  );
}

// ── deriving ───────────────────────────────────────────────────────────────────────────

const isOpen = (c: Cycle): boolean => c.outcome.kind === "open";

/**
 * The attempt the paper is on. At most one cycle may be open, and it is the last: two open cycles is
 * dual submission or a cycle nobody closed, and both are refused by name. Pure.
 */
export function currentCycle(
  cycles: readonly Cycle[],
): Result<Current, CycleProblem> {
  const dup = cycles.find(
    (c, i) => cycles.findIndex((d) => d.id === c.id) !== i,
  );
  if (dup !== undefined) return err({ kind: "duplicate-id", id: dup.id });
  const open = cycles.filter(isOpen);
  if (open.length > 1)
    return err({ kind: "two-open", ids: open.map((c) => c.id) });
  const last = cycles.at(-1);
  if (last === undefined) return ok({ kind: "none" });
  const [only] = open;
  if (only !== undefined && only !== last)
    return err({ kind: "open-not-last", id: only.id });
  return ok(
    isOpen(last) ? { kind: "cycle", cycle: last } : { kind: "parked", last },
  );
}

/** One line for a problem, naming what to change. Pure. */
export function cycleProblemText(p: CycleProblem): string {
  switch (p.kind) {
    case "two-open":
      return `cycles ${p.ids.map((id) => `«${id}»`).join(" and ")} are both open — a paper is on one attempt at a time; two open attempts at two venues is dual submission. Close the one that ended: "outcome": { "kind": "rejected" | "withdrawn" | "accepted", "date", "evidence" }`;
    case "open-not-last":
      return `cycle «${p.id}» is open but is not the last entry — cycles are listed oldest first, and the open one is the current attempt`;
    case "duplicate-id":
      return `two cycles carry the id «${p.id}» — a stage's \`cycle:\` could name either; give each attempt its own id`;
  }
}

const ORDER: readonly DeadlineWhat[] = DEADLINE_WHATS;

/**
 * A deadline recorded twice, and each pair out of the order registration ≤ submission ≤ resubmission
 * < notification < camera-ready — the shape a typo in a date or an AoE day miscounted takes. Pure.
 */
export function deadlineOrderProblems(
  deadlines: readonly Deadline[],
): readonly string[] {
  const twice = ORDER.filter(
    (w) => deadlines.filter((d) => d.what === w).length > 1,
  ).map((w) => `the "${w}" deadline is recorded twice`);
  const byWhat = (w: DeadlineWhat): Deadline | undefined =>
    deadlines.find((d) => d.what === w);
  const present = ORDER.map(byWhat).filter(
    (d): d is Deadline => d !== undefined,
  );
  const inversions = present.flatMap((d, i) => {
    const earlier = present[i - 1];
    return earlier !== undefined && earlier.at > d.at
      ? [
          `the "${earlier.what}" deadline (${earlier.at}) is after the "${d.what}" deadline (${d.at})`,
        ]
      : [];
  });
  return [...twice, ...inversions];
}

/** The cycle a `Current` stands on: the open one, or the last closed one; null for none. */
export const cycleOf = (c: Current): Cycle | null => {
  switch (c.kind) {
    case "cycle":
      return c.cycle;
    case "parked":
      return c.last;
    case "none":
      return null;
  }
};

/**
 * Whether the paper is judged as a blind submission: the venue reviews blind, and this attempt has
 * not been accepted — an accepted paper's camera-ready carries its authors. Pure.
 */
export const effectiveBlind = (
  venueBlind: boolean,
  current: Current,
): boolean => venueBlind && cycleOf(current)?.outcome.kind !== "accepted";

/** Whether the current attempt declares its port to the venue's template as open work. */
export const isPorting = (current: Current): boolean =>
  current.kind === "cycle" && current.cycle.phase === "porting";
