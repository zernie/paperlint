/**
 * A PRESET'S PORTAL READINGS AGAINST WHAT THE PORTAL'S PAGE SAYS NOW — the comparison the scheduled
 * refresh of the shipped presets makes (`main.ts` beside this file). Pure.
 *
 *   a kind the page lists at the instant the preset holds   kept as it is, its `read` day too
 *   a kind the page lists at another instant                rewritten, `read` = today
 *   a kind the page lists that the preset does not hold     added, `read` = today
 *   a kind the preset holds that the page no longer lists   KEPT and noted — a portal may drop a
 *                                                           passed deadline; the reading stays true
 *   a reading from the call                                 never touched: it is not the portal's
 */
import {
  DEADLINE_WHATS,
  type DeadlineWhat,
  type IsoDate,
  type PortalDeadlines,
  type Reading,
} from "../../src/domain/deadline.ts";

/** The preset's readings after the page's answer, what changed, and what is worth a note. */
export interface Refreshed {
  readonly readings: readonly Reading[];
  readonly changes: readonly string[];
  readonly notes: readonly string[];
}

/** The page's instants for one kind, earliest first. */
const pageAts = (
  page: PortalDeadlines,
  what: DeadlineWhat,
): readonly string[] =>
  page.deadlines
    .filter((d) => d.what === what)
    .map((d) => d.at)
    .toSorted();

/** A kind the page does not list: the preset's reading, if it holds one, is kept and noted. */
const offThePage = (
  what: DeadlineWhat,
  held: Reading | undefined,
): Refreshed =>
  held === undefined
    ? { readings: [], changes: [], notes: [] }
    : {
        readings: [held],
        changes: [],
        notes: [`${what}: no longer on the page — kept as read ${held.read}`],
      };

/** One kind: the preset's portal reading against the page's. */
function oneKind(
  what: DeadlineWhat,
  held: Reading | undefined,
  ats: readonly string[],
  o: { readonly url: string; readonly today: IsoDate },
): Refreshed {
  const notes =
    ats.length > 1
      ? [`${what}: the page lists ${ats.join(", ")} — the earliest is recorded`]
      : [];
  const at = ats[0];
  if (at === undefined) return offThePage(what, held);
  if (held?.at === at) return { readings: [held], changes: [], notes };
  const fresh: Reading = {
    what,
    at,
    source: "portal",
    url: o.url,
    read: o.today,
  };
  const change =
    held === undefined ? `${what}: added ${at}` : `${what}: ${held.at} → ${at}`;
  return { readings: [fresh], changes: [change], notes };
}

/**
 * The preset's readings after the portal answered `page` at `url` on `today`. The call's readings
 * are kept as they are; the portal's are kept, rewritten or added kind by kind. Pure.
 */
export function refreshReadings(
  current: readonly Reading[],
  page: PortalDeadlines,
  url: string,
  today: IsoDate,
): Refreshed {
  const perKind = DEADLINE_WHATS.map((what) => {
    const portal = oneKind(
      what,
      current.find((r) => r.what === what && r.source === "portal"),
      pageAts(page, what),
      { url, today },
    );
    const call = current.filter((r) => r.what === what && r.source === "call");
    return { ...portal, readings: [...portal.readings, ...call] };
  });
  return {
    readings: perKind.flatMap((k) => k.readings),
    changes: perKind.flatMap((k) => k.changes),
    notes: perKind.flatMap((k) => k.notes),
  };
}
