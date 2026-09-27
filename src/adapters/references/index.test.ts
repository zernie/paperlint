/**
 * The online references adapter — verify-cites' existence check and bib-authors' author check
 * over one bibliography, merged per entry — driven with a fake `fetch` that answers every service
 * by URL. DBLP's gentle-client pauses run under fake timers.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { onlineReferences, referencesChecker } from "./index.ts";
import {
  dblpTitleKey,
  EMPTY_LOOKUP_CACHE,
  type LookupCache,
} from "../../domain/lookup-cache.ts";
// @ts-expect-error — a skill script in .mjs, it has no types
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";

/** The verdicts of a cold run — an empty cache, the adapter the CLI wires. */
const checkOnly = async (bib: string) =>
  (await onlineReferences(bib, EMPTY_LOOKUP_CACHE)).check;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const dblp = (title: string, authors: string[]) =>
  json(200, {
    result: {
      hits: {
        hit: [
          {
            info: {
              title,
              venue: "ICSE",
              year: "2024",
              type: "Conference and Workshop Papers",
              authors: { author: authors.map((text) => ({ text })) },
            },
          },
        ],
      },
    },
  });

/** Route by URL prefix; the longest prefix wins. */
function fakeFetch(routes: Record<string, () => Response>): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const hit = Object.keys(routes)
      .filter((p) => url.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (hit === undefined) return json(404);
    return routes[hit]!();
  });
  return calls;
}

