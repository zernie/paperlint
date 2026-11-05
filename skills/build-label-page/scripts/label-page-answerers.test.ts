/**
 * Two people answer the same page (`answerers`), and a card must be on screen a while before its
 * answer saves (`min_seconds`): the build's checks, the key, the dump check and the export. The page
 * itself is label-page-browser.test.ts. Each check both ways: quiet on a good input, refusing a bad one.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "remeda";
import { test } from "vitest";
import { z } from "zod";
import {
  DONE_PRACTICE,
  ITEMS,
  config,
  exportAt,
  labelsFile,
  run,
  setup,
} from "../../../test/label-page-kit.ts";

/** Four items: three shown to both answerers, the fourth to `author` only. */
const FOUR = [
  ...ITEMS.slice(0, 3),
  R.merge(ITEMS[3], { answerers: ["author"] }),
];
const TWO = (over: Record<string, unknown> = {}) =>
  config({ answerers: ["author", "second"], items: FOUR, ...over });

const RawKey = z
  .object({
    answerers: z.array(z.string()).optional(),
    min_seconds: z.number().optional(),
    ids: z.record(
      z.string(),
      z
        .object({ source_id: z.string(), answerers: z.unknown().optional() })
        .loose(),
    ),
  })
  .loose();
const keyOf = (dir: string) =>
  RawKey.parse(JSON.parse(readFileSync(join(dir, "out", "key.json"), "utf8")));
const buildAt = (dir: string) =>
  run(["build", join(dir, "items.json"), join(dir, "out")]);
/** The neutral id of the item drawn from `case-<n>`. */
const nidOf = (dir: string, n: number): string => {
  const hit = R.entries(keyOf(dir).ids).find(
    ([, v]) => v.source_id === `case-${String(1000 + n)}`,
  );
  assert.ok(hit !== undefined);
  return hit[0];
};
const dumpAt = (dir: string, dump: unknown): void => {
  writeFileSync(join(dir, "dump.json"), JSON.stringify(dump));
};
const prefixed = (who: string, docs: Record<string, unknown>) =>
  R.mapKeys(docs, (k) => `${who}~${k}`);

test("🔴 build refuses answerers that two people could not tell apart, and an item's subset naming someone unknown", () => {
  const cases: readonly (readonly [string, Record<string, unknown>, string])[] =
    [
      [
        "one",
        { answerers: ["author"] },
        "answerers: needs 2 or more entries, has 1",
      ],
      [
        "twice",
        { answerers: ["author", "second", "author"] },
        "answerers[2]: 'author' is repeated",
      ],
      [
        "separator",
        { answerers: ["author", "a~b"] },
        "answerers[1]: 'a~b' must be letters",
      ],
      [
        "unknown",
        {
          answerers: ["author", "second"],
          items: [{ ...ITEMS[0], answerers: ["third"] }],
        },
        "items[0].answerers[0]: 'third' is not in `answerers` (author, second)",
      ],
      [
        "item-twice",
        {
          answerers: ["author", "second"],
          items: [{ ...ITEMS[0], answerers: ["second", "second"] }],
        },
        "items[0].answerers[1]: 'second' is repeated",
      ],
      [
        "no-page-list",
        { items: [{ ...ITEMS[0], answerers: ["author"] }] },
        "items[0].answerers: the page has no `answerers` — add the page's list, or take this out",
      ],
      ["zero", { min_seconds: 0 }, "min_seconds: 0 — must be 1 or more"],
    ];
  for (const [name, over, message] of cases) {
    const r = buildAt(setup(`answerers-refuse-${name}`, config(over)));
    assert.notEqual(r.status, 0, name);
    assert.ok(r.out.includes(`REFUSED: ${message}`), `${name}\n${r.out}`);
  }
});

test("🔴 the key carries the answerers, each item's own subset and min_seconds; the page gets them", () => {
  const dir = setup("answerers-key", TWO({ min_seconds: 30 }));
  const r = buildAt(dir);
  assert.equal(r.status, 0, r.out);
  const key = keyOf(dir);
  assert.deepEqual(key.answerers, ["author", "second"]);
  assert.equal(key.min_seconds, 30);
  assert.deepEqual(key.ids[nidOf(dir, 3)]?.answerers, ["author"]);
  assert.equal(key.ids[nidOf(dir, 0)]?.answerers, undefined);
  const page = readFileSync(join(dir, "out", "page.html"), "utf8");
  assert.match(page, /"answerers": \["author", "second"\]/);
  assert.match(page, /"min_seconds": 30/);
  assert.match(page, /"answerers": \["author"\]/);
});

