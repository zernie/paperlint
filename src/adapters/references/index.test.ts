/**
 * The online references adapter — verify-cites' existence check and bib-authors' author check
 * over one bibliography, merged per entry — driven with a fake `fetch` that answers every service
 * by URL. DBLP's gentle-client pauses run under fake timers.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { onlineReferences } from "./index.ts";
// @ts-expect-error — a skill script in .mjs, it has no types
import * as cites from "../../../skills/verify-citations/scripts/verify-cites.mjs";

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
function fakeFetch(routes: Record<string, () => Response>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const hit = Object.keys(routes)
      .filter((p) => url.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    if (hit === undefined) return json(404);
    return routes[hit]!();
  });
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
  assert.deepEqual(await onlineReferences("@misc{k, title={T}}"), {
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
  const r = await settle(onlineReferences(bib));
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
  const r = await settle(onlineReferences(bib));
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
    const r = await onlineReferences(bib);
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
  const r = await onlineReferences(manyBib(8));
  assert.deepEqual(
    r.kind === "checked" ? r.entries.map((e) => [e.key, e.exists]) : [],
    Array.from({ length: 8 }, (_, i) => [
      `k${String(i)}`,
      i === 3 ? "unresolvable" : "true",
    ]),
  );
});
