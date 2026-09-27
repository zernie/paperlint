/**
 * verify-cites.mjs's network layer — the four registries, the DOI authority and NVD — driven
 * in-process with a fake `fetch`, so every transport outcome is produced on purpose and nothing
 * touches the network. Each case compares the whole verdict AND the exact requests made: a
 * resolver that asks the wrong URL is as broken as one that misreads the answer.
 */
import assert from "node:assert/strict";
import { afterEach, expect, test, vi } from "vitest";
import { verifyCitationLive } from "./verify-cites.mjs";

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const text = (status, body) => new Response(body, { status });

/**
 * A fake `fetch`: `routes` maps a URL prefix to a response factory (or an Error to throw). The
 * longest matching prefix wins; an unrouted URL fails the test. Returns the URLs asked, in order.
 */
function fakeFetch(routes) {
  const calls = [];
  vi.stubGlobal("fetch", async (url) => {
    calls.push(url);
    const hit = Object.keys(routes)
      .filter((p) => url.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (hit === undefined) throw new Error(`unrouted request: ${url}`);
    const r = routes[hit];
    if (r instanceof Error) throw r;
    return r();
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
        message: {
          subtitle: ["All You Need"],
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
  const calls = fakeFetch({
    [`${CR}?`]: () =>
      json(200, {
        message: {
          items: [{ title: [TITLE], issued: { "date-parts": [[2017]] } }, {}],
        },
      }),
    [`${OA}?`]: () =>
      json(200, {
        results: [{ display_name: TITLE, publication_year: 2017 }, {}],
      }),
    [`${S2}/search`]: () =>
      json(200, { data: [{ title: TITLE, year: 2017 }, {}] }),
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
  fakeFetch({
    [CR]: () => json(200, { message: { title: [TITLE] } }),
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
