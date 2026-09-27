/**
 * The online references adapter — verify-cites' existence check and bib-authors' author check
 * over one bibliography, merged per entry — driven with a fake `fetch` that answers every service
 * by URL. DBLP's gentle-client pauses run under fake timers.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { onlineReferences } from "./index.ts";

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
