/**
 * verify-cites.mjs's network layer — the four registries, the DOI authority and NVD — driven
 * in-process with a fake `fetch`, so every transport outcome is produced on purpose and nothing
 * touches the network. Each case compares the whole verdict AND the exact requests made: a
 * resolver that asks the wrong URL is as broken as one that misreads the answer.
 */
import assert from "node:assert/strict";
import { afterEach, expect, test, vi } from "vitest";
import {
  createBreaker,
  verifyCitationLive,
  wouldAsk,
} from "./verify-cites.mjs";

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const text = (status, body) => new Response(body, { status });

/**
 * A fake `fetch`: `routes` maps a URL prefix to a response factory (or an Error to throw). The
 * longest matching prefix wins; an unrouted URL fails the test. Returns the URLs asked, in order.
 */
function fakeFetch(routes) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, init) => {
    calls.push(url);
    const hit = Object.keys(routes)
      .filter((p) => url.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (hit === undefined) throw new Error(`unrouted request: ${url}`);
    const r = routes[hit];
    if (r instanceof Error) throw r;
    return r(init?.signal);
  });
  return calls;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const CR = "https://api.crossref.org/works";
const OA = "https://api.openalex.org/works";
const S2 = "https://api.semanticscholar.org/graph/v1/paper";
const AX = "https://export.arxiv.org/api/query";
const DOI = "https://doi.org/api/handles/";
const NVD = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const TITLE = "Attention Is All You Need";
const feed = (title, year) =>
  `<feed><entry><id>http://arxiv.org/abs/1706.03762v1</id><published>${year}-06-12</published><title>${title}</title></entry></feed>`;

test("a DOI every registry resolves to the claimed paper, and the authority knows: true", async () => {
  const calls = fakeFetch({
    [CR]: () =>
      json(200, {
        message: { title: [TITLE], issued: { "date-parts": [[2017]] } },
      }),
    [OA]: () =>
      json(200, { id: "W1", display_name: TITLE, publication_year: 2017 }),
    [S2]: () => json(200, { title: TITLE, year: 2017 }),
    [DOI]: () => json(200, { responseCode: 1 }),
  });
  const cite = { id: "v", doi: "10.1/x", title: TITLE, year: 2017 };
  expect({ result: await verifyCitationLive(cite), calls }).toMatchSnapshot();
});

test("a DOI nobody knows, and the authority says it does not exist: false", async () => {
  const calls = fakeFetch({
    [CR]: () => json(404),
    [OA]: () => json(404),
    [S2]: () => json(404),
    [DOI]: () => json(404),
  });
  const result = await verifyCitationLive({ id: "f", doi: "10.1/nope" });
  expect({ result, calls }).toMatchSnapshot();
});

test("every registry down (429, 503, 403, a thrown error): unresolvable, never false", async () => {
  const calls = fakeFetch({
    [CR]: () => json(429),
    [OA]: () => json(503),
    [S2]: () => json(403),
    [DOI]: new TypeError("fetch failed"),
  });
  const result = await verifyCitationLive({
    id: "u",
    doi: "10.1/x",
    title: TITLE,
  });
  expect({ result, calls }).toMatchSnapshot();
});

test("records with fields missing: no title, a subtitle, a year only in `published`, no id", async () => {
  const calls = fakeFetch({
    [CR]: () =>
      json(200, {
        // No title and a subtitle that is not the claimed title's: no match, so the lookups go on
        // (a match would end them) and every registry's missing fields are read.
        message: {
          subtitle: ["Unrelated Words About Gardening"],
          published: { "date-parts": [[2017]] },
        },
      }),
    [OA]: () => json(200, { display_name: TITLE }), // no `id` → no record
    [S2]: () => json(200, { title: null }), // a null title → no record
    [DOI]: () => json(200, { responseCode: "1" }), // not a number → unknown
  });
  const result = await verifyCitationLive({
    id: "m",
    doi: "10.1/x",
    title: TITLE,
  });
  expect({ result, calls }).toMatchSnapshot();
});

