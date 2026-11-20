/**
 * The candidate sources over a fake `Get`: arXiv comment search, the Semantic Scholar listing, the
 * OAI licence and the e-print. Every URL asked is recorded, so a test also sees what was NOT asked.
 */
import { describe, expect, test } from "vitest";
import type { Slot } from "./rules.ts";
import {
  arxivCandidates,
  baseId,
  eprint,
  licenceUrl,
  parseFeed,
  s2Candidates,
  s2Url,
  type Found,
} from "./sources.ts";
import { fakeGet } from "./testkit.ts";

const entry = (id: string, comment = "Accepted at X 2025") =>
  `<entry><id>http://arxiv.org/abs/${id}</id><updated>2025-06-01T00:00:00Z</updated>
<title>Paper
 ${id}</title><arxiv:comment>${comment}</arxiv:comment>
<arxiv:primary_category term="cs.LG"/><author><name>A &amp; B</name></author></entry>`;
const feed = (...ids: string[]) =>
  `<feed>${ids.map((id) => entry(id)).join("")}</feed>`;

const slot: Slot = {
  field: "ml",
  series: "X",
  year: 2025,
  cap: 1,
  queries: ['co:"X 2025"', 'co:"Y 2025"'],
  max_results: 2,
  venue: "x",
  classSpec: "neurips",
};
const all = async (g: AsyncGenerator<Found>) => {
  const out: Found[] = [];
  for await (const f of g) out.push(f);
  return out;
};
const brief = (fs: readonly Found[]) =>
  fs.map((f) =>
    "searchError" in f ? f : { id: f.id, rank: f.rank, query: f.query },
  );

describe("arXiv's feed", () => {
  test("an entry's fields, entities decoded, a missing tag empty", () => {
    // Guards: what a candidate carries into rule 1.
    expect(
      parseFeed(`${feed("2501.00001v2")}<entry><id>x/abs/2</id></entry>`),
    ).toEqual([
      {
        id: "2501.00001v2",
        updated: "2025-06-01",
        title: "Paper 2501.00001v2",
        comment: "Accepted at X 2025",
        journal_ref: "",
        category: "cs.LG",
        authors: ["A & B"],
      },
      {
        id: "2",
        updated: "",
        title: "",
        comment: "",
        journal_ref: "",
        category: "",
        authors: [],
      },
    ]);
    // Guards: the version is dropped from an id.
    expect(baseId("2501.00001v12")).toBe("2501.00001");
  });
});

describe("arXiv comment search", () => {
  test("queries in turn, page by page, a repeated id skipped, ranks in that order", async () => {
    const { get, asked } = fakeGet([
      ["Y+2025%22&sortBy=submittedDate&sortOrder=descending&start=2", feed()],
      [
        "Y+2025%22&sortBy=submittedDate&sortOrder=descending&start=0",
        feed("c", "a"),
      ],
      ["start=0", feed("a", "b")],
      [
        "X+2025%22&sortBy=submittedDate&sortOrder=descending&start=2",
        feed("d"),
      ],
    ]);
    const found = await all(arxivCandidates(get, slot, 3));
    // Guards: the fixed order a reader audits in the probe log.
    expect(brief(found)).toEqual([
      { id: "a", rank: 1, query: 'co:"X 2025"' },
      { id: "b", rank: 2, query: 'co:"X 2025"' },
      { id: "d", rank: 3, query: 'co:"X 2025"' },
      { id: "c", rank: 4, query: 'co:"Y 2025"' },
    ]);
    // Guards: a short page ends a query; no page beyond it is asked.
    expect(asked.length).toBe(4);
  });

  test("at most maxPages pages, and a failed page ends the slot", async () => {
    const pages = fakeGet([["start=0", feed("a", "b")]]);
    // Guards: maxPages 1 asks one page even when it is full.
    expect(
      brief(
        await all(
          arxivCandidates(pages.get, { ...slot, queries: ['co:"X 2025"'] }, 1),
        ),
      ),
    ).toEqual([
      { id: "a", rank: 1, query: 'co:"X 2025"' },
      { id: "b", rank: 2, query: 'co:"X 2025"' },
    ]);
    const failing = fakeGet([["start=0", { status: "503 after 4 attempts" }]]);
    // Guards: the error is yielded, and the second query is never asked.
    expect(await all(arxivCandidates(failing.get, slot, 3))).toEqual([
      { searchError: 'co:"X 2025" page 0: 503 after 4 attempts' },
    ]);
    expect(failing.asked.length).toBe(1);
  });
});

const s2Page = (
  ids: readonly (string | null | Readonly<{ bare: string }>)[],
  token?: string,
) =>
  JSON.stringify({
    ...(token === undefined ? {} : { token }),
    data: ids.map((id) =>
      id === null
        ? { title: null, venue: null }
        : typeof id === "object"
          ? { externalIds: { ArXiv: id.bare } }
          : {
              title: `T${id}`,
              venue: "OSDI",
              publicationDate: null,
              externalIds: { ArXiv: id },
            },
    ),
  });
