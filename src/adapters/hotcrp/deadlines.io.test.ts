/**
 * `hotcrpDeadlines` over a local server that answers `GET /deadlines` with a recorded page: the
 * request paperlint sends (the path, no credential) and what comes back through the parser; and a
 * site that does not answer at all.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterAll, beforeAll, test } from "vitest";
import { hotcrpDeadlines } from "./deadlines.io.ts";

const page = readFileSync(
  new URL("./cassette/deadlines-msr2027.html", import.meta.url),
  "utf8",
);

const seen: { url: string; authorization: string | undefined }[] = [];
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  seen.push({ url: req.url ?? "", authorization: req.headers.authorization });
  if (req.url === "/deadlines") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page);
  } else {
    res.writeHead(404, { "content-type": "text/html" });
    res.end('<h1 id="h-title">No such conference</h1>');
  }
});

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

let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${String(portOf(server))}`;
});
afterAll(() => closeServer(server));

test("GET <site>/deadlines, no credential; the page parses to the venue's deadlines", async () => {
  const r = await hotcrpDeadlines({ url: base }).read();
  assert.deepEqual(seen.at(-1), {
    url: "/deadlines",
    authorization: undefined,
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.open, true);
  assert.deepEqual(
    r.value.deadlines.map((d) => [d.what, d.at]),
    [
      ["submission", "2026-10-20T04:00:00Z"],
      ["resubmission", "2026-10-23T04:00:00Z"],
    ],
  );
});

test("a site that is not a conference: refused with the page's title", async () => {
  const r = await hotcrpDeadlines({ url: `${base}/nosuch` }).read();
  assert.ok(!r.ok);
  assert.equal(r.error.kind, "refused");
});

test("a site that does not answer is unreachable, with the network's words", async () => {
  const closed = createServer();
  await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
  const port = portOf(closed);
  await closeServer(closed);
  const r = await hotcrpDeadlines({
    url: `http://127.0.0.1:${String(port)}`,
  }).read();
  assert.ok(!r.ok);
  assert.equal(r.error.kind, "unreachable");
});
