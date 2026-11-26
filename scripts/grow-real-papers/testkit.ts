/**
 * Builders for the collector's tests: a tar stream written the way arXiv's e-prints are (ustar
 * headers, GNU long names, pax paths), and a fake `Get` routed by URL that records every request.
 * Nothing here touches the disk or the network.
 */
import { gzipSync } from "node:zlib";
import type { ArchiveFile } from "./archive.ts";
import { collect, type ProbeLine, type Queries, type Walk } from "./collect.ts";
import type { KeptPaper } from "./paper.ts";
import type { Slot } from "./rules.ts";
import type { Fetched, Get } from "./sources.ts";

export type TarIn = Readonly<{
  name: string;
  body?: string;
  /** The tar type flag: "0" a file (the default), "2" a symlink, "5" a directory, "L", "x". */
  type?: string;
  prefix?: string;
}>;

const header = (e: TarIn, size: number): Uint8Array => {
  const h = Buffer.alloc(512);
  h.write(e.name.slice(0, 100), 0, "latin1");
  h.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "latin1");
  h.write(e.type ?? "0", 156, "latin1");
  h.write("ustar\0", 257, "latin1");
  h.write(e.prefix ?? "", 345, "latin1");
  return h;
};

/** A tar stream of the entries, in order, ended by two empty blocks. */
export const tar = (entries: readonly TarIn[]): Uint8Array =>
  Buffer.concat([
    ...entries.flatMap((e) => {
      const body = Buffer.from(e.body ?? "", "latin1");
      const pad = Buffer.alloc((512 - (body.length % 512)) % 512);
      return [header(e, body.length), body, pad];
    }),
    Buffer.alloc(1024),
  ]);

export const tarGz = (entries: readonly TarIn[]): Uint8Array =>
  gzipSync(tar(entries));

export const file = (path: string, text: string): ArchiveFile => ({
  path,
  bytes: Buffer.from(text, "latin1"),
});

export const text = (f: ArchiveFile): string =>
  Buffer.from(f.bytes).toString("latin1");

/** A main file: a class, a document, and whatever body is given. */
export const mainTex = (
  body: string,
  cls = "\\documentclass{article}",
): string => `${cls}\n\\begin{document}\n${body}\n\\end{document}\n`;

export type Route = string | Uint8Array | Readonly<{ status: string }>;

/**
 * A `Get` that answers by the first route whose key the URL contains, and records each URL asked.
 * A URL no route matches answers status 404, so a test sees an unexpected request in `asked`.
 */
export function fakeGet(
  routes: ReadonlyArray<readonly [string, Route]>,
): Readonly<{ get: Get; asked: string[] }> {
  const asked: string[] = [];
  const answer = (r: Route | undefined): Fetched =>
    r === undefined
      ? { ok: false, status: "404" }
      : typeof r === "string"
        ? { ok: true, bytes: Buffer.from(r, "utf8") }
        : r instanceof Uint8Array
          ? { ok: true, bytes: r }
          : { ok: false, status: r.status };
  const get: Get = (url) => {
    asked.push(url);
    return Promise.resolve(answer(routes.find(([k]) => url.includes(k))?.[1]));
  };
  return { get, asked };
}

export const BY = "http://creativecommons.org/licenses/by/4.0/";
export const slot: Slot = {
  field: "nlp",
  series: "ACL",
  year: 2025,
  cap: 1,
  queries: ['co:"ACL 2025"'],
  max_results: 50,
  venue: "acl",
  classSpec: "acl",
};
export const queries = (over: Partial<Queries> = {}): Queries => ({
  hardCap: 5,
  maxPages: 1,
  quotas: { nlp: 9 },
  slots: [slot],
  ...over,
});

const entry = (id: string, comment: string) =>
  `<entry><id>http://arxiv.org/abs/${id}</id><updated>2025-05-01</updated><title>T</title><arxiv:comment>${comment}</arxiv:comment></entry>`;
export const feed = (es: readonly (readonly [string, string])[]) =>
  `<feed>${es.map(([id, c]) => entry(id, c)).join("")}</feed>`;
export const ACCEPTED = "Accepted at ACL 2025";
export const camera = tarGz([
  {
    name: "main.tex",
    body: mainTex("Hi.", "\\documentclass{article}\\usepackage{acl}"),
  },
]);

/** One walk of the collector over a fake world: the log lines as tuples, what it kept, how each edition ended. */
export async function walk(over: Partial<Walk> & Pick<Walk, "get">) {
  const lines: ProbeLine[] = [];
  const kept: KeptPaper[] = [];
  const ends = await collect({
    queries: queries(),
    only: null,
    entries: [],
    otherIds: new Set(),
    logged: [],
    shipped: new Set(),
    outOfTime: () => false,
    emit: (line, paper) => {
      lines.push(line);
      if (paper !== undefined) kept.push(paper);
    },
    ...over,
  });
  return {
    ends,
    kept: kept.map((k) => k.id),
    log: lines.map((l) => [l.rank, l.id, l.outcome, l.reason]),
  };
}