/** Await `p` while fake time runs, so DBLP's pauses between requests elapse at once. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const out = p.finally(() => (done = true));
  while (!done) await vi.advanceTimersByTimeAsync(1000);
  return out;
}

test("no service answers: not-checked, with the reason", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("getaddrinfo ENOTFOUND api.crossref.org");
  });
  assert.deepEqual(await checkOnly("@misc{k, title={T}}"), {
    kind: "not-checked",
    why: "the citation services cannot be reached (getaddrinfo ENOTFOUND api.crossref.org)",
  });
});

test("each entry gets its existence and its authors: confirmed, fabricated, mismatched, unchecked, skipped", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://api.crossref.org/works/10.1%2Fgood": () =>
      json(200, {
        message: { title: ["Good Paper"], issued: { "date-parts": [[2024]] } },
      }),
    "https://doi.org/api/handles/10.1/good": () =>
      json(200, { responseCode: 1 }),
    "https://doi.org/api/handles/10.1/fake": () => json(404),
    "https://dblp.org/search/publ/api/?q=Good%20Paper": () =>
      dblp("Good Paper", ["Ada Lovelace"]),
    "https://dblp.org/search/publ/api/?q=Drift%20Paper": () =>
      dblp("Drift Paper", ["Ada Lovelace", "Alan Turing"]),
    "https://dblp.org/search/publ/api/?q=Flaky%20Paper": () => json(500),
    "https://api.crossref.org/": () => json(200),
    // Any other title: DBLP knows nothing, so the author check does not apply.
    "https://dblp.org/": () => json(200, {}),
  });
  const bib = [
    "@inproceedings{good, author={Ada Lovelace}, title={Good Paper}, booktitle={ICSE}, doi={10.1/good}}",
    "@inproceedings{fake, author={Ada Lovelace}, title={Fake Paper}, booktitle={ICSE}, doi={10.1/fake}}",
    "@inproceedings{drift, author={Ada Lovelace}, title={Drift Paper}, booktitle={ICSE}}",
    "@inproceedings{flaky, author={Ada Lovelace}, title={Flaky Paper}, booktitle={ICSE}}",
    "@misc{pre, author={Ada Lovelace}, title={A Preprint}, journal={arXiv preprint}}",
  ].join("\n");
  const r = await settle(checkOnly(bib));
  assert.equal(r.kind, "checked");
  const byKey = Object.fromEntries(
    (r.kind === "checked" ? r.entries : []).map((e) => [
      e.key,
      [e.exists, e.authors, e.why ?? ""],
    ]),
  );
  assert.deepEqual(
    {
      good: byKey["good"]!.slice(0, 2),
      fake: byKey["fake"]!.slice(0, 2),
      drift: byKey["drift"]!.slice(0, 2),
      driftWhy: String(byKey["drift"]![2]).split("; ").pop(),
      flaky: [byKey["flaky"]![1], String(byKey["flaky"]![2]).split("; ").pop()],
      pre: byKey["pre"]!.slice(0, 2),
    },
    {
      good: ["true", "match"],
      fake: ["false", "skipped"],
      drift: ["unresolvable", "mismatch"],
      driftWhy: "missing turing (DBLP: ICSE 2024)",
      flaky: ["unchecked", "DBLP lookup failed: DBLP 500"],
      pre: ["unresolvable", "skipped"],
    },
  );
});

test("an author finding names what is extra and what is out of order; an entry only the author check read is unresolvable", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://dblp.org/search/publ/api/?q=Extra%20Paper": () =>
      dblp("Extra Paper", ["Ada Lovelace"]),
    "https://dblp.org/search/publ/api/?q=Swapped%20Paper": () =>
      dblp("Swapped Paper", ["Ada Lovelace", "Alan Turing"]),
    "https://dblp.org/search/publ/api/?q=Comment%20Paper": () =>
      dblp("Comment Paper", ["Grace Hopper"]),
    "https://dblp.org/": () => json(200, {}),
    "https://api.crossref.org/": () => json(200),
  });
  const bib = [
    "@inproceedings{extra, author={Ada Lovelace and Grace Hopper}, title={Extra Paper}, booktitle={ICSE}}",
    "@inproceedings{swapped, author={Alan Turing and Ada Lovelace}, title={Swapped Paper}, booktitle={ICSE}}",
    // verify-cites skips @comment blocks; bib-authors reads them — so only one checker sees this key.
    "@comment{commented, author={Ada Lovelace}, title={Comment Paper}, booktitle={ICSE}}",
  ].join("\n");
  const r = await settle(checkOnly(bib));
  const why = Object.fromEntries(
    (r.kind === "checked" ? r.entries : []).map((e) => [
      e.key,
      [e.exists, e.why],
    ]),
  );
  assert.deepEqual(why, {
    extra: [
      "unresolvable",
      "not found by title in any database (no resolvable id to disprove) — could be a legit unindexed/regional/pre-digital work, NOT fabrication; extra hopper (DBLP: ICSE 2024)",
    ],
    swapped: [
      "unresolvable",
      "not found by title in any database (no resolvable id to disprove) — could be a legit unindexed/regional/pre-digital work, NOT fabrication; order differs (DBLP: ICSE 2024)",
    ],
    commented: [
      "unresolvable",
      "missing hopper; extra lovelace (DBLP: ICSE 2024)",
    ],
  });
});

// ── #107: the per-citation lookups run concurrently ──────────────────────────────────────

/** A fetch where every request takes `ms` of real time; `down` DOIs fail at the transport. */
function slowFetch(ms: number, down: readonly string[] = []) {
  vi.stubGlobal("fetch", async (url: string) => {
    await new Promise((r) => {
      setTimeout(r, ms);
    });
    if (down.some((d) => url.includes(encodeURIComponent(d))))
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (url.startsWith("https://api.crossref.org/works/"))
      return json(200, {
        message: { title: ["Paper"], issued: { "date-parts": [[2024]] } },
      });
    if (url.startsWith("https://doi.org/api/handles/"))
      return json(200, { responseCode: 1 });
    return url === "https://api.crossref.org/" ? json(200) : json(404);
  });
}
/** N preprint-style entries (no venue, so the DBLP pass and its pauses do not apply). */
const manyBib = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `@misc{k${String(i)}, author={Ada Lovelace}, title={Paper}, doi={10.1234/p${String(i)}}}`,
  ).join("\n");