const s2Slot: Slot = { ...slot, source: "semantic-scholar", s2Venue: "OSDI" };

describe("the Semantic Scholar listing", () => {
  test("the URL names the S2 venue, else the series", () => {
    // Guards: the venue S2 spells, and the fallback.
    expect([s2Url(s2Slot), s2Url(slot)]).toEqual([
      "https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=*&venue=OSDI&year=2025&fields=title,externalIds,venue,year,publicationDate",
      "https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=*&venue=X&year=2025&fields=title,externalIds,venue,year,publicationDate",
    ]);
  });

  test("pages followed by token, deduplicated, in arXiv-id order, with arXiv's metadata", async () => {
    const { get, asked } = fakeGet([
      ["token=t1", s2Page(["2501.00003", "2501.00001"])],
      ["semanticscholar", s2Page(["2501.00002", null, "2501.00001"], "t1")],
      ["id_list=", feed("2501.00001v1", "2501.00002v3")],
    ]);
    const found = await all(s2Candidates(get, s2Slot));
    // Guards: ranks by arXiv id; an id arXiv does not describe comes with empty metadata.
    expect(
      found.map((f) =>
        "searchError" in f ? f : [f.id, f.rank, f.updated, f.s2],
      ),
    ).toEqual([
      [
        "2501.00001v1",
        1,
        "2025-06-01",
        { venue: "OSDI", publicationDate: null },
      ],
      [
        "2501.00002v3",
        2,
        "2025-06-01",
        { venue: "OSDI", publicationDate: null },
      ],
      ["2501.00003", 3, "", { venue: "OSDI", publicationDate: null }],
    ]);
    // Guards: one metadata request for the three ids.
    expect(asked[2]).toBe(
      "https://export.arxiv.org/api/query?id_list=2501.00001,2501.00002,2501.00003&max_results=50",
    );
  });

  test("a listing stops after 20 pages", async () => {
    // Page i answers with the token of page i+1; checked from the highest, so "p1" never catches "p12".
    const pages = Array.from({ length: 24 }, (_, i) => i + 1)
      .toReversed()
      .map(
        (i) =>
          [
            `token=p${String(i)}`,
            s2Page([String(i)], `p${String(i + 1)}`),
          ] as const,
      );
    const { get, asked } = fakeGet([
      ["id_list=", feed()],
      ...pages,
      ["semanticscholar", s2Page([{ bare: "0" }], "p1")],
    ]);
    await all(s2Candidates(get, s2Slot));
    // Guards: 20 listing pages, then the metadata request.
    expect(asked.filter((u) => u.includes("semanticscholar")).length).toBe(20);
  });
});

describe("the Semantic Scholar listing fails", () => {
  test.each([
    [
      "the listing fails",
      [["semanticscholar", { status: "429 after 4 attempts" }]],
      "s2 429 after 4 attempts",
    ],
    [
      "the listing is not understood",
      [["semanticscholar", "{}"]],
      "s2 answer not understood",
    ],
    [
      "a later page fails",
      [
        ["token=t1", { status: "500" }],
        ["semanticscholar", s2Page(["1"], "t1")],
      ],
      "s2 500",
    ],
    [
      "arXiv's metadata fails",
      [
        ["semanticscholar", s2Page(["1"])],
        ["id_list=", { status: "503" }],
      ],
      "arXiv metadata of listed ids from rank 1: 503",
    ],
  ] as const)("%s: one search error", async (_, routes, searchError) => {
    // Guards: the slot's walk ends with the reason, as the run log shows it.
    expect(await all(s2Candidates(fakeGet(routes).get, s2Slot))).toEqual([
      { searchError },
    ]);
  });
});

describe("the licence and the e-print", () => {
  test("the OAI record's licence, its absence, a failure; the e-print URL", async () => {
    const { get, asked } = fakeGet([
      [
        "2501.00001",
        "<record><license>http://creativecommons.org/licenses/by/4.0/</license></record>",
      ],
      ["2501.00002", "<record/>"],
      ["src/", "bytes"],
    ]);
    // Guards: the three outcomes of the licence lookup, the version dropped from the identifier.
    expect([
      await licenceUrl(get, "2501.00001v2"),
      await licenceUrl(get, "2501.00002"),
      await licenceUrl(get, "2501.00009"),
    ]).toEqual([
      { ok: true, url: "http://creativecommons.org/licenses/by/4.0/" },
      { ok: true, url: undefined },
      { ok: false, status: "404" },
    ]);
    // Guards: the versioned e-print.
    expect((await eprint(get, "2501.00001v2")).ok).toBe(true);
    expect(asked).toEqual([
      "https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:2501.00001&metadataPrefix=arXiv",
      "https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:2501.00002&metadataPrefix=arXiv",
      "https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:2501.00009&metadataPrefix=arXiv",
      "https://arxiv.org/src/2501.00001v2",
    ]);
  });
});