test("an arXiv id: Semantic Scholar by arXiv id, the arXiv API by id_list", async () => {
  const calls = fakeFetch({
    [S2]: () => json(200, { title: TITLE, year: 2017 }),
    [AX]: () => text(200, feed(TITLE, 2017)),
  });
  const result = await verifyCitationLive({
    id: "a",
    arxiv: "1706.03762",
    title: TITLE,
  });
  expect({ result, calls }).toMatchSnapshot();
});

test("an arXiv id nobody has: the arXiv API's empty feed and S2's 404", async () => {
  const calls = fakeFetch({
    [S2]: () => json(404),
    [AX]: () => text(200, "<feed></feed>"),
  });
  const result = await verifyCitationLive({ id: "n", arxiv: "9999.99999" });
  expect({ result, calls }).toMatchSnapshot();
});

test("a title only: every registry's search endpoint, hits and all", async () => {
  // The first three registries' hits carry the title with a year too far off to match, so the
  // lookups go on (a match would end them) and every search endpoint's answer is read; arXiv's
  // hit is the one that matches.
  const calls = fakeFetch({
    [`${CR}?`]: () =>
      json(200, {
        message: {
          items: [{ title: [TITLE], issued: { "date-parts": [[1990]] } }, {}],
        },
      }),
    [`${OA}?`]: () =>
      json(200, {
        results: [{ display_name: TITLE, publication_year: 1990 }, {}],
      }),
    [`${S2}/search`]: () =>
      json(200, { data: [{ title: TITLE, year: 1990 }, {}] }),
    [AX]: () => text(200, feed(TITLE, 2017)),
  });
  const result = await verifyCitationLive({
    id: "t",
    title: TITLE,
    year: 2017,
  });
  expect({ result, calls }).toMatchSnapshot();
});

test("a title search whose answers are empty or shapeless is a miss, not a match", async () => {
  const calls = fakeFetch({
    [`${CR}?`]: () => json(200, {}),
    [`${OA}?`]: () => json(200, {}),
    [`${S2}/search`]: () => json(200, {}),
    [AX]: () => text(200, ""),
  });
  const result = await verifyCitationLive({ id: "e", title: TITLE });
  expect({ result, calls }).toMatchSnapshot();
});

test("a title search that cannot reach any registry is unresolvable", async () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  const calls = fakeFetch({
    [`${CR}?`]: () => json(500),
    [`${OA}?`]: () => json(502),
    [`${S2}/search`]: abort,
    [AX]: () => text(503, ""),
  });
  const result = await verifyCitationLive({ id: "d", title: TITLE });
  expect({ result, calls }).toMatchSnapshot();
});

test("S2 and arXiv unreachable for an arXiv id", async () => {
  const calls = fakeFetch({ [S2]: () => json(500), [AX]: () => text(500, "") });
  const result = await verifyCitationLive({ id: "x", arxiv: "1706.03762" });
  expect({ result, calls }).toMatchSnapshot();
});

test("CVEs: found by count, found by list, not found, NVD down, and a malformed id", async () => {
  const calls = fakeFetch({
    [`${NVD}?cveId=CVE-2024-0001`]: () => json(200, { totalResults: 1 }),
    [`${NVD}?cveId=CVE-2024-0002`]: () => json(200, { vulnerabilities: [{}] }),
    [`${NVD}?cveId=CVE-2024-0003`]: () => json(404),
    [`${NVD}?cveId=CVE-2024-0004`]: () => json(500),
    [`${NVD}?cveId=CVE-2024-0005`]: () => json(200, {}),
  });
  const results = [];
  for (const cve of [
    "cve-2024-0001",
    "CVE-2024-0002",
    "CVE-2024-0003",
    "CVE-2024-0004",
    "CVE-2024-0005",
    "CVE-24-1",
  ])
    results.push(await verifyCitationLive({ id: cve, cve }));
  expect({ results, calls }).toMatchSnapshot();
});