// The serial baseline alone takes ~4 s, past vitest's 5 s default with the concurrent run added.
test(
  "#107: twenty lookups of ~200 ms each finish in far less than twenty times 200 ms, with the serial verdicts",
  { timeout: 20_000 },
  async () => {
    // Five requests per citation (four resolvers and doi.org), 40 ms each: ~200 ms per lookup.
    slowFetch(40);
    const bib = manyBib(20);
    const serial: string[] = [];
    for (const c of cites.parseBib(bib) as { id: string }[])
      serial.push(
        (
          (await cites.verifyCitationLive(c, { cache: {} })) as {
            verdict: string;
          }
        ).verdict,
      );
    const t0 = Date.now();
    const r = await checkOnly(bib);
    const ms = Date.now() - t0;
    assert.equal(r.kind, "checked");
    assert.deepEqual(
      r.kind === "checked" ? r.entries.map((e) => e.exists) : [],
      serial,
    );
    assert.ok(ms < (20 * 200) / 2, `${String(ms)} ms for 20 lookups`);
  },
);

test("#107: a lookup whose requests time out is that entry's `unresolvable`, not the others' failure", async () => {
  slowFetch(5, ["10.1234/p3"]);
  const r = await checkOnly(manyBib(8));
  assert.deepEqual(
    r.kind === "checked" ? r.entries.map((e) => [e.key, e.exists]) : [],
    Array.from({ length: 8 }, (_, i) => [
      `k${String(i)}`,
      i === 3 ? "unresolvable" : "true",
    ]),
  );
});

// ── #107: the committed lookup cache ─────────────────────────────────────────────────────

const TODAY = "2026-09-27";
const cached = referencesChecker({ today: () => TODAY });
const PAPERS = [
  "@inproceedings{good, author={Ada Lovelace}, title={Good Paper}, booktitle={ICSE}, doi={10.1/good}}",
  "@inproceedings{other, author={Ada Lovelace}, title={Other Paper}, booktitle={ICSE}}",
  "@misc{pre, author={Ada Lovelace}, title={A Preprint}, journal={arXiv preprint}}",
];
/** Every service answers; DBLP knows "Good Paper" and nothing else. */
const answering = () =>
  fakeFetch({
    "https://api.crossref.org/works/10.1%2Fgood": () =>
      json(200, {
        message: { title: ["Good Paper"], issued: { "date-parts": [[2024]] } },
      }),
    "https://doi.org/api/handles/10.1/good": () =>
      json(200, { responseCode: 1 }),
    "https://dblp.org/search/publ/api/?q=Good%20Paper": () =>
      dblp("Good Paper", ["Ada Lovelace"]),
    "https://dblp.org/": () => json(200, {}),
    "https://api.crossref.org/": () => json(200, { message: { items: [] } }),
    "https://api.openalex.org/": () => json(200, { results: [] }),
    "https://api.semanticscholar.org/": () => json(200, { data: [] }),
    "https://export.arxiv.org/": () => new Response("<feed></feed>"),
  });

/** A cold run over `bib`, under fake timers: its answers become the cache the next run starts from. */
async function cold(bib: string) {
  vi.useFakeTimers();
  answering();
  return settle(cached(bib, EMPTY_LOOKUP_CACHE));
}

