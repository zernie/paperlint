/**
 * HotCRP's REST API (`<site>/api/paper`) as the `SubmissionPortal` port, over Node's `fetch`.
 *
 * Read: `GET /api/paper?p=<id>&word_limit=hard` (scope `submeta:read`; `word_limit=hard` returns the
 * whole abstract instead of one cut at the soft limit).
 *
 * Change: `POST /api/paper?p=<id>` as multipart/form-data — a `json` field holding a submission
 * object, and the PDF as a file part whose field name is the object's `submission.content_file`
 * (the documented form: `curl -F "json=<data.json" -F paper.pdf=@paper.pdf SITEURL/api/paper`).
 * Without `save` the request carries `dry_run=1`: HotCRP checks the change and keeps nothing.
 *
 * 🔴 THE TOKEN goes in the `Authorization` header and nowhere else: not into a URL, a message, or an
 * error. A failure is described by HTTP status, HotCRP's own messages, or the network error's text.
 */
import { messageOf } from "../../domain/text.ts";
import { err, type Result } from "../../domain/result.ts";
import type {
  PortalFailure,
  SubmissionChange,
} from "../../domain/submission.ts";
import type { SubmissionPortal } from "../../ports/submission-portal.ts";
import { parseShow, parseUpdate } from "./response.ts";

/**
 * The form field the PDF travels in, and the name the `json` object's `content_file` refers to it
 * by. 🔴 NO DOT, SPACE OR BRACKET: HotCRP looks the name up in PHP's `$_FILES`, and PHP renames a
 * dot or a space in a field name to `_`. The documented `-F paper.pdf=@paper.pdf` therefore arrives
 * as `paper_pdf`, the lookup of `paper.pdf` misses, and HotCRP answers "Ignored attempt to upload
 * document without any content" with `valid: false` — measured on a real HotCRP, 2026-10-03.
 */
export const CONTENT_FIELD = "paperlint_pdf";

/** Uploads take a while on a slow link; a read should not. */
const READ_TIMEOUT_MS = 60_000;
const WRITE_TIMEOUT_MS = 300_000;

export interface HotcrpOptions {
  /** The site's base URL, no trailing slash: `https://example.org`. */
  readonly url: string;
  readonly token: string;
}

type Answer = Result<
  { readonly status: number; readonly body: unknown },
  PortalFailure
>;

/** One request → HTTP status and parsed JSON body, or why there is neither. */
async function call(
  url: string,
  init: { readonly method: string; readonly body?: Readonly<FormData> },
  token: string,
  timeoutMs: number,
): Promise<Answer> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    try {
      return { ok: true, value: { status: r.status, body: JSON.parse(text) } };
    } catch {
      return err({
        kind: "malformed",
        httpStatus: r.status,
        detail: `the answer is not JSON (${r.headers.get("content-type") ?? "no content type"})`,
      });
    }
  } catch (e) {
    return err({ kind: "unreachable", detail: messageOf(e) });
  }
}

/** The submission object a change sends: only the fields it changes. */
export function changeObject(
  id: number,
  c: SubmissionChange,
): Readonly<Record<string, unknown>> {
  return {
    object: "paper",
    pid: id,
    ...(c.pdf === null ? {} : { submission: { content_file: CONTENT_FIELD } }),
    ...(c.abstract === null ? {} : { abstract: c.abstract }),
    ...(c.submit ? { status: "submitted" } : {}),
  };
}

function formOf(id: number, c: SubmissionChange): Readonly<FormData> {
  const form = new FormData();
  form.append("json", JSON.stringify(changeObject(id, c)));
  if (c.pdf !== null)
    form.append(
      CONTENT_FIELD,
      new Blob([new Uint8Array(c.pdf.bytes)], { type: "application/pdf" }),
      c.pdf.name,
    );
  return form;
}

const endpoint = (
  base: string,
  params: Readonly<Record<string, string>>,
): string => `${base}/api/paper?${new URLSearchParams(params).toString()}`;

/** HotCRP at `o.url`, read and changed with `o.token`. */
export function hotcrpPortal(o: HotcrpOptions): SubmissionPortal {
  return {
    async show(id) {
      const url = endpoint(o.url, { p: String(id), word_limit: "hard" });
      const a = await call(url, { method: "GET" }, o.token, READ_TIMEOUT_MS);
      return a.ok ? parseShow(a.value.status, a.value.body) : a;
    },
    async update(id, change, { save }) {
      const url = endpoint(o.url, {
        p: String(id),
        ...(save ? {} : { dry_run: "1" }),
      });
      const body = formOf(id, change);
      const a = await call(
        url,
        { method: "POST", body },
        o.token,
        WRITE_TIMEOUT_MS,
      );
      return a.ok ? parseUpdate(a.value.status, a.value.body) : a;
    },
  };
}