test("a second lookup is served from the cache; failures and a nonexistent DOI are not cached", async () => {
  const cache = {};
  // No registry confirms the DOI, so every lookup runs: a match would end them (tested below).
  fakeFetch({
    [CR]: () => json(404),
    [OA]: () => json(503),
    [S2]: () => json(404),
    [DOI]: () => json(200, { responseCode: 1 }),
    [NVD]: () => json(200, { totalResults: 1 }),
  });
  const cite = { id: "c", doi: "10.1/x", title: TITLE, cve: "CVE-2024-0001" };
  const first = await verifyCitationLive(cite, { cache });
  const again = fakeFetch({ [OA]: () => json(503) });
  const second = await verifyCitationLive(cite, { cache });
  assert.deepEqual(
    { same: second, keys: Object.keys(cache).sort(), again },
    {
      same: first,
      // arXiv is not asked about a DOI at all, so it has nothing to cache.
      keys: [
        "crossref:doi:10.1/x",
        "doi_authority:10.1/x",
        "nvd:CVE-2024-0001",
        "semantic_scholar:doi:10.1/x",
      ],
      // Only the resolver that failed the first time is asked again.
      again: ["https://api.openalex.org/works/doi:10.1%2Fx"],
    },
  );
});

// Guards: a title-only cache key must keep punctuation that names a different work. A shared key
// for `C` and `C++` would answer the second from the first's registry responses, no request made.
test("title-only keys keep punctuation: a C++ title is not served the C title's cached answers", async () => {
  const cache = {};
  const miss = () =>
    json(200, { message: { items: [] }, results: [], data: [] });
  fakeFetch({
    [CR]: miss,
    [OA]: miss,
    [S2]: miss,
    [AX]: () => text(200, "<feed></feed>"),
  });
  await verifyCitationLive(
    { id: "a", title: "Fuzzing C Compilers" },
    { cache },
  );
  const asked = fakeFetch({
    [CR]: miss,
    [OA]: miss,
    [S2]: miss,
    [AX]: () => text(200, "<feed></feed>"),
  });
  await verifyCitationLive(
    { id: "b", title: "Fuzzing C++ Compilers" },
    { cache },
  );
  expect(asked.length).toBeGreaterThan(0);
});

// Guards: `paperlint build` skips its reachability probe when no citation `wouldAsk`. If it said
// "no" for a citation a live run asks about, a "fully cached" paper would go online anyway; if it
// said "yes" for one a live run answers from the cache, every warm build would probe the network.
test("wouldAsk: false exactly when a live run over the same cache makes no request", async () => {
  const cites = [
    { id: "d", doi: "doi:10.1/X.", title: TITLE },
    { id: "a", arxiv: "arXiv:1706.03762", title: TITLE },
    { id: "t", title: TITLE, year: 2017 },
    { id: "v", cve: "cve-2024-0001" },
    { id: "g", commit: "github.com/a/b/commit/abc1234" },
  ];
  fakeFetch({
    [CR]: () =>
      json(200, {
        message: {
          title: [TITLE],
          issued: { "date-parts": [[2017]] },
          items: [],
        },
      }),
    [OA]: () => json(200, { results: [] }),
    [S2]: () => json(200, { data: [] }),
    [AX]: () => text(200, "<feed></feed>"),
    [DOI]: () => json(200, { responseCode: 1 }),
    [NVD]: () => json(200, { totalResults: 1 }),
  });
  const cache = {};
  const cold = [];
  for (const c of cites) cold.push(await wouldAsk(c, cache));
  for (const c of cites) await verifyCitationLive(c, { cache });
  const warm = [];
  for (const c of cites) warm.push(await wouldAsk(c, cache));
  const again = fakeFetch({});
  for (const c of cites) await verifyCitationLive(c, { cache });
  assert.deepEqual(
    { cold, warm, again },
    {
      cold: [true, true, true, true, false],
      warm: [false, false, false, false, false],
      again: [],
    },
  );
});