test("cold: every answer is stored with the day it was fetched — responses, never verdicts", async () => {
  const { check, cache } = await cold(PAPERS.join("\n"));
  assert.equal(check.kind, "checked");
  assert.deepEqual(
    {
      citations: [...cache.citations.keys()].sort(),
      dblp: [...cache.dblp.values()].map((d) => [d.title, d.hits.length]),
      dates: new Set(
        [...cache.citations.values(), ...cache.dblp.values()].map(
          (v) => v.fetched,
        ),
      ),
    },
    {
      // Every key verify-cites names for these citations (pinned against a live run in
      // verify-cites.net.test.mjs): the cold run stored every answer it got.
      citations: (cites.parseBib(PAPERS.join("\n")) as object[])
        .flatMap((c) => cites.cacheKeysFor(c) as string[])
        .sort(),
      dblp: [
        ["Good Paper", 1],
        ["Other Paper", 0],
      ],
      dates: new Set([TODAY]),
    },
  );
  // Guards: what is stored is the resolver's RESPONSE — never a verdict field.
  assert.deepEqual(cache.citations.get("crossref:doi:10.1/good"), {
    fetched: TODAY,
    response: {
      db: "crossref",
      transport: "ok",
      query: "doi",
      record: { title: "Good Paper", subtitle: "", year: 2024 },
    },
  });
});

test("🔴 warm: a fully cached bibliography asks NOTHING — no lookup, no reachability probe, no DBLP pause", async () => {
  const bib = PAPERS.join("\n");
  const first = await cold(bib);
  vi.useRealTimers();
  // Fake timers with NO advancing: a single DBLP pause would never resolve and time the test out.
  vi.useFakeTimers();
  const calls = fakeFetch({});
  const second = await cached(bib, first.cache);
  assert.deepEqual(
    // Nothing fetched, so the cache comes back as the very object passed in — nothing to write.
    { calls, check: second.check, sameCache: second.cache === first.cache },
    { calls: [], check: first.check, sameCache: true },
  );
});

test("🔴 one entry edited: only that entry is asked again, and the old answers are kept", async () => {
  const first = await cold(PAPERS.join("\n"));
  vi.useRealTimers();
  vi.useFakeTimers();
  const calls = answering();
  const edited = PAPERS.join("\n").replace("Other Paper", "Renamed Paper");
  const second = await settle(cached(edited, first.cache));
  assert.deepEqual(
    {
      // The lookups run concurrently, so the order of requests is not the subject.
      asked: calls.filter((u) => u !== "https://api.crossref.org/").sort(),
      probed: calls.includes("https://api.crossref.org/"),
      kept: [...first.cache.citations.keys()].every((k) =>
        second.cache.citations.has(k),
      ),
      newDblp: second.cache.dblp.has(dblpTitleKey("Renamed Paper")),
    },
    {
      asked: [
        "https://api.crossref.org/works?query.bibliographic=Renamed%20Paper&rows=5",
        "https://api.openalex.org/works?search=Renamed%20Paper&per-page=5",
        "https://api.semanticscholar.org/graph/v1/paper/search?query=Renamed%20Paper&fields=title,year&limit=5",
        "https://dblp.org/search/publ/api/?q=Renamed%20Paper&format=json&h=6",
        "https://export.arxiv.org/api/query?search_query=ti:%22Renamed%20Paper%22&max_results=5",
      ],
      probed: true,
      kept: true,
      newDblp: true,
    },
  );
});

test("a failed lookup is not cached: the next run asks it again", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://api.crossref.org/": () => json(200, { message: { items: [] } }),
    "https://dblp.org/": () => json(500),
  });
  const bib = PAPERS[1]!;
  const r = await settle(cached(bib, EMPTY_LOOKUP_CACHE));
  const failed: LookupCache = r.cache;
  assert.deepEqual(
    {
      dblp: failed.dblp.size,
      authors: r.check.kind === "checked" ? r.check.entries[0]?.authors : "",
    },
    { dblp: 0, authors: "unchecked" },
  );
});

test("offline with an incomplete cache: not-checked, and the cache comes back unchanged", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("getaddrinfo ENOTFOUND api.crossref.org");
  });
  const r = await cached(PAPERS[0]!, EMPTY_LOOKUP_CACHE);
  assert.deepEqual(r, {
    check: {
      kind: "not-checked",
      why: "the citation services cannot be reached (getaddrinfo ENOTFOUND api.crossref.org)",
    },
    cache: EMPTY_LOOKUP_CACHE,
  });
});
