/**
 * The world `main.test.ts` and `main.guards.test.ts` run in: a fixtures tree in a temp directory
 * with one earlier entry and one preprint, a queries file asking for 2 nlp papers of ACL 2025, and a
 * fake `Get` that serves one search page, a licence and an e-print. No network.
 */
import { join } from "node:path";
import { writeTree } from "../../test/support.ts";
import type { Args, World } from "./main.ts";
import { fakeGet, mainTex, tarGz } from "./testkit.ts";

export const NOW = Date.parse("2026-11-20T00:00:00Z");
const BY = "http://creativecommons.org/licenses/by/4.0/";
export const queriesJson = JSON.stringify({
  hardCap: 5,
  maxPages: 1,
  quotas: { nlp: 2 },
  slots: [
    {
      field: "nlp",
      series: "ACL",
      year: 2025,
      cap: 2,
      queries: ['co:"ACL 2025"'],
      max_results: 50,
      venue: "acl",
      classSpec: "acl",
    },
  ],
});
export const entry = (id: string) =>
  `<entry><id>http://arxiv.org/abs/${id}</id><updated>2025-05-01</updated><title>T</title><arxiv:comment>Accepted at ACL 2025</arxiv:comment></entry>`;
const camera = tarGz([
  {
    name: "main.tex",
    body: mainTex("Hi.", "\\documentclass{article}\\usepackage{acl}"),
  },
]);

/** The command line a test runs: the temp queries file, every field, no deadline. */
const argsIn =
  (root: string) =>
  (write: string | null, summary = false): Args => ({
    queries: join(root, "queries.json"),
    only: null,
    deadline: Infinity,
    write,
    summary,
  });

/** A fixtures tree with one earlier entry, one preprint, and a world over a fake `Get`. */
export function setup(root: string) {
  writeTree(root, {
    "fixtures/venue-manifest.json": JSON.stringify([
      { arxiv_id: "old", field: "nlp" },
    ]),
    "fixtures/arxiv-manifest.json": JSON.stringify([{ arxiv_id: "pre1v1" }]),
    "presets/acl-2025.jsonc": "{}",
    "presets/README.md": "",
    "queries.json": queriesJson,
  });
  const { get, asked } = fakeGet([
    ["api/query", `<feed>${entry("pre1v2")}${entry("k1v1")}</feed>`],
    ["oai2", `<license>${BY}</license>`],
    ["src/", camera],
  ]);
  const out: string[] = [];
  const world: World = {
    get,
    now: () => NOW,
    log: (l) => out.push(l),
    fixtures: join(root, "fixtures"),
    presets: join(root, "presets"),
    committed: () => true,
  };
  return { root, world, out, asked, args: argsIn(root) };
}
