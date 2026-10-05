/**
 * HotCRP's deadlines page (`<site>/deadlines`), parsed at the boundary into paperlint's
 * `PortalDeadlines`. Pure.
 *
 * ── WHAT THE PAGE IS, measured 2026-10-05 on five live sites (`cassette/deadlines-*.html`) ───────
 * The page is HTML, public, no account needed; the API endpoint of the same name (`/api/deadlines`)
 * answers 401 «Missing credentials» without a token. The machine-readable part is the argument of
 * `hotcrp.init_deadlines({…})` in the page's last script: the author's `status_json()`
 * (kohler/hotcrp, src/contact.php), of which an anonymous visitor gets
 *
 *   now            the server's clock, Unix seconds with a fraction
 *   sub.open       whether the submission round is open now
 *   sub.sub        the submission deadline, Unix seconds           (SubmissionRound::$submit)
 *   sub.reg        the registration deadline, when it is earlier   (SubmissionRound::$register)
 *   sub.blind      true | "optional" | "until-review"              (Conf::submission_blindness)
 *   final.done     the final-version (camera-ready) deadline       (final_deadline_for_display)
 *
 * The RESUBMISSION deadline (updates allowed until, `SubmissionRound::$resubmit`) is not in that
 * object; the page lists it only in its `<dl>`, each entry a `<dt>` with the deadline's label and a
 * `<span data-ts="…">` holding the same Unix seconds (pages/p_deadlines.php, `dl1`). So both are
 * read: the JSON for what it names, the list for every deadline the page shows, matched by label.
 */
import { z } from "zod";
import {
  instantOfUnix,
  type DeadlineWhat,
  type PortalDeadline,
  type PortalDeadlines,
} from "../../domain/deadline.ts";
import { err, ok, type Result } from "../../domain/result.ts";
import type { PortalFailure } from "../../domain/submission.ts";

const Blind = z.union([
  z.boolean(),
  z.literal("optional"),
  z.literal("until-review"),
]);
const Status = z.looseObject({
  now: z.number(),
  sub: z
    .looseObject({
      open: z.boolean().optional(),
      sub: z.number().optional(),
      reg: z.number().optional(),
      blind: Blind.optional(),
    })
    .optional(),
  final: z.looseObject({ done: z.number().optional() }).optional(),
});

/** The script call that carries the status object; the argument is JSON. */
const INIT = /hotcrp\.init_deadlines\((\{.*?\})\)/s;
/** One listed deadline: its label in `<strong>`, its time in `data-ts`. */
const ENTRY = /<dt><strong>([^<]*)<\/strong>:\s*<span[^>]*\bdata-ts="(\d+)"/g;
/** The page's title, for a page that is no deadlines page (a site that does not exist). */
const TITLE = /<h1 id="h-title">([^<]*)</;

/** What a listed deadline's label names, in paperlint's words; null for one paperlint does not name. */
export function whatOf(label: string): DeadlineWhat | null {
  const l = label.toLowerCase();
  if (/\bresubmission deadline\b/.test(l)) return "resubmission";
  if (/\bregistration deadline\b/.test(l)) return "registration";
  if (/\bsubmission deadline\b/.test(l)) return "submission";
  if (/\bfinal\b|\bcamera[- ]ready\b/.test(l)) return "camera-ready";
  return null;
}

/** The deadlines the status object names, each with the label the page would give it. */
type StatusJson = Readonly<z.infer<typeof Status>>;

function fromStatus(s: StatusJson): readonly PortalDeadline[] {
  const named: readonly (readonly [DeadlineWhat, number | undefined])[] = [
    ["registration", s.sub?.reg],
    ["submission", s.sub?.sub],
    ["camera-ready", s.final?.done],
  ];
  return named.flatMap(([what, at]) =>
    at === undefined ? [] : [{ what, label: what, at: instantOfUnix(at) }],
  );
}

/** Every deadline the page lists, with its label as the page spells it. */
function fromList(html: string): readonly PortalDeadline[] {
  return [...html.matchAll(ENTRY)].map((m) => {
    // Both groups always participate in a match of ENTRY: there is no fallback to take.
    const label = String(m[1]).trim();
    return { what: whatOf(label), label, at: instantOfUnix(Number(m[2])) };
  });
}

/** Listed entries first (they carry the page's label); a status entry only when the list lacks its kind. */
function merged(
  listed: readonly PortalDeadline[],
  named: readonly PortalDeadline[],
): readonly PortalDeadline[] {
  const extra = named.filter(
    (n) => !listed.some((l) => l.what === n.what && l.at === n.at),
  );
  return [...listed, ...extra].toSorted((a, b) => a.at.localeCompare(b.at));
}

const refused = (httpStatus: number, html: string): PortalFailure => {
  const title = TITLE.exec(html)?.[1]?.trim();
  return {
    kind: "refused",
    httpStatus,
    messages:
      title === undefined
        ? []
        : [{ message: title, field: null, status: null }],
  };
};

/** The status object in the page's `init_deadlines` call, or why there is none. */
function statusOf(
  httpStatus: number,
  html: string,
): Result<StatusJson, PortalFailure> {
  const m = INIT.exec(html);
  if (m === null)
    return err({
      kind: "malformed",
      httpStatus,
      detail:
        "the page has no `hotcrp.init_deadlines(…)` call — not a HotCRP deadlines page",
    });
  const json = ((): unknown => {
    try {
      return JSON.parse(String(m[1])); // the group always participates in a match of INIT
    } catch {
      return undefined;
    }
  })();
  const parsed = Status.safeParse(json);
  return parsed.success
    ? ok(parsed.data)
    : err({
        kind: "malformed",
        httpStatus,
        detail:
          "the `init_deadlines` argument is not the status object HotCRP documents",
      });
}

/** `GET /deadlines` → the portal's deadlines, or why the page is not them. */
export function parseDeadlinesPage(
  httpStatus: number,
  html: string,
): Result<PortalDeadlines, PortalFailure> {
  if (httpStatus < 200 || httpStatus >= 300)
    return err(refused(httpStatus, html));
  const status = statusOf(httpStatus, html);
  if (!status.ok) return status;
  const s = status.value;
  return ok({
    now: s.now,
    open: s.sub?.open ?? false,
    blind: s.sub?.blind ?? null,
    deadlines: merged(fromList(html), fromStatus(s)),
  });
}
