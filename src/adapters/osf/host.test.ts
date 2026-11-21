/**
 * The OSF adapter against a local HTTP server on 127.0.0.1 — no real OSF, no network. The server
 * answers with the recorded answers in `cassette/` and records each request whole (method, path,
 * query, the Authorization header, the body), so the tests assert what OSF would receive.
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { ArtifactHost } from "../../ports/artifact-host.ts";
import { osfHost, parseFile, parseListing, parseUploaded } from "./index.ts";

const cassette = (name: string): string =>
  readFileSync(new URL(`cassette/${name}`, import.meta.url), "utf8");

interface Seen {
  readonly request: string;
  readonly auth: string | null;
  readonly body: string;
}
interface Reply {
  readonly status: number;
  readonly body: string;
}

const seen: Seen[] = [];
let routes: Readonly<Record<string, Reply>> = {};
const server = createServer((req: IncomingMessage, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const request = `${req.method ?? ""} ${req.url ?? ""}`;
    seen.push({
      request,
      auth: req.headers.authorization ?? null,
      body: Buffer.concat(chunks).toString(),
    });
    const r = routes[request] ?? { status: 599, body: "{}" };
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(r.body);
  });
});

let host: ArtifactHost;
let base = "";
beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const a: AddressInfo | string | null = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a !== null ? String(a.port) : ""}`;
  host = osfHost({
    api: `${base}/v2`,
    files: `${base}/v1`,
    site: "https://osf.io",
  });
});
afterAll(
  () =>
    new Promise<void>((done) => {
      server.close(() => {
        done();
      });
    }),
);
beforeEach(() => {
  seen.length = 0;
});

const ID = "0123456789abcdef01234567";
const FILE = `/v2/files/${ID}/`;
const LISTING =
  "/v2/nodes/abcde/files/osfstorage/?filter%5Bname%5D=artifact.zip";
const HOSTED = {
  id: ID,
  url: `https://osf.io/abcde/files/osfstorage/${ID}`,
  sha256: "59bd16dfc39e768f82bb8ec74467e571e80ed284683b586f077dbf1aa2483ecd",
  md5: "3f395fbbb68716f38f5ff7fa9d740e3b",
};
const EMPTY = JSON.stringify({ data: [] });
const ok200 = (name: string): Reply => ({ status: 200, body: cassette(name) });

test("read: by the record's file id, without a token on a public file", async () => {
  routes = { [`GET ${FILE}`]: ok200("get-file.json") };
  const r = await host.read(
    { url: "https://osf.io/abcde/", file: "x", id: ID },
    null,
  );
  // Guards: the file's hashes as OSF holds them, and no Authorization header without a token.
  expect(r).toEqual({ ok: true, value: HOSTED });
  expect(seen).toEqual([{ request: `GET ${FILE}`, auth: null, body: "" }]);
});

test("read: by name in the project the url names, with the token in its header only", async () => {
  routes = { [`GET ${LISTING}`]: ok200("get-listing.json") };
  const where = {
    url: "https://osf.io/abcde/?view_only=0f",
    file: "artifact.zip",
    id: null,
  };
  // Guards: the listing filtered by the record's file name; the token travels as a bearer header.
  expect(await host.read(where, "tok")).toEqual({ ok: true, value: HOSTED });
  expect(seen).toEqual([
    { request: `GET ${LISTING}`, auth: "Bearer tok", body: "" },
  ]);
  // Guards: a project without that file is not found, naming both.
  routes = { [`GET ${LISTING}`]: { status: 200, body: EMPTY } };
  expect(await host.read(where, null)).toEqual({
    ok: false,
    error: {
      kind: "not-found",
      detail: "the project abcde holds no file artifact.zip at its top level",
    },
  });
});

test("read: what OSF or the record cannot answer is a failure that says which", async () => {
  routes = {
    [`GET ${FILE}`]: { status: 404, body: cassette("get-missing.json") },
  };
  const where = { url: "https://example.org/a", file: "artifact.zip", id: ID };
  // Guards: 404 → not found.
  expect(await host.read(where, null)).toEqual({
    ok: false,
    error: {
      kind: "not-found",
      detail: "HTTP 404: OSF has no such file or project",
    },
  });
  // Guards: a url that is not OSF's, and no id → not found, before any request.
  expect(await host.read({ ...where, id: null }, null)).toEqual({
    ok: false,
    error: {
      kind: "not-found",
      detail:
        "the record has no file id and its url names no https://osf.io project",
    },
  });
  routes = { [`GET ${FILE}`]: { status: 401, body: "{}" } };
  // Guards: 401 → refused, with no token in the words.
  expect(await host.read(where, "secret-token")).toEqual({
    ok: false,
    error: {
      kind: "refused",
      detail:
        "HTTP 401: OSF refused the token, or the file is not public and no token was given",
    },
  });
  routes = { [`GET ${FILE}`]: { status: 500, body: "<html>" } };
  // Guards: an answer that is not JSON is malformed.
  expect(await host.read(where, null)).toEqual({
    ok: false,
    error: { kind: "malformed", detail: "HTTP 500: the answer is not JSON" },
  });
  const gone = osfHost({
    api: "http://127.0.0.1:1/v2",
    files: "",
    site: "https://osf.io",
  });
  const r = await gone.read(where, null);
  // Guards: a host that does not answer is unreachable — for a read by id, by name, and an upload.
  expect(r.ok ? null : r.error.kind).toBe("unreachable");
  const byName = await gone.read(
    { ...where, url: "https://osf.io/abcde/", id: null },
    null,
  );
  expect(byName.ok ? null : byName.error.kind).toBe("unreachable");
  const up = await gone.upload(
    { target: "abcde", name: "a", bytes: new Uint8Array() },
    "t",
  );
  expect(up.ok ? null : up.error.kind).toBe("unreachable");
});

test("upload: a new file, then its hashes read back from OSF", async () => {
  const put =
    "/v1/resources/abcde/providers/osfstorage/?kind=file&name=artifact.zip";
  routes = {
    [`GET ${LISTING}`]: { status: 200, body: EMPTY },
    [`PUT ${put}`]: { status: 201, body: cassette("put-new.json") },
    [`GET ${FILE}`]: ok200("get-file.json"),
  };
  const bytes = new TextEncoder().encode("artifact bytes\n");
  const r = await host.upload(
    { target: "abcde", name: "artifact.zip", bytes },
    "tok",
  );
  // Guards: look for the name, PUT the bytes as a new file, read the hashes back — each with the token.
  expect(r).toEqual({ ok: true, value: HOSTED });
  expect(seen).toEqual([
    { request: `GET ${LISTING}`, auth: "Bearer tok", body: "" },
    { request: `PUT ${put}`, auth: "Bearer tok", body: "artifact bytes\n" },
    { request: `GET ${FILE}`, auth: "Bearer tok", body: "" },
  ]);
});

test("upload: a file of the same name gets a new version; a failing step stops it", async () => {
  const put = `/v1/resources/abcde/providers/osfstorage/${ID}?kind=file`;
  routes = {
    [`GET ${LISTING}`]: ok200("get-listing.json"),
    [`PUT ${put}`]: ok200("put-new.json"),
    [`GET ${FILE}`]: ok200("get-file.json"),
  };
  const u = {
    target: "abcde",
    name: "artifact.zip",
    bytes: new Uint8Array([1]),
  };
  // Guards: the version goes to the existing file's id.
  expect(await host.upload(u, "tok")).toEqual({ ok: true, value: HOSTED });
  expect(seen.map((s) => s.request)).toEqual([
    `GET ${LISTING}`,
    `PUT ${put}`,
    `GET ${FILE}`,
  ]);
  routes = { [`GET ${LISTING}`]: { status: 403, body: "{}" } };
  // Guards: a refused listing uploads nothing.
  expect((await host.upload(u, "tok")).ok).toBe(false);
  routes = {
    [`GET ${LISTING}`]: ok200("get-listing.json"),
    [`PUT ${put}`]: { status: 200, body: "{}" },
  };
  // Guards: an upload answer without the file's path is malformed.
  expect(await host.upload(u, "tok")).toEqual({
    ok: false,
    error: {
      kind: "malformed",
      detail: "HTTP 200: the answer is not an uploaded file",
    },
  });
  routes = {
    [`GET ${LISTING}`]: ok200("get-listing.json"),
    [`PUT ${put}`]: { status: 502, body: "<html>" },
  };
  // Guards: a PUT whose answer is not JSON stops before the read-back.
  expect(await host.upload(u, "tok")).toEqual({
    ok: false,
    error: { kind: "malformed", detail: "HTTP 502: the answer is not JSON" },
  });
  expect(seen.at(-1)?.request).toBe(`PUT ${put}`);
});

test("the parsers: shapes that are not OSF's are malformed; a file without hashes has none", () => {
  // Guards: each parser refuses a body of the wrong shape, by what it expected.
  expect(parseFile(200, {})).toEqual({
    ok: false,
    error: { kind: "malformed", detail: "HTTP 200: the answer is not a file" },
  });
  expect(parseListing(200, {}, "a")).toEqual({
    ok: false,
    error: {
      kind: "malformed",
      detail: "HTTP 200: the answer is not a list of files",
    },
  });
  expect(parseListing(404, {}, "a").ok).toBe(false);
  expect(parseUploaded(500, {}).ok).toBe(false);
  const bare = {
    id: "i",
    attributes: { name: "a", kind: "file", extra: {} },
    links: { html: "h" },
  };
  // Guards: a file OSF gives no hashes for reads as none, not as an error.
  expect(parseFile(200, { data: bare })).toEqual({
    ok: true,
    value: { id: "i", url: "h", sha256: null, md5: null },
  });
});

test("targetOf: the project's guid in an osf.io url, else none", () => {
  // Guards: a project url, with or without a view-only link; anything else is none.
  expect(host.targetOf("https://osf.io/abcde/?view_only=1")).toBe("abcde");
  expect(host.targetOf("https://osf.io/settings/")).toBe(null);
  expect(host.targetOf("https://zenodo.org/records/1")).toBe(null);
  expect(host.targetOf("not a url")).toBe(null);
});
