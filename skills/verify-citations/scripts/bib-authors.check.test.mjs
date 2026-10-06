/**
 * bib-authors.mjs's comparison (`checkAuthors`) and its reading of DBLP's answer (`dblpHits`).
 *
 * `checkAuthors` takes its lookup and its pause as parameters for exactly this: the buckets it
 * sorts entries into — finding, matched, not applicable, NOT CHECKED — are our logic, and each is
 * driven here with a lookup that answers on purpose. `dblpHits` is our parser of DBLP's search
 * JSON; it is fed that documented shape (`result.hits.hit[].info`), which pins how WE read it,
 * not how DBLP behaves — the colocated bib-authors.test.mjs keeps the live service out of tests.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  checkAuthors,
  claimsPublished,
  dblpHits,
  parseBib,
  surnames,
} from "./bib-authors.mjs";

afterEach(() => vi.unstubAllGlobals());

const entry = (key, author, title, booktitle = "Proc. X") => ({
  type: "inproceedings",
  key,
  author,
  title,
  booktitle,
  journal: "",
});
const hit = (
  title,
  authors,
  venue = "X",
  type = "Conference and Workshop Papers",
) => ({
  title,
  authors,
  venue,
  year: "2024",
  type,
});

test("checkAuthors sorts every kind of entry into its bucket", async () => {
  const parsed = [
    entry("same", "Ada Lovelace and Alan Turing", "Same Paper"),
    entry("dropped", "Ada Lovelace", "Dropped Author"),
    entry("order", "Alan Turing and Ada Lovelace", "Order Swapped"),
    entry("pre", "Ada Lovelace", "A Preprint", "arXiv preprint"),
    entry("etal", "Ada Lovelace and others", "Truncated"),
    entry("nomatch", "Ada Lovelace", "Nobody Has This"),
    entry("onlycorr", "Ada Lovelace", "Only On CoRR"),
    entry("down", "Ada Lovelace", "Service Down"),
  ];
  const answers = {
    "Same Paper": [hit("Same Paper.", ["Ada Lovelace", "Alan Turing"])],
    "Dropped Author": [hit("Dropped Author", ["Ada Lovelace", "Alan Turing"])],
    "Order Swapped": [hit("Order Swapped", ["Ada Lovelace", "Alan Turing"])],
    "Nobody Has This": [hit("Something Else", ["X"])],
    "Only On CoRR": [
      hit("Only On CoRR", ["Ada Lovelace"], "CoRR", "Informal Publications"),
    ],
  };
  const pauses = [];
  const result = await checkAuthors(parsed, {
    lookup: async (title) => {
      if (title === "Service Down") throw new Error("DBLP 500");
      return answers[title];
    },
    pause: (ms) => pauses.push(ms),
  });
  assert.deepEqual(
    { ...result, pauses },
    {
      findings: [
        {
          key: "dropped",
          venue: "X 2024",
          ours: ["lovelace"],
          theirs: ["lovelace", "turing"],
          missing: ["turing"],
          extra: [],
          orderDiffers: false,
        },
        {
          key: "order",
          venue: "X 2024",
          ours: ["turing", "lovelace"],
          theirs: ["lovelace", "turing"],
          missing: [],
          extra: [],
          orderDiffers: true,
        },
      ],
      skipped: [
        {
          key: "etal",
          why: "author list ends in `and others` — completeness not checkable",
        },
        { key: "nomatch", why: "no DBLP title match" },
        { key: "onlycorr", why: "only a preprint record on DBLP" },
      ],
      unchecked: [{ key: "down", why: "DBLP lookup failed: DBLP 500" }],
      matched: ["same"],
      // 900 ms after each compared entry; 1500 and 3000 between the three failed attempts.
      pauses: [900, 900, 900, 1500, 3000],
    },
  );
});

test("a lookup that fails once and then answers is retried, not reported", async () => {
  let calls = 0;
  const result = await checkAuthors([entry("k", "Ada Lovelace", "Flaky")], {
    lookup: async () => {
      if (calls++ === 0)
        throw Object.assign(new Error("DBLP 429"), { retryable: true });
      return [hit("Flaky", ["Ada Lovelace"])];
    },
    pause: () => {},
  });
  assert.deepEqual(result, {
    findings: [],
    skipped: [],
    unchecked: [],
    matched: ["k"],
  });
});

test("the default pause really waits", async () => {
  vi.useFakeTimers();
  try {
    const done = checkAuthors([entry("k", "Ada Lovelace", "T")], {
      lookup: async () => [hit("T", ["Ada Lovelace"])],
    });
    await vi.advanceTimersByTimeAsync(900);
    assert.deepEqual((await done).matched, ["k"]);
  } finally {
    vi.useRealTimers();
  }
});

/** A stubbed fetch that answers every request with `status` and `body`, recording the URLs. */
function fakeDblp(status, body) {
  const urls = [];
  vi.stubGlobal("fetch", async (url) => {
    urls.push(url);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    });
  });
  return urls;
}

