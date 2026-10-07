/**
 * The online references adapter — verify-cites' existence check and bib-authors' author check
 * over one bibliography, merged per entry — driven with a fake `fetch` that answers every service
 * by URL. DBLP's gentle-client pauses run under fake timers.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { dblpTitleKey, onlineReferences, referencesChecker } from "./index.ts";
import {
  EMPTY_LOOKUP_CACHE,
  type LookupCache,
} from "../../domain/lookup-cache.ts";
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";
import { absolutePath } from "../../domain/paths.ts";
import { bibReader } from "../bibtex/index.ts";

/** A BibTeX text's entries, as the bibtex reader reads them. */
const read = (bib: string) =>
  bibReader.readFile(absolutePath("/p/refs.bib"), bib).entries;

/** The verdicts of a cold run — an empty cache, the adapter the CLI wires. */
const checkOnly = async (bib: string) =>
  (await onlineReferences(read(bib), EMPTY_LOOKUP_CACHE)).check;

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
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes)
      .filter(([p]) => url.startsWith(p))
      .sort(([a], [b]) => b.length - a.length)[0];
    return Promise.resolve(hit === undefined ? json(404) : hit[1]());
  });
  return calls;
}

/** Await `p` while fake time runs, so DBLP's pauses between requests elapse at once. */
async function settle<T>(p: Promise<T>): Promise<T> {
  // A field, not a `let`: the flag is set in a callback, which flow analysis cannot see.
  const state = { done: false };
  const out = p.finally(() => (state.done = true));
  while (!state.done) await vi.advanceTimersByTimeAsync(1000);
  return out;
}

test("no service answers: not-checked, with the reason", async () => {
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("getaddrinfo ENOTFOUND api.crossref.org")),
  );
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
    r.entries.map((e) => [e.key, [e.exists, e.authors, e.why ?? ""]]),
  );
  assert.deepEqual(
    {
      good: byKey["good"]?.slice(0, 2),
      fake: byKey["fake"]?.slice(0, 2),
      drift: byKey["drift"]?.slice(0, 2),
      driftWhy: String(byKey["drift"]?.[2]).split("; ").pop(),
      flaky: [
        byKey["flaky"]?.[1],
        String(byKey["flaky"]?.[2]).split("; ").pop(),
      ],
      pre: byKey["pre"]?.slice(0, 2),
    },
    {
      good: ["true", "match"],
      fake: ["false", "skipped"],
      drift: ["unresolvable", "mismatch"],
      driftWhy: "missing turing (DBLP: ICSE 2024)",
      flaky: [
        "unchecked",
        "DBLP lookup failed: DBLP refused earlier in this run (DBLP 500)",
      ],
      pre: ["unresolvable", "skipped"],
    },
  );
});

test("one key in two candidate databases: each entry gets its own verdict, in the order given", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://api.crossref.org/works/10.1%2Fgood": () =>
      json(200, {
        message: { title: ["Good Paper"], issued: { "date-parts": [[2024]] } },
      }),
    "https://doi.org/api/handles/10.1/good": () =>
      json(200, { responseCode: 1 }),
    "https://doi.org/api/handles/10.1/fake": () => json(404),
    // Crossref knows nothing of the fake: a 404, not a refusal that would stop the run asking it.
    "https://api.crossref.org/works/10.1%2Ffake": () => json(404),
    "https://dblp.org/search/publ/api/?q=Good%20Paper": () =>
      dblp("Good Paper", ["Ada Lovelace"]),
    "https://api.crossref.org/": () => json(200),
    "https://dblp.org/": () => json(200, {}),
  });
  // An `undecided` bibliography: the anonymous and the real database both define `k`, and only one
  // copy fails — its existence, or its authors. The failing verdict is the failing copy's own.
  const good =
    "@inproceedings{k, author={Ada Lovelace}, title={Good Paper}, booktitle={ICSE}, doi={10.1/good}}";
  const fake =
    "@inproceedings{k, author={Ada Lovelace}, title={Fake Paper}, booktitle={ICSE}, doi={10.1/fake}}";
  const drift =
    "@inproceedings{k, author={Ada Lovelace and Alan Turing}, title={Good Paper}, booktitle={ICSE}, doi={10.1/good}}";
  const verdicts = async (bib: string) => {
    const r = await settle(checkOnly(bib));
    return (r.kind === "checked" ? r.entries : []).map((e) => [
      e.key,
      e.exists,
      e.authors,
    ]);
  };
  assert.deepEqual(
    [
      await verdicts(`${good}\n${fake}`),
      await verdicts(`${fake}\n${good}`),
      await verdicts(`${good}\n${drift}`),
    ],
    [
      [
        ["k", "true", "match"],
        ["k", "false", "skipped"],
      ],
      [
        ["k", "false", "skipped"],
        ["k", "true", "match"],
      ],
      [
        ["k", "true", "match"],
        ["k", "true", "mismatch"],
      ],
    ],
  );
});