test("🔴 the first match ends the lookups: nothing asked after it could change the verdict", async () => {
  const calls = fakeFetch({
    [CR]: () =>
      json(200, {
        message: { title: [TITLE], issued: { "date-parts": [[2017]] } },
      }),
  });
  const result = await verifyCitationLive({
    id: "m",
    doi: "10.1/x",
    title: TITLE,
  });
  assert.deepEqual(
    { verdict: result.verdict, matched: result.matched_db, calls },
    {
      verdict: "true",
      matched: "crossref",
      // Not OpenAlex, not Semantic Scholar, not doi.org: a match wins over anything they say.
      calls: ["https://api.crossref.org/works/10.1%2Fx"],
    },
  );
});

// ── #120: a service that refuses is asked once per run ─────────────────────────────────

/** Three title-only citations nobody can find; `s2` answers Semantic Scholar's search. */
async function threeTitles(s2, { concurrent = false } = {}) {
  const calls = fakeFetch({
    [CR]: () => json(200, { message: { items: [] } }),
    [OA]: () => json(200, { results: [] }),
    [S2]: s2,
    [AX]: () => text(200, "<feed></feed>"),
  });
  const breaker = createBreaker();
  const cites = ["One", "Two", "Three"].map((t) => ({
    id: t,
    title: `${t} Paper`,
  }));
  const run = (c) => verifyCitationLive(c, { breaker });
  const results = concurrent
    ? await Promise.all(cites.map(run))
    : await (async () => {
        const out = [];
        for (const c of cites) out.push(await run(c));
        return out;
      })();
  const count = (prefix) => calls.filter((u) => u.startsWith(prefix)).length;
  return {
    asked: {
      crossref: count(CR),
      openalex: count(OA),
      s2: count(S2),
      arxiv: count(AX),
    },
    refused: results.map((r) => r.refused),
    verdicts: results.map((r) => r.verdict),
  };
}

const REFUSED = (why) => [
  [`semantic_scholar: ${why}`],
  [`semantic_scholar: semantic_scholar refused earlier in this run (${why})`],
  [`semantic_scholar: semantic_scholar refused earlier in this run (${why})`],
];

test("#120: a 429 on the first request — Semantic Scholar is asked ONCE; the other services go on", async () => {
  assert.deepEqual(await threeTitles(() => json(429)), {
    asked: { crossref: 3, openalex: 3, s2: 1, arxiv: 3 },
    refused: REFUSED("http 429"),
    verdicts: ["unresolvable", "unresolvable", "unresolvable"],
  });
});

test("#120: an HTML page where JSON was asked trips the breaker, and says so", async () => {
  assert.deepEqual(
    await threeTitles(() =>
      text(200, "<!doctype html><title>slow down</title>"),
    ),
    {
      asked: { crossref: 3, openalex: 3, s2: 1, arxiv: 3 },
      refused: REFUSED("answered HTML, not JSON"),
      verdicts: ["unresolvable", "unresolvable", "unresolvable"],
    },
  );
});

test("#120: a body that is not JSON and not HTML is a refusal too", async () => {
  const r = await threeTitles(() => text(200, "rate limited"));
  assert.deepEqual(r.refused[0], [
    "semantic_scholar: answered something that is not JSON",
  ]);
});

test("#120: a timeout trips the breaker — the 15 s is paid once, not per citation", async () => {
  vi.useFakeTimers();
  // Never answers; the request's own timeout aborts it.
  const pending = threeTitles(
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        ),
      ),
  );
  let done = false;
  void pending.finally(() => (done = true));
  while (!done) await vi.advanceTimersByTimeAsync(1000);
  assert.deepEqual(await pending, {
    asked: { crossref: 3, openalex: 3, s2: 1, arxiv: 3 },
    refused: REFUSED("timeout"),
    verdicts: ["unresolvable", "unresolvable", "unresolvable"],
  });
});

