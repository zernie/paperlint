/**
 * Source tags (#400): the page-level `sources`, the `from` and `caption_from` fields that name one,
 * what the build refuses by path, and what the page is handed.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import {
  ITEMS,
  build,
  config,
  run,
  setup,
} from "../../../test/label-page-kit.ts";

const SOURCES = { repo: "From the repository", ours: "Our restatement" };
const EXCERPT = { lines: [{ n: 3, text: "x = 1", mark: true }] };
const [FIRST, SECOND, ...REST] = ITEMS;
assert.ok(FIRST !== undefined && SECOND !== undefined);

/** A page whose first two cards carry a quote, a situation and an excerpt, each tagged by `tags`. */
function tagged(
  tags: {
    readonly quote?: string;
    readonly situation?: string;
    readonly excerpt?: string;
    readonly caption?: string;
  },
  over: Record<string, unknown> = {},
) {
  return config({
    sources: SOURCES,
    items: [
      {
        ...FIRST,
        quote: { text: "Use tabs", ...pick("from", tags.quote) },
        situation: {
          summary: "A reviewer objected.",
          question: "Is line 3 right?",
          ...pick("from", tags.situation),
        },
        excerpt: {
          ...EXCERPT,
          caption: "The reviewer wrote: no.",
          ...pick("from", tags.excerpt),
          ...pick("caption_from", tags.caption),
        },
      },
      SECOND,
      ...REST,
    ],
    ...over,
  });
}
const pick = (key: string, value: string | undefined) =>
  value === undefined ? {} : { [key]: value };
const ALL = {
  quote: "repo",
  situation: "ours",
  excerpt: "repo",
  caption: "ours",
};

const Data = z
  .object({
    sources: z
      .array(z.object({ id: z.string(), label: z.string() }))
      .optional(),
    items: z.array(z.record(z.string(), z.unknown())),
  })
  .loose();
const dataOf = (page: string) =>
  Data.parse(
    JSON.parse(
      String(
        page
          .split('<script type="application/json" id="data">')[1]
          ?.split("</script>")[0],
      ).replaceAll("<\\/", "</"),
    ),
  );

test("🔴 sources and the four tags reach the page whole, in colour order; a page without sources carries none of it", () => {
  const data = dataOf(build(setup("src-happy", tagged(ALL))).page);
  assert.deepEqual(
    [
      data.sources,
      ...["quote", "situation", "excerpt"].map(
        (k) =>
          z
            .object({ from: z.string() })
            .loose()
            .parse(data.items.find((i) => k in i)?.[k]).from,
      ),
      z
        .object({ caption_from: z.string() })
        .loose()
        .parse(data.items.find((i) => "excerpt" in i)?.["excerpt"])
        .caption_from,
    ],
    [
      [
        { id: "repo", label: SOURCES.repo },
        { id: "ours", label: SOURCES.ours },
      ],
      "repo",
      "ours",
      "repo",
      "ours",
    ],
  );
  const plain = build(setup("src-none", config())).page;
  // Guards: no sources, no key on the page, so it is as it was.
  assert.equal(Object.hasOwn(dataOf(plain), "sources"), false);
  assert.equal(plain.includes('"from"'), false);
});

const PRACTICE_TAGGED = config({
  sources: { repo: "From the repository" },
  practice: [
    {
      body: "p",
      quote: { text: "q", from: "repo" },
      expected: { label: "yes", boundary: "clear" },
      why: "w",
    },
    ...(config()["practice"] as readonly Record<string, unknown>[]).slice(1),
  ],
});

/** Pages the build refuses, each with its whole refusal. */
const REFUSED: readonly (readonly [string, Record<string, unknown>, string])[] =
  [
    [
      "src-no-sources",
      config({
        items: [
          { ...FIRST, quote: { text: "t", from: "repo" } },
          SECOND,
          ...REST,
        ],
      }),
      "items[0].quote.from: names the source 'repo', and the page has no `sources` — add them, or take the tag out",
    ],
    [
      "src-unknown-id",
      tagged({ quote: "repo", situation: "nope" }),
      "items[0].situation.from: 'nope' is not in `sources` (repo, ours)",
    ],
    [
      "src-unknown-caption",
      tagged({ quote: "repo", caption: "nope" }),
      "items[0].excerpt.caption_from: 'nope' is not in `sources` (repo, ours)",
    ],
    [
      "src-dead-entry",
      tagged({ quote: "repo" }, { sources: { ...SOURCES, spare: "Spare" } }),
      "sources.ours: no item or practice item names it — a tag nothing carries is a dead entry",
    ],
    [
      "src-empty-label",
      tagged(
        { quote: "repo", situation: "ours" },
        { sources: { repo: "", ours: "O" } },
      ),
      "sources.repo: must be a non-empty string, got ''",
    ],
    [
      "src-too-many",
      tagged(
        { quote: "a" },
        { sources: Object.fromEntries("abcdef".split("").map((c) => [c, c])) },
      ),
      "sources: 6 ids, and the page has 5 colours for tags — merge ids, or drop one",
    ],
    [
      "src-no-caption",
      config({
        sources: SOURCES,
        items: [
          { ...FIRST, excerpt: { ...EXCERPT, caption_from: "repo" } },
          { ...SECOND, quote: { text: "t", from: "ours" } },
          ...REST,
        ],
      }),
      "items[0].excerpt.caption_from: tags a text the card does not have — add it, or take the tag out",
    ],
    [
      "src-no-summary",
      config({
        sources: SOURCES,
        items: [
          {
            ...FIRST,
            situation: { question: "Is line 3 right?", from: "repo" },
            excerpt: EXCERPT,
          },
          { ...SECOND, quote: { text: "t", from: "ours" } },
          ...REST,
        ],
      }),
      "items[0].situation.from: tags a text the card does not have — add it, or take the tag out",
    ],
  ];

test("🔴 the build refuses a tag with no sources, an id not in sources, a dead entry, an empty label, more ids than colours, and a tag over a text the card lacks", () => {
  assert.deepEqual(
    REFUSED.map(([name, cfg]) => {
      const dir = setup(name, cfg);
      return run(["build", join(dir, "items.json"), join(dir, "out")]);
    }),
    REFUSED.map(([, , message]) => ({
      status: 1,
      out: `REFUSED: ${message}\n`,
    })),
  );
});

test("a practice item may carry a tag, and it counts as using the source", () => {
  const { page } = build(
    setup("src-practice", {
      ...PRACTICE_TAGGED,
      items: [{ ...FIRST }, ...ITEMS.slice(1)],
    }),
  );
  assert.deepEqual(dataOf(page).sources, [
    { id: "repo", label: "From the repository" },
  ]);
});
