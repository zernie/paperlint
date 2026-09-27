import { describe, expect, it } from "vitest";
import {
  dblpTitleKey,
  EMPTY_LOOKUP_CACHE,
  parseLookupCache,
  serializeLookupCache,
  type LookupCache,
} from "./lookup-cache.ts";
import { err, ok } from "./result.ts";

const HIT = {
  venue: "ICSE",
  year: "2024",
  type: "Conference and Workshop Papers",
  title: "Good Paper.",
  authors: ["Ada Lovelace"],
};
const CACHE: LookupCache = {
  citations: new Map([
    [
      "crossref:doi:10.1/good",
      {
        fetched: "2026-09-27",
        response: { db: "crossref", transport: "ok", query: "doi" },
      },
    ],
  ]),
  dblp: new Map([
    [
      dblpTitleKey("Good Paper"),
      { fetched: "2026-09-26", title: "Good Paper", hits: [HIT] },
    ],
  ]),
};
const doc = (o: object): string => JSON.stringify({ schema: 1, ...o });

describe("serializeLookupCache / parseLookupCache", () => {
  it("round-trips, keys sorted, one trailing newline", () => {
    const text = serializeLookupCache(CACHE);
    expect(text).toBe(
      `${JSON.stringify(
        {
          schema: 1,
          citations: {
            "crossref:doi:10.1/good": {
              fetched: "2026-09-27",
              response: { db: "crossref", transport: "ok", query: "doi" },
            },
          },
          dblp: {
            [dblpTitleKey("Good Paper")]: {
              fetched: "2026-09-26",
              title: "Good Paper",
              hits: [HIT],
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    expect(parseLookupCache(text)).toEqual(ok(CACHE));
  });

  it("the empty cache writes both sections, and reads back as empty", () => {
    expect(parseLookupCache(serializeLookupCache(EMPTY_LOOKUP_CACHE))).toEqual(
      ok(EMPTY_LOOKUP_CACHE),
    );
  });
});

// Guards: a committed file that is wrong in any way is refused with a NAMED reason. Read as
// empty, it would silently turn every build into a full online run — the defect this file fixes.
const REFUSALS: [string, string][] = [
  ["[]", "expected an object with `schema`, `citations` and `dblp`"],
  [doc({ schema: 2 }), "schema 2: this paperlint reads schema 1"],
  [doc({ citations: {}, dblp: {}, x: 1 }), "unknown field `x`"],
  [doc({ dblp: {} }), "`citations`: expected an object"],
  [doc({ citations: {} }), "`dblp`: expected an object"],
  [doc({ citations: { k: 1 }, dblp: {} }), "`citations.k`: expected an object"],
  [
    doc({
      citations: { k: { fetched: "2026-9-1", response: {} } },
      dblp: {},
    }),
    "`citations.k.fetched`: expected a date, YYYY-MM-DD",
  ],
  [
    doc({
      citations: {
        k: { fetched: "2026-09-01", response: { transport: "error" } },
      },
      dblp: {},
    }),
    '`citations.k.response`: expected a successful response ({"transport": "ok", …})',
  ],
  [
    doc({
      citations: {
        k: { fetched: "2026-09-01", response: { transport: "ok" }, y: 1 },
      },
      dblp: {},
    }),
    "`citations.k`: unknown field `y`",
  ],
  [
    doc({
      citations: {},
      dblp: { t: { fetched: "2026-09-01", title: 3, hits: [] } },
    }),
    "`dblp.t.title`: expected a string",
  ],
  [
    doc({
      citations: {},
      dblp: { t: { fetched: "2026-09-01", title: "T", hits: {} } },
    }),
    "`dblp.t.hits`: expected an array",
  ],
  [
    doc({
      citations: {},
      dblp: {
        t: {
          fetched: "2026-09-01",
          title: "T",
          hits: [{ ...HIT, authors: [1] }],
        },
      },
    }),
    "`dblp.t.hits[0]`: expected {venue, year, type, title: string; authors: string[]}",
  ],
  [
    doc({
      citations: {},
      dblp: { t: { fetched: "2026-09-01", title: "T", hits: [3] } },
    }),
    "`dblp.t.hits[0]`: expected {venue, year, type, title: string; authors: string[]}",
  ],
];

describe("parseLookupCache refusals", () => {
  it("refuses text that is not JSON, saying so", () => {
    const r = parseLookupCache("{");
    // The rest of the message is Node's parser; its wording is not the subject.
    expect(r.ok ? "" : r.error).toMatch(/^not JSON: /);
  });

  // Guards: see REFUSALS.
  it.each(REFUSALS)("refuses %s with a named reason", (text, why) => {
    expect(parseLookupCache(text)).toEqual(err(why));
  });
});

describe("dblpTitleKey", () => {
  // Guards: the key must not change with markup the lookup itself strips (braces, case,
  // punctuation, accents), or a re-cased title in the .bib re-asks DBLP with its 900 ms pause.
  it("is the same for the same title under braces, case, punctuation and accents", () => {
    const k = dblpTitleKey("Évaluating {LLM}-based Agents");
    expect(dblpTitleKey("evaluating llm based agents")).toBe(k);
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(dblpTitleKey("Evaluating LLM-based Tools")).not.toBe(k);
  });
});