test("dblpHits reads DBLP's hit list: one author or several, the disambiguation number dropped", async () => {
  const urls = fakeDblp(200, {
    result: {
      hits: {
        hit: [
          {
            info: {
              title: "One",
              venue: "ICSE",
              year: "2024",
              type: "Conference and Workshop Papers",
              authors: { author: { text: "Ada Lovelace 0001" } },
            },
          },
          {
            info: {
              title: "Two",
              authors: { author: [{ text: "A B" }, { text: "C D" }] },
            },
          },
          { info: {} },
          {},
        ],
      },
    },
  });
  assert.deepEqual(
    { hits: await dblpHits("a title"), urls },
    {
      hits: [
        {
          venue: "ICSE",
          year: "2024",
          type: "Conference and Workshop Papers",
          title: "One",
          authors: ["Ada Lovelace"],
        },
        {
          venue: "",
          year: "",
          type: "",
          title: "Two",
          authors: ["A B", "C D"],
        },
        { venue: "", year: "", type: "", title: "", authors: [] },
        { venue: "", year: "", type: "", title: "", authors: [] },
      ],
      urls: ["https://dblp.org/search/publ/api/?q=a%20title&format=json&h=6"],
    },
  );
});

test("dblpHits: no hits is an empty list; 429 is retryable; other errors are not", async () => {
  fakeDblp(200, {});
  const none = await dblpHits("x");
  fakeDblp(429);
  const limited = await dblpHits("x").catch((e) => [e.message, e.retryable]);
  fakeDblp(500);
  const down = await dblpHits("x").catch((e) => [e.message, e.retryable]);
  assert.deepEqual(
    [none, limited, down],
    [[], ["DBLP 429", true], ["DBLP 500", undefined]],
  );
});

test("parseBib reads quoted and bare field values, and a field that is absent", () => {
  assert.deepEqual(
    parseBib(
      '@article{k, author = "Ada Lovelace", title = {T}, journal = J, }',
    ),
    [
      {
        type: "article",
        key: "k",
        author: "Ada Lovelace",
        title: "T",
        booktitle: "",
        journal: "J",
      },
    ],
  );
});

test("parseBib: braces nested inside a value, and a bare last value with no comma after it", () => {
  assert.deepEqual(
    parseBib("@article{k, title = {The {BERT} Model}, journal = J}"),
    [
      {
        type: "article",
        key: "k",
        author: "",
        title: "The {BERT} Model",
        booktitle: "",
        journal: "J",
      },
    ],
  );
});

test("surnames of nothing is nothing; a name with an empty family part contributes nothing", () => {
  assert.deepEqual(
    [surnames(""), surnames(", Ada and Lovelace")],
    [[], ["lovelace"]],
  );
});

test("an entry naming no venue at all does not claim to be published", () => {
  assert.equal(claimsPublished({ booktitle: "", journal: "" }), false);
});
