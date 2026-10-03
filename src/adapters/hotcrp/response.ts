/**
 * HotCRP's answers, parsed at the boundary into paperlint's submission values. Pure.
 *
 * Only the fields the command uses are read; every other key HotCRP sends is dropped here. The field
 * names are HotCRP's (`devel/openapi.json` and `devel/apidoc/submissions.md` in kohler/hotcrp):
 * `GET /api/paper` answers `{ ok, paper, message_list? }`, `POST /api/paper` answers
 * `{ ok, valid, change_list, message_list, dry_run?, pid }`. A document's `hash` is
 * `sha2-<64 hex>` when HotCRP stored a sha256; timestamps are Unix seconds.
 */
import { z } from "zod";
import { err, ok, type Result } from "../../domain/result.ts";
import { parseSha256, type Sha256 } from "../../domain/sha256.ts";
import type {
  PortalDocument,
  PortalFailure,
  PortalMessage,
  SubmissionView,
  UpdateOutcome,
} from "../../domain/submission.ts";

const Message = z.object({
  message: z.string().optional(),
  field: z.string().optional(),
  status: z.number().optional(),
});
const Messages = z.array(Message).optional();

const Document = z.object({
  hash: z.string().optional(),
  size: z.number().optional(),
  mimetype: z.string().optional(),
  timestamp: z.number().optional(),
});

const Paper = z.object({
  pid: z.number(),
  status: z.string(),
  title: z.string().optional(),
  abstract: z.string().optional(),
  paper_type: z.unknown().optional(),
  topics: z.array(z.string()).optional(),
  submission: Document.nullable().optional(),
  submitted_at: z.number().optional(),
  modified_at: z.number().optional(),
});

const ShowBody = z.object({
  ok: z.literal(true),
  paper: Paper,
  message_list: Messages,
});

const UpdateBody = z.object({
  valid: z.boolean(),
  change_list: z.array(z.string()).optional(),
  message_list: Messages,
  dry_run: z.boolean().optional(),
});

const Envelope = z.object({ message_list: Messages });

const SHA2 = /^sha2-([0-9a-f]{64})$/;

/** HotCRP's `sha2-<hex>` → the sha256; null for any other hash it may name. */
export function sha256OfHash(hash: string): Sha256 | null {
  const hex = SHA2.exec(hash)?.[1];
  return hex === undefined ? null : parseSha256(hex);
}

/** HotCRP prefixes a message with its format (`<0>` plain text, `<5>` HTML); the text is the rest. */
const textOf = (message: string | undefined): string =>
  (message ?? "").replace(/^<\d+>/, "").trim();

/** The messages that say something: HotCRP also sends entries with no text, which print as blanks. */
const messagesOf = (
  list: Readonly<z.infer<typeof Messages>>,
): readonly PortalMessage[] =>
  (list ?? [])
    .map((m) => ({
      message: textOf(m.message),
      field: m.field ?? null,
      status: m.status ?? null,
    }))
    .filter((m) => m.message !== "");

const documentOf = (
  d: Readonly<z.infer<typeof Document>> | null | undefined,
): PortalDocument | null =>
  d?.hash === undefined
    ? null
    : {
        sha256: sha256OfHash(d.hash),
        hash: d.hash,
        size: d.size ?? null,
        mimetype: d.mimetype ?? null,
        uploadedAt: d.timestamp ?? null,
      };

/** A paper type as text: HotCRP sends the option's name, or a value of another shape. */
const typeText = (v: unknown): string | null =>
  v === undefined || v === null
    ? null
    : typeof v === "string"
      ? v
      : JSON.stringify(v);

function viewOf(b: Readonly<z.infer<typeof ShowBody>>): SubmissionView {
  const p = b.paper;
  return {
    id: p.pid,
    status: p.status,
    title: p.title ?? null,
    paperType: typeText(p.paper_type),
    topics: p.topics ?? [],
    abstract: p.abstract ?? null,
    pdf: documentOf(p.submission),
    submittedAt: p.submitted_at ?? null,
    modifiedAt: p.modified_at ?? null,
    messages: messagesOf(b.message_list),
  };
}

const is2xx = (status: number): boolean => status >= 200 && status < 300;

const StatusCode = z.object({ status_code: z.number() });

/**
 * The status HotCRP meant. Its error envelope repeats the status in the body (`status_code: 401`
 * beside `ok: false`, recorded in `cassette/get-noauth.json`); when something between us and HotCRP
 * turns the transport status into a 2xx, the body's code still decides.
 */
function statusOf(transport: number, body: unknown): number {
  const c = StatusCode.safeParse(body);
  return is2xx(transport) && c.success ? c.data.status_code : transport;
}

/** A body that is no answer of HotCRP's: the portal's messages when it sent any, else "malformed". */
function refusal(
  httpStatus: number,
  body: unknown,
  what: string,
): PortalFailure {
  const e = Envelope.safeParse(body);
  const messages = e.success ? messagesOf(e.data.message_list) : [];
  return messages.length > 0 || !is2xx(httpStatus)
    ? { kind: "refused", httpStatus, messages }
    : { kind: "malformed", httpStatus, detail: what };
}

/** `GET /api/paper` → the submission, or why there is none. */
export function parseShow(
  httpStatus: number,
  body: unknown,
): Result<SubmissionView, PortalFailure> {
  const status = statusOf(httpStatus, body);
  const b = ShowBody.safeParse(body);
  return b.success && is2xx(status)
    ? ok(viewOf(b.data))
    : err(refusal(status, body, "the answer has no submission in `paper`"));
}

/**
 * `POST /api/paper` → the outcome, valid or not. A body carrying `valid` is HotCRP's verdict on
 * the change whatever the HTTP status; the caller decides the exit from both.
 */
export function parseUpdate(
  httpStatus: number,
  body: unknown,
): Result<UpdateOutcome, PortalFailure> {
  const status = statusOf(httpStatus, body);
  const b = UpdateBody.safeParse(body);
  if (!b.success)
    return err(refusal(status, body, "the answer has no `valid`"));
  return ok({
    httpStatus: status,
    valid: b.data.valid,
    changes: b.data.change_list ?? [],
    messages: messagesOf(b.data.message_list),
    dryRun: b.data.dry_run ?? false,
  });
}
