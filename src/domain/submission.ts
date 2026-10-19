/**
 * THE SUBMISSION ON A CONFERENCE PORTAL — what `paperlint submission` reads and changes.
 *
 * Two declarations, each in the file that owns the fact:
 *
 *   venue preset `portal`        where the venue takes submissions: `{ "kind": "hotcrp", "url": … }`
 *   paper `submission`           which submission on that portal is this paper's: `{ "id": 7 }`
 *
 * The values here are the portal's answers in paperlint's words, not in any one portal's: an adapter
 * per portal kind maps its API onto them (`src/adapters/hotcrp/`).
 */
import { err, ok, type Result } from "./result.ts";
import { isRecord } from "./record.ts";
import type { Sha256 } from "./sha256.ts";

/** The portal kinds an adapter exists for. Any other kind is refused by name. */
export type PortalKind = "hotcrp";
export const PORTAL_KINDS: readonly PortalKind[] = ["hotcrp"];

/** A venue preset's `portal`, as the preset declares it: the kind is checked where it is used. */
export interface VenuePortal {
  readonly kind: string;
  /** The portal site's base URL, without a trailing slash. */
  readonly url: string;
}

/** A portal whose kind has an adapter. */
export interface SupportedPortal {
  readonly kind: PortalKind;
  readonly url: string;
}

const isPortalKind = (k: string): k is PortalKind =>
  PORTAL_KINDS.some((x) => x === k);

/** The declared portal → one paperlint can talk to, or the refusal naming the kind. Pure. */
export function supportedPortal(
  p: VenuePortal,
): Result<SupportedPortal, string> {
  return isPortalKind(p.kind)
    ? ok({ kind: p.kind, url: p.url.replace(/\/+$/, "") })
    : err(`portal kind "${p.kind}" is not supported; upload by hand`);
}

/** A paper's `submission`: which submission on the venue's portal is this paper's. */
export interface PaperSubmission {
  readonly id: number;
}

/** A paper's `submission` key → the value, null when absent, or one line saying what is wrong. Pure. */
export function parsePaperSubmission(
  v: unknown,
): Result<PaperSubmission | null, string> {
  if (v === undefined) return ok(null);
  const bad = err(
    `"submission" must be { "id": <the submission number on the venue's portal> }`,
  );
  if (!isRecord(v)) return bad;
  const unknown = Object.keys(v).find((k) => k !== "id");
  if (unknown !== undefined)
    return err(`"submission" has an unknown key "${unknown}" — known: id`);
  const id = v["id"];
  return typeof id === "number" && Number.isInteger(id) && id > 0
    ? ok({ id })
    : bad;
}

/** The PDF the portal holds for a submission. */
export interface PortalDocument {
  /** The sha256 of the stored bytes; null when the portal names another hash or none. */
  readonly sha256: Sha256 | null;
  /** The hash as the portal spells it. */
  readonly hash: string;
  readonly size: number | null;
  readonly mimetype: string | null;
  /** Unix seconds; null when the portal does not say. */
  readonly uploadedAt: number | null;
}

/** One submission, as the portal shows it to its author. */
export interface SubmissionView {
  readonly id: number;
  readonly status: string;
  readonly title: string | null;
  readonly paperType: string | null;
  readonly topics: readonly string[];
  readonly abstract: string | null;
  /** The PDF the portal holds; null when none is uploaded. */
  readonly pdf: PortalDocument | null;
  /** Unix seconds; null when not submitted or not said. */
  readonly submittedAt: number | null;
  readonly modifiedAt: number | null;
  /** What the portal said beside the answer. */
  readonly messages: readonly PortalMessage[];
}

/** A change to send. Every absent part is left as the portal has it. */
export interface SubmissionChange {
  readonly pdf: { readonly name: string; readonly bytes: Uint8Array } | null;
  readonly abstract: string | null;
  /** Mark the submission submitted (ready for review). */
  readonly submit: boolean;
}

/** One message from the portal: its text, and the field it is about when it names one. */
export interface PortalMessage {
  readonly message: string;
  readonly field: string | null;
  /** The portal's severity number, when it gives one. */
  readonly status: number | null;
}

/** What the portal answered to a change. */
export interface UpdateOutcome {
  readonly httpStatus: number;
  /** The change is valid; for a saved change, it was also committed. */
  readonly valid: boolean;
  /** The fields the change touched. */
  readonly changes: readonly string[];
  readonly messages: readonly PortalMessage[];
  /** The portal reports that nothing was saved. */
  readonly dryRun: boolean;
}

