/**
 * OSF's answers, parsed into what the `ArtifactHost` port returns. Pure. The shapes are OSF's own,
 * checked against recorded answers in `cassette/` (README there).
 *
 * - `GET api.osf.io/v2/files/<id>/` and each entry of `GET api.osf.io/v2/nodes/<guid>/files/osfstorage/`:
 *   a file's `id`, `attributes.name`, `attributes.kind` and `attributes.extra.hashes` (`md5`,
 *   `sha256`), and `links.html`, its page.
 * - `PUT files.osf.io/v1/…` (WaterButler): `{ "data": <file entity> }`, whose `attributes.path` is
 *   `/<id>` (`BaseOsfStorageItemMetadata.path` and the upload handler of
 *   CenterForOpenScience/waterbutler, read 2026-11-21).
 */
import { z } from "zod";
import { err, ok, type Result } from "../../domain/result.ts";
import type { HostedFile, HostFailure } from "../../ports/artifact-host.ts";

const Hash = z.string().nullable().optional();

const FileEntry = z.object({
  id: z.string(),
  attributes: z.object({
    name: z.string(),
    kind: z.string(),
    extra: z.object({
      hashes: z.object({ md5: Hash, sha256: Hash }).optional(),
    }),
  }),
  links: z.object({ html: z.string() }),
});
type FileEntry = z.infer<typeof FileEntry>;

const OneFile = z.object({ data: FileEntry });
const Listing = z.object({ data: z.array(FileEntry) });
const Uploaded = z.object({
  data: z.object({ attributes: z.object({ path: z.string() }) }),
});

/** An answer whose shape is not the one parsed: what was expected, and the status it came with. */
const malformed = (status: number, what: string): HostFailure => ({
  kind: "malformed",
  detail: `HTTP ${String(status)}: the answer is not ${what}`,
});

/** A status that is no success, as a failure: 401 and 403 refused, 404 not found. */
export function statusFailure(status: number): HostFailure | null {
  if (status === 401 || status === 403)
    return {
      kind: "refused",
      detail: `HTTP ${String(status)}: OSF refused the token, or the file is not public and no token was given`,
    };
  if (status === 404)
    return {
      kind: "not-found",
      detail: "HTTP 404: OSF has no such file or project",
    };
  return status >= 200 && status < 300
    ? null
    : { kind: "refused", detail: `HTTP ${String(status)}` };
}

const hosted = (f: Readonly<FileEntry>): HostedFile => ({
  id: f.id,
  url: f.links.html,
  sha256: f.attributes.extra.hashes?.sha256 ?? null,
  md5: f.attributes.extra.hashes?.md5 ?? null,
});

/** `GET /v2/files/<id>/` → the file. */
export function parseFile(
  status: number,
  body: unknown,
): Result<HostedFile, HostFailure> {
  const bad = statusFailure(status);
  if (bad !== null) return err(bad);
  const f = OneFile.safeParse(body);
  return f.success ? ok(hosted(f.data.data)) : err(malformed(status, "a file"));
}

/** A folder listing → the file called `name` in it, or null when there is none. */
export function parseListing(
  status: number,
  body: unknown,
  name: string,
): Result<HostedFile | null, HostFailure> {
  const bad = statusFailure(status);
  if (bad !== null) return err(bad);
  const l = Listing.safeParse(body);
  if (!l.success) return err(malformed(status, "a list of files"));
  const f = l.data.data.find(
    (e) => e.attributes.kind === "file" && e.attributes.name === name,
  );
  return ok(f === undefined ? null : hosted(f));
}

/** WaterButler's answer to an upload → the id of the file it holds now. */
export function parseUploaded(
  status: number,
  body: unknown,
): Result<string, HostFailure> {
  const bad = statusFailure(status);
  if (bad !== null) return err(bad);
  const u = Uploaded.safeParse(body);
  return u.success
    ? ok(u.data.data.attributes.path.replace(/^\//u, ""))
    : err(malformed(status, "an uploaded file"));
}
