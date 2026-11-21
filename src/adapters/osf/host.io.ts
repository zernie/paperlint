/**
 * OSF as the `ArtifactHost` port, over Node's `fetch`.
 *
 * Read: `GET <api>/files/<id>/` when the record has the file's id; else the project's listing
 * filtered by name, `GET <api>/nodes/<guid>/files/osfstorage/?filter[name]=<file>` (the project's
 * guid is the first segment of the record's `osf.io` url). Both answer `extra.hashes` with `md5` and
 * `sha256` (recorded 2026-11-21, `cassette/`).
 *
 * Upload, through WaterButler (waterbutler.readthedocs.io, "Upload a file"): a new version of a file
 * of the same name at the project's top level, `PUT <files>/resources/<guid>/providers/osfstorage/<id>?kind=file`;
 * else a new file, `PUT <files>/resources/<guid>/providers/osfstorage/?kind=file&name=<name>`. The
 * body is the bytes, not a form. Then the hashes are read back from `GET <api>/files/<id>/`, so the
 * record holds what OSF says it holds, not what was sent.
 *
 * 🔴 THE TOKEN goes in the `Authorization` header and nowhere else: not into a URL, a message, or an
 * error.
 */
import { err, ok, type Result } from "../../domain/result.ts";
import { messageOf } from "../../domain/text.ts";
import type {
  ArtifactHost,
  HostedFile,
  HostFailure,
  Upload,
  Where,
} from "../../ports/artifact-host.ts";
import { parseFile, parseListing, parseUploaded } from "./response.ts";

/** Where OSF answers: its API and WaterButler, no trailing slash. A test points them at itself. */
export interface OsfUrls {
  readonly api: string;
  readonly files: string;
  /** The site whose urls name a project: `https://osf.io/<guid>/…`. */
  readonly site: string;
}

export const OSF: OsfUrls = {
  api: "https://api.osf.io/v2",
  files: "https://files.osf.io/v1",
  site: "https://osf.io",
};

const READ_TIMEOUT_MS = 60_000;
const WRITE_TIMEOUT_MS = 600_000;

type Answer = Result<
  { readonly status: number; readonly body: unknown },
  HostFailure
>;

/** One request → HTTP status and parsed JSON body, or why there is neither. */
async function call(
  url: string,
  token: string | null,
  init: { readonly method: string; readonly body?: Uint8Array },
): Promise<Answer> {
  const auth = token === null ? {} : { Authorization: `Bearer ${token}` };
  try {
    const r = await fetch(url, {
      method: init.method,
      ...(init.body === undefined ? {} : { body: new Uint8Array(init.body) }),
      headers: { ...auth, Accept: "application/json" },
      signal: AbortSignal.timeout(
        init.method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS,
      ),
    });
    const text = await r.text();
    try {
      return { ok: true, value: { status: r.status, body: JSON.parse(text) } };
    } catch {
      return err({
        kind: "malformed",
        detail: `HTTP ${String(r.status)}: the answer is not JSON`,
      });
    }
  } catch (e) {
    return err({ kind: "unreachable", detail: messageOf(e) });
  }
}

/** The project's guid in an `osf.io` url: its first path segment, five letters and digits. */
const guidOf = (site: string, url: string): string | null =>
  URL.canParse(url) && new URL(url).host === new URL(site).host
    ? (/^\/([a-z0-9]{5})(?:\/|$)/u.exec(new URL(url).pathname)?.[1] ?? null)
    : null;

type Found = Promise<Result<HostedFile, HostFailure>>;

/** The file OSF holds under `id`. */
async function fileById(u: OsfUrls, id: string, token: string | null): Found {
  const a = await call(`${u.api}/files/${encodeURIComponent(id)}/`, token, {
    method: "GET",
  });
  return a.ok ? parseFile(a.value.status, a.value.body) : a;
}

/** The file called `name` at the top level of the project `guid`, or null when there is none. */
async function byName(
  u: OsfUrls,
  guid: string,
  name: string,
  token: string | null,
): Promise<Result<HostedFile | null, HostFailure>> {
  const q = new URLSearchParams({ "filter[name]": name });
  const url = `${u.api}/nodes/${guid}/files/osfstorage/?${q.toString()}`;
  const a = await call(url, token, { method: "GET" });
  return a.ok ? parseListing(a.value.status, a.value.body, name) : a;
}

/** The file a record names: by its id, else by its name in the project its url names. */
async function read(u: OsfUrls, where: Where, token: string | null): Found {
  if (where.id !== null) return fileById(u, where.id, token);
  const guid = guidOf(u.site, where.url);
  if (guid === null)
    return err({
      kind: "not-found",
      detail: `the record has no file id and its url names no ${u.site} project`,
    });
  const f = await byName(u, guid, where.file, token);
  if (!f.ok) return f;
  return f.value === null
    ? err({
        kind: "not-found",
        detail: `the project ${guid} holds no file ${where.file} at its top level`,
      })
    : ok(f.value);
}

/** Put the file: a new version of the one of the same name, else a new file; then read it back. */
async function upload(u: OsfUrls, up: Upload, token: string): Found {
  const existing = await byName(u, up.target, up.name, token);
  if (!existing.ok) return existing;
  const base = `${u.files}/resources/${up.target}/providers/osfstorage/`;
  const query = new URLSearchParams({ kind: "file", name: up.name });
  const url =
    existing.value === null
      ? `${base}?${query.toString()}`
      : `${base}${existing.value.id}?kind=file`;
  const put = await call(url, token, { method: "PUT", body: up.bytes });
  if (!put.ok) return put;
  const id = parseUploaded(put.value.status, put.value.body);
  return id.ok ? fileById(u, id.value, token) : id;
}

/** OSF at `u`: the project's files read, and a file put there. */
export const osfHost = (u: OsfUrls = OSF): ArtifactHost => ({
  can: { upload: true, hashes: ["sha256", "md5"] },
  token: {
    variable: "OSF_TOKEN_OSF_IO",
    siteLess: "OSF_TOKEN",
    help: `${u.site}/settings/tokens (Settings → Personal access tokens), scope osf.full_write to upload; osf.full_read is enough for show on a project that is not public`,
  },
  targetOf: (url) => guidOf(u.site, url),
  read: (where, token) => read(u, where, token),
  upload: (up, token) => upload(u, up, token),
});
