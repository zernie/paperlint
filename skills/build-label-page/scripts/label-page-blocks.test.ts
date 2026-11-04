/**
 * The content blocks (`situation`, `excerpt`, `references`, `more`, `table`, `repeat`) and the
 * page's `labels`, on a fixture that is not about linters at all (a code review): the core's checks,
 * both ways, and what a card shows, in the fake DOM. Phone layout and saving are in
 * label-page-browser.test.ts; the linter preset is in label-page-presets.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import {
  build,
  openLive,
  run,
  setup,
  showPage,
} from "../../../test/label-page-kit.ts";

const Fixture = z
  .object({
    practice: z.array(
      z.object({ expected: z.record(z.string(), z.string()) }).loose(),
    ),
    items: z.array(z.record(z.string(), z.unknown())),
  })
  .loose();
/** A code-review page: every word on its cards comes from this file, none from the generator. */
const FIXTURE = Fixture.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "fixtures", "blocks-items.json"),
      "utf8",
    ),
  ),
);
const page = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...FIXTURE,
  ...over,
});
/** The fixture's items with `change` applied to the first one. */
const firstItem = (
  change: (i: Record<string, unknown>) => Record<string, unknown>,
) => page({ items: FIXTURE.items.map((i, n) => (n === 0 ? change(i) : i)) });
const PRACTICE_DONE = Object.fromEntries(
  FIXTURE.practice.map((p, n) => [
    `r1-P${String(n + 1)}`,
    { answers: p.expected, source: "page" },
  ]),
);
const [FIRST] = FIXTURE.items;
assert.ok(FIRST !== undefined);
const Excerpt = z
  .object({ lines: z.array(z.record(z.string(), z.unknown())) })
  .loose();
const firstExcerpt = Excerpt.parse(FIRST["excerpt"]);
const withMarkedLine = (text: string) => ({
  ...firstExcerpt,
  lines: firstExcerpt.lines.map((l) =>
    l["mark"] === true ? { ...l, text } : l,
  ),
});
const LEAK =
  "the source id 'review-sql-1' appears in the visible `FIELD` of item review-sql-1. Take it out of the text (or use source ids that are not natural words).";

/** Pages the core refuses, each with its whole refusal. */
const REFUSED: readonly (readonly [string, Record<string, unknown>, string])[] =
  [
    [
      "blocks-no-mark",
      firstItem((i) => ({
        ...i,
        excerpt: {
          ...firstExcerpt,
          lines: firstExcerpt.lines.map((l) => ({ ...l, mark: false })),
        },
      })),
      "items[0].excerpt.lines: no line is marked — mark the line the card is about (`mark: true`)",
    ],
    [
      "blocks-line-no-excerpt",
      firstItem((i) =>
        Object.fromEntries(Object.entries(i).filter(([k]) => k !== "excerpt")),
      ),
      "items[0].situation.summary: `{line}` names the excerpt's marked line, and the card has no `excerpt` — add it, or write the summary without `{line}`",
    ],
    [
      "blocks-source-in-reference",
      firstItem((i) => ({
        ...i,
        references: {
          summary: "s",
          entries: [
            { title: "t", fields: [{ text: "drawn for review-sql-1" }] },
          ],
        },
      })),
      LEAK.replace("FIELD", "references"),
    ],
    [
      "blocks-source-after-newline",
      firstItem((i) => ({
        ...i,
        table: {
          summary: "s",
          rows: [{ label: "l", value: "v", plain: "one\nreview-sql-1" }],
        },
      })),
      LEAK.replace("FIELD", "table"),
    ],
    [
      "blocks-source-after-tab",
      firstItem((i) => ({ ...i, excerpt: withMarkedLine("\treview-sql-1") })),
      LEAK.replace("FIELD", "excerpt"),
    ],
    [
      "blocks-repeat-range",
      firstItem((i) => ({ ...i, repeat: { group: "g", index: 3, of: 2 } })),
      "items[0].repeat.index: 3 is not between 1 and 2",
    ],
    [
      "blocks-mark-tone",
      firstItem((i) => ({
        ...i,
        table: {
          summary: "s",
          rows: [
            { label: "l", value: "v", mark: { tone: "maybe", text: "?" } },
          ],
        },
      })),
      "items[0].table.rows[0].mark.tone: 'maybe' must be yes or no",
    ],
  ];

