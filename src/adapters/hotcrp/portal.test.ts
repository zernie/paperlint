/**
 * The HotCRP adapter against a local HTTP server on 127.0.0.1 — no real portal, no network. The
 * server records each request whole (method, path, query, headers, body), so the tests assert what
 * HotCRP would receive, and answers with what HotCRP documents.
 */
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterAll, beforeAll, test } from "vitest";
import { sha256Hex } from "../../domain/sha256.ts";
import type { SubmissionChange } from "../../domain/submission.ts";
import {
  CONTENT_FIELD,
  changeObject,
  hotcrpPortal,
  sha256OfHash,
} from "./index.ts";

interface Seen {
  readonly method: string;
  readonly url: URL;
  readonly headers: IncomingMessage["headers"];
  readonly body: Buffer;
}

interface Reply {
  readonly status: number;
  readonly body: string;
  readonly type?: string;
}

const seen: Seen[] = [];
let reply: Reply = { status: 200, body: "{}" };
let base = "";

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    seen.push({
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://127.0.0.1"),
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    res.writeHead(
      reply.status,
      reply.type === ""
        ? {}
        : { "content-type": reply.type ?? "application/json" },
    );
    res.end(reply.body);
  });
});

/** The port a listening server was given. */
const portOf = (s: Server): number => {
  const a = s.address();
  assert.ok(a !== null && typeof a === "object", "the server is not listening");
  return a.port;
};
const closeServer = (s: Server): Promise<void> =>
  new Promise<void>((r) => {
    s.close(() => {
      r();
    });
  });

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${String(portOf(server))}`;
});
afterAll(() => closeServer(server));

const TOKEN = "hct_test_token";
const answer = (status: number, body: unknown): void => {
  seen.length = 0;
  reply = { status, body: JSON.stringify(body) };
};
const portal = () => hotcrpPortal({ url: base, token: TOKEN });
const last = (): Seen => {
  const s = seen.at(-1);
  assert.ok(s, "the server saw no request");
  return s;
};

const PDF = new TextEncoder().encode("%PDF-1.5 fake bytes");
const HEX = sha256Hex(PDF);
const PAPER = {
  object: "paper",
  pid: 7,
  status: "submitted",
  title: "A Fake Title",
  abstract: "one two three four",
  paper_type: "Regular",
  topics: ["Topic A", "Topic B"],
  submission: {
    hash: `sha2-${HEX}`,
    size: PDF.length,
    mimetype: "application/pdf",
    timestamp: 1_700_000_000,
  },
  submitted: true,
  submitted_at: 1_700_000_100,
  modified_at: 1_700_000_200,
};

interface Part {
  readonly headers: string;
  readonly body: Buffer;
}

/**
 * The multipart body split into its parts by the boundary its content type names — the way a
 * server reads it, small enough to read here rather than trust a library's parser.
 */
function partsOf(s: Seen): ReadonlyMap<string, Part> {
  const boundary = /boundary=(.+)$/.exec(s.headers["content-type"] ?? "")?.[1];
  assert.ok(boundary, "not a multipart body");
  const text = s.body.toString("latin1");
  const parts = text.split(`--${boundary}`).slice(1, -1);
  return new Map(
    parts.map((raw) => {
      const [headers = "", ...rest] = raw.slice(2, -2).split("\r\n\r\n");
      const name = /name="([^"]*)"/.exec(headers)?.[1] ?? "";
      return [
        name,
        { headers, body: Buffer.from(rest.join("\r\n\r\n"), "latin1") },
      ];
    }),
  );
}

test("show: GET /api/paper?p=<id>&word_limit=hard with the bearer token, parsed whole", async () => {
  answer(200, { ok: true, paper: PAPER });
  const r = await portal().show(7);
  const s = last();
  assert.equal(s.method, "GET");
  assert.equal(s.url.pathname, "/api/paper");
  assert.deepEqual(Object.fromEntries(s.url.searchParams), {
    p: "7",
    word_limit: "hard",
  });
  assert.equal(s.headers.authorization, `bearer ${TOKEN}`);
  assert.deepEqual(r, {
    ok: true,
    value: {
      id: 7,
      status: "submitted",
      title: "A Fake Title",
      paperType: "Regular",
      topics: ["Topic A", "Topic B"],
      abstract: "one two three four",
      pdf: {
        sha256: HEX,
        hash: `sha2-${HEX}`,
        size: PDF.length,
        mimetype: "application/pdf",
        uploadedAt: 1_700_000_000,
      },
      submittedAt: 1_700_000_100,
      modifiedAt: 1_700_000_200,
      messages: [],
    },
  });
});

test("show: a submission without a PDF, fields absent, a paper type that is not a string", async () => {
  answer(200, {
    ok: true,
    paper: {
      pid: 7,
      status: "draft",
      paper_type: 2,
      submission: { hash: "sha2-short" },
    },
    message_list: [{ message: "note", field: "title", status: 1 }, {}],
  });
  assert.deepEqual(await portal().show(7), {
    ok: true,
    value: {
      id: 7,
      status: "draft",
      title: null,
      paperType: "2",
      topics: [],
      abstract: null,
      pdf: {
        sha256: null,
        hash: "sha2-short",
        size: null,
        mimetype: null,
        uploadedAt: null,
      },
      submittedAt: null,
      modifiedAt: null,
      messages: [
        { message: "note", field: "title", status: 1 },
        { message: "", field: null, status: null },
      ],
    },
  });
});

test("🔴 show: 401 surfaces HotCRP's own message, and the token is in no part of it", async () => {
  answer(401, {
    ok: false,
    message_list: [{ status: 2, message: "Missing credentials" }],
  });
  const r = await portal().show(7);
  assert.deepEqual(r, {
    ok: false,
    error: {
      kind: "refused",
      httpStatus: 401,
      messages: [{ message: "Missing credentials", field: null, status: 2 }],
    },
  });
  // Guards: the token never travels into what the caller prints.
  assert.doesNotMatch(JSON.stringify(r), new RegExp(TOKEN));
});

const CHANGE: SubmissionChange = {
  pdf: { name: "paper.pdf", bytes: PDF },
  abstract: "new abstract",
  submit: true,
};

test("update: a dry run by default — dry_run=1, the json field, the PDF under its content_file name", async () => {
  answer(200, {
    ok: true,
    valid: true,
    change_list: ["submission", "abstract"],
    message_list: [],
    dry_run: true,
    pid: 7,
  });
  const r = await portal().update(7, CHANGE, { save: false });
  const s = last();
  assert.equal(s.method, "POST");
  assert.equal(s.url.pathname, "/api/paper");
  assert.deepEqual(Object.fromEntries(s.url.searchParams), {
    p: "7",
    dry_run: "1",
  });
  assert.equal(s.headers.authorization, `bearer ${TOKEN}`);
  const parts = partsOf(s);
  assert.deepEqual([...parts.keys()], ["json", CONTENT_FIELD]);
  assert.deepEqual(JSON.parse(parts.get("json")?.body.toString("utf8") ?? ""), {
    object: "paper",
    pid: 7,
    submission: { content_file: CONTENT_FIELD },
    abstract: "new abstract",
    status: "submitted",
  });
  const file = parts.get(CONTENT_FIELD);
  assert.match(file?.headers ?? "", /filename="paper\.pdf"/);
  assert.match(file?.headers ?? "", /Content-Type: application\/pdf/i);
  assert.deepEqual(new Uint8Array(file?.body ?? []), PDF);
  assert.deepEqual(r, {
    ok: true,
    value: {
      httpStatus: 200,
      valid: true,
      changes: ["submission", "abstract"],
      messages: [],
      dryRun: true,
    },
  });
});

test("update with save: no dry_run parameter at all", async () => {
  answer(200, { ok: true, valid: true, pid: 7 });
  const r = await portal().update(7, CHANGE, { save: true });
  assert.deepEqual(Object.fromEntries(last().url.searchParams), { p: "7" });
  assert.deepEqual(r, {
    ok: true,
    value: {
      httpStatus: 200,
      valid: true,
      changes: [],
      messages: [],
      dryRun: false,
    },
  });
});

test("update: valid:false is an outcome with HotCRP's messages, at any HTTP status", async () => {
  answer(400, {
    ok: false,
    valid: false,
    change_list: ["submission"],
    message_list: [{ field: "submission", message: "Bad PDF", status: 2 }],
  });
  assert.deepEqual(await portal().update(7, CHANGE, { save: false }), {
    ok: true,
    value: {
      httpStatus: 400,
      valid: false,
      changes: ["submission"],
      messages: [{ message: "Bad PDF", field: "submission", status: 2 }],
      dryRun: false,
    },
  });
});

test("update: 403 without a verdict is a refusal with the messages", async () => {
  answer(403, {
    ok: false,
    message_list: [{ message: "Token scope does not allow this" }],
  });
  assert.deepEqual(await portal().update(7, CHANGE, { save: false }), {
    ok: false,
    error: {
      kind: "refused",
      httpStatus: 403,
      messages: [
        {
          message: "Token scope does not allow this",
          field: null,
          status: null,
        },
      ],
    },
  });
});

test("an answer that is not JSON, or JSON that is no answer, is malformed — not a pass", async () => {
  seen.length = 0;
  reply = { status: 200, body: "<html>login</html>", type: "text/html" };
  assert.deepEqual(await portal().show(7), {
    ok: false,
    error: {
      kind: "malformed",
      httpStatus: 200,
      detail: "the answer is not JSON (text/html)",
    },
  });
  answer(200, { ok: true });
  assert.deepEqual(await portal().show(7), {
    ok: false,
    error: {
      kind: "malformed",
      httpStatus: 200,
      detail: "the answer has no submission in `paper`",
    },
  });
  answer(200, { ok: true });
  assert.deepEqual(await portal().update(7, CHANGE, { save: false }), {
    ok: false,
    error: {
      kind: "malformed",
      httpStatus: 200,
      detail: "the answer has no `valid`",
    },
  });
  seen.length = 0;
  reply = { status: 502, body: "bad gateway", type: "" };
  assert.deepEqual(await portal().show(7), {
    ok: false,
    error: {
      kind: "malformed",
      httpStatus: 502,
      detail: "the answer is not JSON (no content type)",
    },
  });
  answer(500, "oops");
  const r = await portal().show(7);
  assert.deepEqual(r, {
    ok: false,
    error: { kind: "refused", httpStatus: 500, messages: [] },
  });
});

test("a portal that does not answer is unreachable, with the network's words", async () => {
  const closed = createServer();
  await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
  const port = portOf(closed);
  await closeServer(closed);
  const down = hotcrpPortal({
    url: `http://127.0.0.1:${String(port)}`,
    token: TOKEN,
  });
  for (const r of [
    await down.show(7),
    await down.update(7, CHANGE, { save: false }),
  ]) {
    assert.equal(!r.ok && r.error.kind, "unreachable");
    assert.ok(!r.ok && r.error.kind === "unreachable" && r.error.detail !== "");
  }
});

test("changeObject: only what changes is sent", () => {
  assert.deepEqual(
    changeObject(7, { pdf: null, abstract: null, submit: false }),
    { object: "paper", pid: 7 },
  );
});

test("sha256OfHash: sha2-<hex> is a sha256; any other hash is not claimed to be one", () => {
  assert.equal(sha256OfHash(`sha2-${HEX}`), HEX);
  assert.equal(sha256OfHash("da39a3ee5e6b4b0d3255bfef95601890afd80709"), null);
  assert.equal(sha256OfHash(`sha2-${HEX.toUpperCase()}`), null);
});