/** What the export writes for one stored document of the page's own: no reason, saved now. */
const exported = (
  answers: Record<string, string | null>,
  more: Record<string, unknown> = {},
) =>
  R.merge(
    {
      answers,
      invalid_answers: {},
      reasons: {},
      unexplained: [],
      complete: Object.values(answers).every((v) => v !== null),
      source: "page",
      saved_at: null,
    },
    more,
  );
const YES = { label: "yes", boundary: "clear" };
const NONE = { label: null, boundary: null };
const noFamiliarity = { familiarity: null, invalid_familiarity: null };

test("🔴 without answerers or min_seconds, the key, the page data and the export are what they were", () => {
  const dir = setup("answerers-none", config({ items: ITEMS.slice(0, 2) }));
  assert.equal(buildAt(dir).status, 0);
  const rawKey = readFileSync(join(dir, "out", "key.json"), "utf8");
  assert.doesNotMatch(rawKey, /answerers|min_seconds/);
  const page = readFileSync(join(dir, "out", "page.html"), "utf8");
  assert.doesNotMatch(page, /"answerers"|"min_seconds"/);
  const [a, b] = [nidOf(dir, 0), nidOf(dir, 1)];
  const saved = "2026-01-02T10:00:00Z";
  dumpAt(dir, {
    answers: { [a]: { answers: YES, savedAt: saved, source: "page" } },
    groups: { rust: { familiarity: "well", source: "page" } },
    practice: DONE_PRACTICE,
  });
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  // The labels list the items in id order.
  const items = R.sortBy(
    [
      [
        a,
        exported(YES, {
          id: a,
          source_id: "case-1000",
          group: "rust",
          saved_at: saved,
        }),
      ],
      [
        b,
        exported(NONE, {
          id: b,
          source_id: "case-1001",
          group: "python",
          source: null,
        }),
      ],
    ] as const,
    ([id]) => id,
  ).map(([, item]) => item);
  assert.deepEqual(JSON.parse(labelsFile(dir)), {
    study: "demo-gold",
    exported: "2026-01-02",
    questions: ["label", "boundary"],
    items,
    // Object keys compare in any order: deepEqual reads them as a set.
    groups: {
      rust: R.merge(noFamiliarity, {
        familiarity: "well",
        source: "page",
        saved_at: null,
      }),
      python: R.merge(noFamiliarity, { source: null, saved_at: null }),
    },
    complete_items: 1,
    invalid_items: 0,
    invalid_groups: 0,
    total_items: 2,
  });
});

/** The four-item page answered by both: author all but one, second one of three; then exported. */
function exportTwo() {
  const dir = setup("answerers-export", TWO({ min_seconds: 30 }));
  assert.equal(buildAt(dir).status, 0);
  const [a, d] = [nidOf(dir, 0), nidOf(dir, 3)];
  const no = { label: "no", boundary: "clear" };
  dumpAt(dir, {
    answers: {
      [`author~${a}`]: { answers: YES, seconds: 41, source: "page" },
      [`second~${a}`]: { answers: no, seconds: 33, source: "page" },
      [`author~${d}`]: { answers: YES, seconds: 30, source: "page" },
    },
    groups: { "author~rust": { familiarity: "well", source: "page" } },
    practice: {
      ...prefixed("author", DONE_PRACTICE),
      "second~r1-P1": { answers: YES, source: "page" },
    },
  });
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  const file = z
    .object({
      answerers: z.array(z.string()),
      items: z.array(
        z
          .object({
            id: z.string(),
            by_answerer: z.record(z.string(), z.unknown()),
          })
          .loose(),
      ),
      by_answerer: z.record(
        z.string(),
        z.object({
          complete_items: z.number(),
          total_items: z.number(),
          groups: z.record(z.string(), z.unknown()),
        }),
      ),
    })
    .loose()
    .parse(JSON.parse(labelsFile(dir)));
  return { dir, out: r.out, file, a, d, no };
}