test("🔴 the blocks refuse an excerpt with no marked line, `{line}` without an excerpt, a source id in any rendered string (a reference, after a newline, after a tab), a repeat out of range and an unknown mark tone", () => {
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

test("a page of blocks builds with no preset; no source id and no repeat group reaches the page", () => {
  const { page: html, key } = build(setup("blocks-fixture", page()));
  assert.equal(Object.keys(key.ids).length, FIXTURE.items.length);
  // Guards: a repeat's group is private like the source id.
  assert.deepEqual(
    ["review-sql-1", "guide-sql"].filter((s) => html.includes(s)),
    [],
  );
  assert.ok(html.includes('"repeat": {"index": 1, "of": 2}'));
});

test("🔴 a repeat whose group is the item's own source id builds: the group never reaches the page, so it is no leak", () => {
  const { page: html } = build(
    setup(
      "blocks-repeat-own-id",
      firstItem((i) => ({
        ...i,
        repeat: { group: "review-sql-1", index: 1, of: 2 },
      })),
    ),
  );
  assert.ok(html.includes('"repeat": {"index": 1, "of": 2}'));
});

/** What the page shows, with the fake DOM's line breaks between elements taken out. */
const flat = async (
  cfg: Record<string, unknown>,
  name: string,
  practice: Record<string, unknown> = PRACTICE_DONE,
) => {
  const { page: html, key } = build(setup(name, cfg));
  return {
    shown: (await showPage(html, {}, {}, practice)).replace(/\n/g, ""),
    key,
  };
};

test("🔴 `{line}` becomes «line N: » and the marked line's code, a backtick kept; a text without it is kept as written", async () => {
  const { shown } = await flat(page(), "blocks-line");
  assert.deepEqual(
    [
      'Does «Every query is parameterised» cover line 12: rows = db.raw("SELECT * FROM sales WHERE m=" + month)?',
      "Does «Every query is parameterised» cover line 30: q = `SELECT * FROM items WHERE name LIKE '${term}'`?",
      "Does «Functions stay short» cover this function?",
    ].filter((t) => !shown.includes(t)),
    [],
  );
  assert.ok(!shown.includes("{line}"));
});

/** `text` with every given part present, in this order. */
const inOrder = (text: string, parts: readonly string[]): readonly string[] => {
  const at = parts.map((p) => text.indexOf(p));
  return parts.filter(
    (p, n) => at[n] === -1 || (at[n - 1] ?? -1) > (at[n] ?? 0),
  );
};

test("🔴 a card reads top to bottom: its place and body in the page's words, the repeat, the situation, the excerpt with its marked line labelled and its caption, the question and its answers, then the references, the list and the table, each folded", async () => {
  const { page: html, key } = build(setup("blocks-face", page()));
  const shown = await showPage(html, {}, {}, PRACTICE_DONE);
  const id = Object.entries(key.ids).find(
    ([, v]) => v.source_id === "review-sql-1",
  )?.[0];
  assert.ok(id !== undefined);
  const from = shown.indexOf(`\nComment ${String(Number(id.slice(1)))} of 3`);
  const rest = shown.slice(from + 1).search(/\nComment \d+ of 3/);
  const next = rest === -1 ? -1 : from + 1 + rest;
  const card = shown.slice(from, next === -1 ? undefined : next);
  // Guards: every part in place; an empty list means nothing is missing or out of order.
  assert.deepEqual(
    inOrder(card, [
      "Guideline",
      "Every query is parameterised",
      "Comment 1 of 2 on this guideline",
      "Reviewer A asked for a change at",
      "app/report.py",
      "monthly(month)",
      "▶",
      "◀ the line in question",
      "Reviewer A wrote: concatenated SQL.",
      "Does «Every query is parameterised» cover",
      "Unclear",
      "What the guideline says",
      "Security guide",
      "SQL-1",
      "Build every query with parameters",
      "Why: A query built from strings",
      "The examples below are the guide's own.",
      "Not like this",
      "Like this",
      "3 more lines like this",
      "app/export.py",
      "and 1 more",
      "What each reviewer wrote",
      "Reviewer A asked for the change; reviewer B approved.",
      "A only · Comment",
      "use parameters",
      "asks for a parameterised query",
      "✓ about this line",
      "B only · Approval",
      "✗ says nothing about this line",
    ]),
    [],
  );
  // Guards: no word of the generator's own on a card.
  assert.deepEqual(
    ["linter", "Setting", "Rule docs", "◀ this line", "Card "].filter((w) =>
      card.includes(w),
    ),
    [],
  );
});

test("🔴 the page's labels: a practice button's example carries `practice_example`; without labels a card shows its id and the default repeat", async () => {
  const { shown } = await flat(page(), "blocks-labels", {});
  assert.ok(
    shown.includes("Another case: «No string-built SQL» and an f-string query"),
  );
  const bare = Object.fromEntries(
    Object.entries(page()).filter(([k]) => k !== "labels"),
  );
  const plain = await flat(bare, "blocks-no-labels");
  assert.deepEqual(
    [
      /G00\d · \d of 3/.test(plain.shown),
      plain.shown.includes("Card 1 of 2"),
      plain.shown.includes("GuidelineEvery query is parameterised"),
      plain.shown.includes("Another case"),
    ],
    [true, true, false, false],
  );
});

test("🔴 once the practice is done, «How to answer» folds into a toggle; with every card answered the page says so and what to do next", async () => {
  const { page: html, key } = build(setup("blocks-howto", page()));
  const folded = async (practice: Record<string, unknown>) => {
    const { app } = await openLive(html, { answers: {}, groups: {}, practice });
    return app
      .all()
      .filter((n) => n.tag === "details")
      .map((n) => n.children[0]?.textContent);
  };
  assert.ok(!(await folded({})).includes("📖 How to answer"));
  assert.ok((await folded(PRACTICE_DONE)).includes("📖 How to answer"));
  const all = Object.fromEntries(
    Object.keys(key.ids).map((id) => [
      id,
      { answers: { applies: "yes" }, source: "page" },
    ]),
  );
  const { app } = await openLive(html, {
    answers: all,
    groups: {},
    practice: PRACTICE_DONE,
  });
  assert.match(
    app.textContent,
    /All 3 items are complete\. Tell the agent you are done; you can still change any answer\./,
  );
});
