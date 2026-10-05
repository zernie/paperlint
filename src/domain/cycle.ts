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
 *     "deadlines": [{ "what": "submission", "observed": [{ "at": "2026-10-23 AoE", "source": "call", "url": "…", "read": "2026-09-09" }] }],
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
 * ── THE DEADLINES ARE READINGS ───────────────────────────────────────────────────────────
 * Each deadline records what the portal and the call said, where and when, and an optional human
 * override; the earlier reading binds unless overridden (`deadline.ts`). For a venue with a preset,
 * the portal's readings come from the preset — updated with the package — and the paper adds the
 * call's readings and its overrides on top.
 *
 * Parsed by hand: the domain imports no schema library (see `src/CLAUDE.md`).
 */
import { err, ok, type Result } from "./result.ts";
import { fieldOf, isRecord } from "./record.ts";
import {
  isIsoDate,
  parseDeadlines,
  unknownKey,
  type Deadline,
  type IsoDate,
} from "./deadline.ts";

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

/**
 * Which attempt the paper is on. An ACCEPTED last cycle is not "parked": the paper lives on at that
 * venue — camera-ready, talk, proceedings — so its venue and kind stay the paper's.
 */
export type Current =
  | { readonly kind: "cycle"; readonly cycle: Cycle }
  | { readonly kind: "accepted"; readonly cycle: Cycle }
  /** The last cycle was rejected or withdrawn and none is open: between venues. */
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

const where = (i: number): string => `cycles[${String(i)}]`;

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v !== "";

const VENUE_KEYS = {
  preset: ["kind", "extends"],
  named: ["kind", "name", "url"],
} as const;

/** The fields of a venue of `kind`, when they are there. */
function venueFields(
  kind: CycleVenue["kind"],
  v: Readonly<Record<string, unknown>>,
): CycleVenue | null {
  const { extends: ext, name, url } = v;
  switch (kind) {
    case "preset":
      return nonEmpty(ext) ? { kind, extends: ext } : null;
    case "named":
      return nonEmpty(name) && nonEmpty(url) ? { kind, name, url } : null;
  }
}

/** The venue's own keys refused when unknown, then its shape; null when the kind is neither. */
function venueShape(
  v: Readonly<Record<string, unknown>>,
  at: string,
): Result<CycleVenue, string> | null {
  const kind = v["kind"];
  if (kind !== "preset" && kind !== "named") return null;
  const unknown = unknownKey(
    v,
    VENUE_KEYS[kind],
    `${at}.venue`,
    `a ${kind} venue's`,
  );
  if (unknown !== null) return err(unknown);
  const venue = venueFields(kind, v);
  return venue === null ? null : ok(venue);
}

function parseVenue(v: unknown, at: string): Result<CycleVenue, string> {
  const shaped = isRecord(v) ? venueShape(v, at) : null;
  return (
    shaped ??
    err(
      `${at}: "venue" must be { "kind": "preset", "extends": … } or { "kind": "named", "name": …, "url": … }`,
    )
  );
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

const OUTCOME_KEYS: Readonly<Record<Outcome["kind"], readonly string[]>> = {
  open: ["kind"],
  accepted: ["kind", "date", "evidence"],
  rejected: ["kind", "date", "evidence", "desk"],
  withdrawn: ["kind", "date", "evidence"],
};

function parseOutcome(v: unknown, at: string): Result<Outcome, string> {
  const kind = fieldOf(v, "kind");
  if (!isRecord(v) || !isOutcomeKind(kind))
    return err(
      `${at}: "outcome" kind must be one of ${OUTCOME_KINDS.join(", ")}, got ${JSON.stringify(kind)}`,
    );
  const unknown = unknownKey(
    v,
    OUTCOME_KEYS[kind],
    `${at}.outcome`,
    `${kind === "open" || kind === "accepted" ? "an" : "a"} ${kind} outcome's`,
  );
  if (unknown !== null) return err(unknown);
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
  const unknown = isRecord(v)
    ? unknownKey(v, ["id"], `${at}.submission`, "a submission's")
    : null;
  if (unknown !== null) return err(unknown);
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
  return v.reduce<Result<readonly Cycle[], string>>((acc, c: unknown, i) => {
    if (!acc.ok) return acc;
    const p = parseCycle(c, i);
    return p.ok ? ok([...acc.value, p.value]) : p;
  }, ok([]));
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
  if (isOpen(last)) return ok({ kind: "cycle", cycle: last });
  return ok(
    last.outcome.kind === "accepted"
      ? { kind: "accepted", cycle: last }
      : { kind: "parked", last },
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

/** A paper's `cycles`, parsed, with the attempt they name: minted only when the list is consistent. */
export interface Cycles {
  readonly list: readonly Cycle[];
  readonly current: Current;
}

/** The list with its current attempt, or why the list names none. Pure. */
export const cyclesOf = (
  list: readonly Cycle[],
): Result<Cycles, CycleProblem> => {
  const current = currentCycle(list);
  return current.ok ? ok({ list, current: current.value }) : current;
};

/**
 * The cycle whose venue and kind are the paper's: the open attempt, or the accepted one; null when
 * the paper is between venues or has none.
 */
export const venueCycleOf = (c: Current): Cycle | null => {
  switch (c.kind) {
    case "cycle":
      return c.cycle;
    case "accepted":
      return c.cycle;
    case "parked":
      return null;
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
): boolean => venueBlind && current.kind !== "accepted";

/** Whether the current attempt declares its port to the venue's template as open work. */
export const isPorting = (current: Current): boolean =>
  current.kind === "cycle" && current.cycle.phase === "porting";