/** Why the portal gave no usable answer. */
export type PortalFailure =
  | {
      readonly kind: "refused";
      readonly httpStatus: number;
      readonly messages: readonly PortalMessage[];
    }
  | { readonly kind: "unreachable"; readonly detail: string }
  | {
      readonly kind: "malformed";
      readonly httpStatus: number;
      readonly detail: string;
    };

/** Words in a text, as a reader counts them: runs of non-space. Pure. */
export const wordCount = (s: string): number =>
  s.split(/\s+/).filter((w) => w !== "").length;

// ── a new submission ────────────────────────────────────────────────────────────────────

/** One author as the portal records it. Never guessed: the paper's `authors` key declares it. */
export interface Author {
  readonly name: string;
  readonly email: string;
  /** Null when the paper does not declare one. */
  readonly affiliation: string | null;
}

const AUTHOR_KEYS = ["name", "email", "affiliation"] as const;
const AUTHORS_SHAPE = `"authors" must be a non-empty list of { "name": "<as the portal should show it>", "email": "<the address the portal knows the author by>", "affiliation"?: "<…>" }, in the paper's order`;

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

/** One entry of `authors` → the author, or what is wrong with it. */
function authorOf(v: unknown, i: number): Result<Author, string> {
  const at = `"authors"[${String(i)}]`;
  if (!isRecord(v)) return err(AUTHORS_SHAPE);
  const unknown = Object.keys(v).find((k) => !AUTHOR_KEYS.some((a) => a === k));
  if (unknown !== undefined)
    return err(
      `${at} has an unknown key "${unknown}" — known: ${AUTHOR_KEYS.join(", ")}`,
    );
  const { name, email, affiliation } = v;
  if (!nonEmpty(name)) return err(`${at}: "name" must be a non-empty string`);
  if (!nonEmpty(email) || !/^[^\s@]+@[^\s@]+$/.test(email.trim()))
    return err(
      `${at}: "email" must be an email address, got ${JSON.stringify(email)}`,
    );
  if (affiliation !== undefined && !nonEmpty(affiliation))
    return err(`${at}: "affiliation", when given, must be a non-empty string`);
  return ok({
    name: name.trim(),
    email: email.trim(),
    affiliation: affiliation === undefined ? null : affiliation.trim(),
  });
}

/** A paper's `authors` key → the list, null when absent, or one line saying what is wrong. Pure. */
export function parsePaperAuthors(
  v: unknown,
): Result<readonly Author[] | null, string> {
  if (v === undefined) return ok(null);
  if (!Array.isArray(v) || v.length === 0) return err(AUTHORS_SHAPE);
  const list: readonly unknown[] = v;
  const parsed = list.map(authorOf);
  const bad = parsed.find((r) => !r.ok);
  if (bad !== undefined && !bad.ok) return bad;
  const authors = parsed.flatMap((r) => (r.ok ? [r.value] : []));
  const emails = authors.map((a) => a.email.toLowerCase());
  const twice = emails.find((e, i) => emails.indexOf(e) !== i);
  return twice === undefined
    ? ok(authors)
    : err(`"authors": the email ${twice} is given twice`);
}

/** What creating a submission sends. */
export interface NewSubmission {
  readonly title: string;
  readonly abstract: string;
  readonly authors: readonly Author[];
  readonly pdf: { readonly name: string; readonly bytes: Uint8Array };
}

/** What the portal answered to a creation: an update's answer, and the id it chose when it saved. */
export interface CreateOutcome extends UpdateOutcome {
  /** The new submission's id; null on a dry run, or when nothing was created. */
  readonly id: number | null;
}

/**
 * The parsed `paperlint.json` with the new submission's id recorded where the paper's submission is
 * read from: the last cycle (the open attempt) in the cycles form, the top level in the flat form.
 * Pure; the caller writes the result and reads it back.
 */
export function withSubmissionId(
  json: unknown,
  id: number,
): Result<Readonly<Record<string, unknown>>, string> {
  if (!isRecord(json)) return err("must be a JSON object");
  const cycles = json["cycles"];
  if (cycles === undefined) return ok({ ...json, submission: { id } });
  if (!Array.isArray(cycles) || cycles.length === 0)
    return err(`"cycles" has no attempt to record the submission in`);
  const list: readonly unknown[] = cycles;
  const last = list.at(-1);
  return isRecord(last)
    ? ok({
        ...json,
        cycles: [...list.slice(0, -1), { ...last, submission: { id } }],
      })
    : err(`the last entry of "cycles" is not an object`);
}