test("🔴 export keeps each answerer's answers to an item apart, with the seconds on screen", () => {
  const { file, a, d, no } = exportTwo();
  assert.deepEqual(file.answerers, ["author", "second"]);
  assert.deepEqual(
    file.items.find((i) => i.id === a),
    {
      id: a,
      source_id: "case-1000",
      group: "rust",
      answerers: ["author", "second"],
      by_answerer: {
        author: exported(YES, { seconds: 41 }),
        second: exported(no, { seconds: 33 }),
      },
    },
  );
  assert.deepEqual(
    Object.keys(file.items.find((i) => i.id === d)?.by_answerer ?? { none: 1 }),
    ["author"],
  );
});

test("🔴 export counts, reports and scores the practice per answerer", () => {
  const { dir, out, file } = exportTwo();
  assert.deepEqual(
    R.mapValues(file.by_answerer, (c) => [
      c.complete_items,
      c.total_items,
      R.keys(c.groups).sort(),
    ]),
    {
      author: [2, 4, ["go", "python", "rust"]],
      second: [1, 3, ["go", "python", "rust"]],
    },
  );
  assert.match(
    out,
    /author: 2 of 4 items complete; second: 1 of 3 items complete/,
  );
  assert.match(
    out,
    new RegExp(`incomplete second~${nidOf(dir, 1)}: missing label, boundary`),
  );
  assert.match(out, /group second~rust: no familiarity answer/);
  // Each answerer's practice is scored on its own, into its own file.
  assert.match(out, /practice round 1 \(author\): 3 of 3 matched/);
  assert.match(
    out,
    /practice round 1 \(second\): 1 of 3 matched; missed P2, P3/,
  );
  const second = z
    .object({ answerer: z.string(), matched: z.number() })
    .loose()
    .parse(
      JSON.parse(
        readFileSync(
          join(dir, "data", "demo-gold-practice-r1-second-2026-01-02.json"),
          "utf8",
        ),
      ),
    );
  assert.deepEqual([second.answerer, second.matched], ["second", 1]);
});

test("🔴 export refuses a document of no answerer, of an unknown one, or of an item not shown to its answerer", () => {
  const dir = setup("answerers-refuse-dump", TWO({ min_seconds: 30 }));
  assert.equal(buildAt(dir).status, 0);
  const [a, d] = [nidOf(dir, 0), nidOf(dir, 3)];
  const doc = { answers: { label: "yes" }, source: "page" };
  const cases: readonly (readonly [string, unknown, string])[] = [
    [
      "plain",
      { answers: { [a]: doc } },
      `answers/${a}: this page has answerers (author, second), so a document's id is <answerer>~<id>`,
    ],
    [
      "stranger",
      { answers: { [`third~${a}`]: doc } },
      `answers/third~${a}: 'third' is not an answerer of this page (author, second)`,
    ],
    [
      "not-shown",
      { answers: { [`second~${d}`]: doc } },
      `answers/second~${d}: the key does not know this answer for second`,
    ],
    [
      "group-plain",
      { groups: { rust: { familiarity: "well", source: "page" } } },
      "groups/rust: this page has answerers",
    ],
    [
      "practice-unknown",
      { practice: { "second~r1-P9": { answers: {}, source: "page" } } },
      "practice/second~r1-P9: the key does not know this practice item",
    ],
    [
      "seconds",
      {
        answers: {
          [`author~${a}`]: R.merge(doc, { seconds: "long" }),
        },
      },
      `answers/author~${a}/seconds: 'long' — must be a whole number of seconds or null`,
    ],
  ];
  for (const [name, dump, message] of cases) {
    dumpAt(dir, dump);
    const r = exportAt(dir);
    assert.notEqual(r.status, 0, name);
    assert.ok(r.out.includes(`REFUSED: ${message}`), `${name}\n${r.out}`);
  }
});

test("🔴 without answerers, a prefixed document id is a document the key does not know", () => {
  const dir = setup("answerers-none-prefixed", config());
  assert.equal(buildAt(dir).status, 0);
  const a = nidOf(dir, 0);
  dumpAt(dir, {
    answers: { [`author~${a}`]: { answers: {}, source: "page" } },
  });
  const r = exportAt(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.out, new RegExp(`answers/author~${a}: the key does not know`));
  // Nor does a page built without min_seconds store seconds.
  dumpAt(dir, {
    answers: { [a]: { answers: {}, seconds: 3, source: "page" } },
  });
  assert.match(
    exportAt(dir).out,
    new RegExp(`answers/${a}/seconds: not a field of a stored answer`),
  );
});