test("an author finding names what is extra and what is out of order", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://dblp.org/search/publ/api/?q=Extra%20Paper": () =>
      dblp("Extra Paper", ["Ada Lovelace"]),
    "https://dblp.org/search/publ/api/?q=Swapped%20Paper": () =>
      dblp("Swapped Paper", ["Ada Lovelace", "Alan Turing"]),
    "https://dblp.org/": () => json(200, {}),
    "https://api.crossref.org/": () => json(200, { message: { items: [] } }),
  });
  const bib = [
    "@inproceedings{extra, author={Ada Lovelace and Grace Hopper}, title={Extra Paper}, booktitle={ICSE}}",
    "@inproceedings{swapped, author={Alan Turing and Ada Lovelace}, title={Swapped Paper}, booktitle={ICSE}}",
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
    for (const c of cites.citationsOf(read(bib)))
      serial.push((await cites.verifyCitationLive(c, { cache: {} })).verdict);
    const t0 = Date.now();
    const r = await checkOnly(bib);
    const ms = Date.now() - t0;
    assert.equal(r.kind, "checked");
    assert.deepEqual(
      r.entries.map((e) => e.exists),
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
] as const;
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
  return settle(cached(read(bib), EMPTY_LOOKUP_CACHE));
}

test("cold: every answer is stored with the day it was fetched — responses, never verdicts", async () => {
  const { check, cache } = await cold(PAPERS.join("\n"));
  assert.equal(check.kind, "checked");
  assert.deepEqual(
    {
      // The lookups run concurrently, so insertion order is not the subject.
      citations: [...cache.citations.keys()]
        .map((k) => k.split(":").slice(0, 2).join(":"))
        .sort(),
      dblp: [...cache.dblp.values()].map((d) => [d.title, d.hits.length]),
      dates: new Set(
        [...cache.citations.values(), ...cache.dblp.values()].map(
          (v) => v.fetched,
        ),
      ),
    },
    {
      // `good` is confirmed by Crossref, which ends its lookups; the two title-only entries are
      // found nowhere, so each asked all four registries.
      citations: [
        "arxiv:title",
        "arxiv:title",
        "crossref:doi",
        "crossref:title",
        "crossref:title",
        "openalex:title",
        "openalex:title",
        "semantic_scholar:title",
        "semantic_scholar:title",
      ],
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
  const second = await cached(read(bib), first.cache);
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
  const second = await settle(cached(read(edited), first.cache));
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

// Guards: a cached answer is good for MAX_AGE_DAYS, then asked again. A registry or DBLP that had
// not indexed a new work yet would otherwise answer "no record" from the committed cache forever.
test("an answer older than 30 days is asked again and re-dated; at 30 days it is still used", async () => {
  const bib = PAPERS.join("\n");
  const first = await cold(bib);
  vi.useRealTimers();
  vi.useFakeTimers();
  const quiet = fakeFetch({});
  const at30 = await referencesChecker({ today: () => "2026-10-27" })(
    read(bib),
    first.cache,
  );
  vi.useRealTimers();
  vi.useFakeTimers();
  const calls = answering();
  const at31 = await settle(
    referencesChecker({ today: () => "2026-10-28" })(read(bib), first.cache),
  );
  assert.deepEqual(
    {
      at30: { calls: quiet, same: at30.cache === first.cache },
      at31: {
        asked: calls.some((u) => u.startsWith("https://dblp.org/search")),
        dates: new Set(
          [...at31.cache.citations.values(), ...at31.cache.dblp.values()].map(
            (v) => v.fetched,
          ),
        ),
      },
    },
    {
      at30: { calls: [], same: true },
      at31: { asked: true, dates: new Set(["2026-10-28"]) },
    },
  );
});

test("a failed lookup is not cached: the next run asks it again", async () => {
  vi.useFakeTimers();
  fakeFetch({
    "https://api.crossref.org/": () => json(200, { message: { items: [] } }),
    "https://dblp.org/": () => json(500),
  });
  const bib = PAPERS[1];
  const r = await settle(cached(read(bib), EMPTY_LOOKUP_CACHE));
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
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("getaddrinfo ENOTFOUND api.crossref.org")),
  );
  const r = await cached(read(PAPERS[0]), EMPTY_LOOKUP_CACHE);
  assert.deepEqual(r, {
    check: {
      kind: "not-checked",
      why: "the citation services cannot be reached (getaddrinfo ENOTFOUND api.crossref.org)",
    },
    cache: EMPTY_LOOKUP_CACHE,
  });
});

// ── #120: a service that refuses costs one request per run ───────────────────────────────

const PUBLISHED = [
  "@inproceedings{a, author={Ada Lovelace}, title={First Paper}, booktitle={ICSE}}",
  "@inproceedings{b, author={Ada Lovelace}, title={Second Paper}, booktitle={ICSE}}",
  "@inproceedings{c, author={Ada Lovelace}, title={Third Paper}, booktitle={ICSE}}",
].join("\n");

/** Every registry answers "not found"; DBLP and Semantic Scholar answer with `dblp` and `s2`. */
function refusing(dblpAnswer: () => Response, s2: () => Response) {
  return fakeFetch({
    "https://api.crossref.org/": () => json(200, { message: { items: [] } }),
    "https://api.openalex.org/": () => json(200, { results: [] }),
    "https://api.semanticscholar.org/": s2,
    "https://export.arxiv.org/": () => new Response("<feed></feed>"),
    "https://dblp.org/": dblpAnswer,
  });
}
const count = (calls: string[], prefix: string) =>
  calls.filter((u) => u.startsWith(prefix)).length;

test("🔴 #120: DBLP answering HTML is asked ONCE — no retries, no pause — and every entry says why it is unchecked", async () => {
  // Fake timers with NO advancing: a single 900 ms pause or retry backoff would hang the test.
  vi.useFakeTimers();
  const calls = refusing(
    () => new Response("<!doctype html><title>429</title>"),
    () => json(429),
  );
  const { check } = await cached(read(PUBLISHED), EMPTY_LOOKUP_CACHE);
  const entries = check.kind === "checked" ? check.entries : [];
  assert.deepEqual(
    {
      dblp: count(calls, "https://dblp.org/"),
      s2: count(calls, "https://api.semanticscholar.org/"),
      crossref: count(calls, "https://api.crossref.org/works"),
      entries: entries.map((e) => [e.key, e.exists, e.authors]),
    },
    {
      dblp: 1,
      s2: 1,
      crossref: 3,
      entries: [
        ["a", "unresolvable", "unchecked"],
        ["b", "unresolvable", "unchecked"],
        ["c", "unresolvable", "unchecked"],
      ],
    },
  );
  // The reason, as the record carries it — its last part names both refusals.
  assert.deepEqual(
    entries.map((e) => e.why?.split("; ").slice(1)),
    [
      [
        "not asked: semantic_scholar: http 429",
        "DBLP lookup failed: DBLP refused earlier in this run (Unexpected token '<', \"<!doctype \"... is not valid JSON)",
      ],
      [
        "not asked: semantic_scholar: semantic_scholar refused earlier in this run (http 429)",
        "DBLP lookup failed: DBLP refused earlier in this run (Unexpected token '<', \"<!doctype \"... is not valid JSON)",
      ],
      [
        "not asked: semantic_scholar: semantic_scholar refused earlier in this run (http 429)",
        "DBLP lookup failed: DBLP refused earlier in this run (Unexpected token '<', \"<!doctype \"... is not valid JSON)",
      ],
    ],
  );
});

test("#120: a DBLP 429 trips it as well; DBLP answering keeps its 900 ms pace between queries", async () => {
  vi.useFakeTimers();
  const refused = refusing(
    () => json(429),
    () => json(200, { data: [] }),
  );
  await cached(read(PUBLISHED), EMPTY_LOOKUP_CACHE);
  vi.useRealTimers();
  vi.useFakeTimers();
  const answering = refusing(
    () => dblp("First Paper", ["Ada Lovelace"]),
    () => json(200, { data: [] }),
  );
  const pending = cached(read(PUBLISHED), EMPTY_LOOKUP_CACHE);
  // One compared entry, then the pause: without advancing time, the run cannot finish.
  let done = false;
  void pending.finally(() => (done = true));
  await vi.advanceTimersByTimeAsync(0);
  const beforePause = done;
  await settle(pending);
  assert.deepEqual(
    {
      refused: count(refused, "https://dblp.org/"),
      answering: count(answering, "https://dblp.org/"),
      beforePause,
    },
    { refused: 1, answering: 3, beforePause: false },
  );
});

// Guards: the DBLP key must not change with presentation markup (BibTeX braces, case, accents,
// spacing), or a re-cased title in the .bib re-asks DBLP with its 900 ms pause.
test("dblpTitleKey is the same for the same title under braces, case, accents and spacing", () => {
  const k = dblpTitleKey("Évaluating {LLM}-based  Agents");
  assert.equal(dblpTitleKey("evaluating llm-based agents"), k);
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.notEqual(dblpTitleKey("Evaluating LLM-based Tools"), k);
});

// Guards: punctuation can be part of a title's identity. A shared key would serve one work's
// DBLP answer for another; a separate key costs one extra lookup at most.
const PUNCTUATION_PAIRS: readonly (readonly [string, string])[] = [
  ["Fuzzing C Compilers", "Fuzzing C++ Compilers"],
  ["Verified F Programs", "Verified F# Programs"],
];
for (const [a, b] of PUNCTUATION_PAIRS) {
  test(`dblpTitleKey keeps ${a} and ${b} apart`, () => {
    assert.notEqual(dblpTitleKey(a), dblpTitleKey(b));
  });
}