test("#120: citations in flight at once still ask a refusing service once — the first request goes alone", async () => {
  assert.deepEqual(
    (await threeTitles(() => json(429), { concurrent: true })).asked,
    {
      crossref: 3,
      openalex: 3,
      s2: 1,
      arxiv: 3,
    },
  );
});

// Guards the stated bound: requests already in flight when a service starts refusing still land
// (at most as many as run at once), and nothing is asked after the first refusal is recorded.
test("#120: a service that starts refusing costs at most the requests already in flight", async () => {
  const breaker = createBreaker();
  let attempts = 0;
  let release;
  const first = new Promise((r) => (release = r));
  const call = (answer) =>
    breaker.call("s2", async () => {
      attempts++;
      return answer();
    });
  const opener = call(() => first);
  const waiters = Array.from({ length: 5 }, () =>
    call(async () => ({ ok: false, reason: "http 429" })),
  );
  release({ ok: true, value: 1 });
  await Promise.all([opener, ...waiters]);
  const after = await call(async () => ({ ok: true, value: 2 }));
  assert.deepEqual(
    { attempts, after },
    {
      attempts: 6,
      after: { ok: false, reason: "s2 refused earlier in this run (http 429)" },
    },
  );
});

test("#120: a service that answered keeps being asked; one that refuses later is cut off from then on", async () => {
  let n = 0;
  const r = await threeTitles(() =>
    ++n === 1 ? json(200, { data: [] }) : json(503),
  );
  assert.deepEqual(
    { s2: r.asked.s2, refused: r.refused },
    {
      s2: 2,
      refused: [
        undefined,
        ["semantic_scholar: http 503"],
        [
          "semantic_scholar: semantic_scholar refused earlier in this run (http 503)",
        ],
      ],
    },
  );
});

test("offline: no request at all, the verdict from the citation alone", async () => {
  const calls = fakeFetch({});
  const result = await verifyCitationLive(
    { id: "o", doi: "10.1/x", title: TITLE },
    { offline: true },
  );
  expect({ result, calls }).toMatchSnapshot();
});

test("a registry that never answers is abandoned after the timeout, as unreachable", async () => {
  vi.useFakeTimers();
  const calls = [];
  vi.stubGlobal("fetch", (url, { signal }) => {
    calls.push(url);
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      ),
    );
  });
  const pending = verifyCitationLive({ id: "s", title: TITLE });
  for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(15000);
  const result = await pending;
  assert.deepEqual(
    { verdict: result.verdict, calls: calls.length },
    { verdict: "unresolvable", calls: 4 },
  );
});

test("a registry that answers 200 with no body, or a record without its title, still classifies", async () => {
  const calls = fakeFetch({
    [CR]: () => json(200, {}),
    [`${OA}/doi:10.1%2Fx`]: () =>
      json(200, { id: "W1", publication_year: 2017 }),
    [`${OA}/doi:10.1%2Fy`]: () => json(200, {}),
    [S2]: () => json(200, { title: "", year: 2017 }),
    [DOI]: () => json(200, { responseCode: 1 }),
  });
  const run = async (doi) => {
    const r = await verifyCitationLive({ id: doi, doi, title: TITLE });
    return [r.verdict, r.matched_db];
  };
  // A record with no title is incomparable, which is not a mismatch, so the DOI stands confirmed:
  // x by OpenAlex's untitled record; y, which OpenAlex does not know, by Semantic Scholar's.
  assert.deepEqual(
    { x: await run("10.1/x"), y: await run("10.1/y"), calls: calls.length },
    {
      x: ["true", "openalex"],
      y: ["true", "semantic_scholar"],
      // x: Crossref, OpenAlex (match, the lookups end). y: Crossref, OpenAlex, Semantic Scholar.
      calls: 5,
    },
  );
});
