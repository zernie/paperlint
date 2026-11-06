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
import * as R from "remeda";
import { z } from "zod";
import {
  type FakeNode,
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

test("🔴 a card reads top to bottom: its place and body in the page's words, the repeat, the situation, the excerpt with its marked line labelled and its caption, the question and its answers, then the references, the list and the table, each in place", async () => {
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

test("🔴 `labels.line_part` names a unit row whose line holds several requirements", async () => {
  const unit = {
    id: "u1",
    text: "Short functions; no globals.",
    mark: "Short functions",
    part: 1,
    of: 2,
  };
  const cfg = firstItem((i) => ({ ...i, unit }));
  const own = await flat(
    { ...cfg, labels: { line: "Source", line_part: "{line} ({part}/{of})" } },
    "blocks-line-part",
  );
  const plain = await flat(
    Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== "labels")),
    "blocks-line-part-default",
  );
  assert.deepEqual(
    [
      own.shown.includes("Source (1/2)"),
      plain.shown.includes("Line · part 1 of 2"),
    ],
    [true, true],
  );
});

// ── the approved card (#392): quote, terms with notes, answer sub-lines, the annotated excerpt ──
const V7 = z
  .object({ items: z.array(z.record(z.string(), z.unknown())) })
  .loose()
  .parse(
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, "fixtures", "v7-cards-items.json"),
        "utf8",
      ),
    ),
  );
/** The v7 fixture without its time on screen, its first card changed by `change`. */
const v7 = (
  change: (
    i: Record<string, unknown>,
  ) => Record<string, unknown> = R.identity(),
): Record<string, unknown> => ({
  ...R.omit(V7, ["min_seconds"]),
  items: V7.items.map((i, n) => (n === 0 ? change(i) : i)),
});
const V7_DONE = Object.fromEntries(
  ["forbid", "allow", "elsewhere"].map((v, n) => [
    `r1-P${String(n + 1)}`,
    { answers: { forbid: v }, source: "page" },
  ]),
);
const V7_REFUSED: readonly (readonly [
  string,
  Record<string, unknown>,
  string,
])[] = [
  [
    "v7-term-not-shown",
    v7((i) => ({
      ...i,
      terms: [
        {
          term: "NumPy",
          note: [{ quote: "q", url: "https://e.x/", url_label: "u" }],
        },
      ],
    })),
    "items[0].terms[0].term: 'NumPy' is not in the card's annotation, quote or quote source — a note opens from words the card shows",
  ],
  [
    "v7-term-across-backticks",
    v7((i) => ({
      ...i,
      terms: [
        {
          term: "rule D413",
          note: [{ quote: "q", url: "https://e.x/", url_label: "u" }],
        },
      ],
    })),
    "items[0].terms[0].term: 'rule D413' is not in the card's annotation, quote or quote source — a note opens from words the card shows",
  ],
  [
    "v7-terms-overlap",
    v7((i) => ({
      ...i,
      terms: [
        {
          term: "Ruff",
          note: [{ quote: "q", url: "https://e.x/", url_label: "u" }],
        },
        {
          term: "Ruff rule",
          note: [{ quote: "q", url: "https://e.x/", url_label: "u" }],
        },
      ],
    })),
    "items[0].terms[0].term: 'Ruff' is inside items[0].terms[1].term 'Ruff rule' — the page draws one of two overlapping terms, so the other note never opens",
  ],
  [
    "v7-terms-twice",
    v7((i) => ({
      ...i,
      terms: ["Ruff", "Ruff"].map((term) => ({
        term,
        note: [{ quote: "q", url: "https://e.x/", url_label: "u" }],
      })),
    })),
    "items[0].terms[0].term: 'Ruff' is inside items[0].terms[1].term 'Ruff' — the page draws one of two overlapping terms, so the other note never opens",
  ],
  [
    "v7-note-without-words",
    v7((i) => ({
      ...i,
      terms: [
        {
          term: "Ruff",
          note: [{ says: "a linter", url: "https://e.x/", url_label: "u" }],
        },
      ],
    })),
    "items[0].terms[0].note[0]: has neither `quote` nor `code` — a note shows its source's own words",
  ],
  [
    "v7-note-unknown-question",
    v7((i) => ({ ...i, answer_notes: { applies: { forbid: "x" } } })),
    "items[0].answer_notes.applies: not a question of this page (forbid)",
  ],
  [
    "v7-note-unknown-answer",
    v7((i) => ({ ...i, answer_notes: { forbid: { maybe: "x" } } })),
    "items[0].answer_notes.forbid.maybe: not one of forbid, allow, unsettled, elsewhere, cannot",
  ],
  [
    "v7-no-words",
    v7((i) => R.omit(i, ["quote"])),
    "items[0].body: is required and missing — a card shows its `body`, or its words as a `quote`",
  ],
];

test("🔴 the card text refuses a term the card does not show (or that spans a backtick), a note entry without a quote or a snippet, an answer note on an unknown question or answer, and a card with neither body nor quote", () => {
  assert.deepEqual(
    V7_REFUSED.map(([name, cfg]) => {
      const dir = setup(name, cfg);
      return run(["build", join(dir, "items.json"), join(dir, "out")]);
    }),
    V7_REFUSED.map(([, , message]) => ({
      status: 1,
      out: `REFUSED: ${message}\n`,
    })),
  );
});

/** The v7 fixture's first card, as the fixture writes it. */
const V7_CARD = z
  .object({
    source_id: z.string(),
    quote: z.object({ text: z.string(), source: z.string() }),
    excerpt: z.object({
      file: z.string(),
      lang: z.string(),
      annotation: z.string(),
      lines: z.array(
        z.object({
          n: z.number(),
          mark: z.boolean(),
          context: z.boolean().optional(),
          gutter: z.string().optional(),
        }),
      ),
    }),
    answer_notes: z.object({ forbid: z.record(z.string(), z.string()) }),
  })
  .loose()
  .parse(V7.items[0]);
const V7_QUESTION = z
  .object({
    questions: z.tuple([
      z.object({
        id: z.string(),
        short: z.string(),
        options: z.array(z.object({ value: z.string() })),
      }),
    ]),
  })
  .loose()
  .parse(V7).questions[0];
/** A fixture text as the page shows it: its `backticks` are code spans, not characters. */
const unticked = (text: string): string => text.split("`").join("");
/** What a node shows, with the fake DOM's line breaks between elements taken out. */
const shownBy = (n: FakeNode): string => n.textContent.replace(/\n/g, "");
/** The kinds of the card's parts, in the order they appear. */
const KINDS = [
  "excerpt-path",
  "code-line",
  "gap",
  "annotation",
  "quote",
  "quote-source",
  "question",
  "answer",
  "answer-sub",
  "status",
];

/** What the card shows, read from the page: every part's values, its text, and the order of the parts. */
function shownFacts(card: FakeNode) {
  const of = (kind: string) => card.getByTestId(kind);
  const texts = (kind: string) => of(kind).map(shownBy);
  return {
    path: of("excerpt-path").map((n) => n.meta()),
    lines: of("code-line").map((n) => n.meta()),
    gaps: of("gap").map((n) => n.meta()),
    annotation: [of("annotation").map((n) => n.meta()), texts("annotation")],
    quote: texts("quote"),
    source: texts("quote-source"),
    answers: of("answer").map((n) => n.meta()),
    subs: of("answer-sub").map((n) => [n.meta(), shownBy(n)]),
    status: [of("status").map((n) => n.meta()), texts("status")],
    order: card
      .all()
      .map((n) => n.getAttribute("data-test") ?? "")
      .filter((k) => KINDS.includes(k)),
  };
}
/** The same facts, as the fixture states them. */
function fixtureFacts() {
  const lines = V7_CARD.excerpt.lines;
  const notes = V7_CARD.answer_notes.forbid;
  const noted = V7_QUESTION.options.filter((o) => o.value in notes);
  return {
    path: [{ file: V7_CARD.excerpt.file, lang: V7_CARD.excerpt.lang }],
    lines: lines.map((l) => ({
      line: l.n,
      marked: l.mark,
      gutter: l.gutter ?? "",
      context: l.context ?? false,
    })),
    gaps: R.zip(lines, lines.slice(1))
      .filter(([a, b]) => b.n > a.n + 1)
      .map(([a, b]) => ({ from: a.n + 1, to: b.n - 1 })),
    annotation: [
      [{ line: lines.find((l) => l.mark)?.n }],
      [unticked(V7_CARD.excerpt.annotation)],
    ],
    quote: [unticked(V7_CARD.quote.text)],
    source: [unticked(V7_CARD.quote.source)],
    answers: V7_QUESTION.options.map((o) => ({
      question: V7_QUESTION.id,
      value: o.value,
    })),
    subs: noted.map((o) => [
      { question: V7_QUESTION.id, value: o.value },
      unticked(notes[o.value] ?? ""),
    ]),
    status: [
      [{ state: "missing", missing: [V7_QUESTION.id] }],
      [`Still needs: ${V7_QUESTION.short}`],
    ],
    order: [
      "excerpt-path",
      ...lines.flatMap((l, n) => [
        ...(l.n > (lines[n - 1]?.n ?? l.n) + 1 ? ["gap"] : []),
        "code-line",
        ...(l.mark ? ["annotation"] : []),
      ]),
      "quote",
      "quote-source",
      "question",
      ...V7_QUESTION.options.flatMap((o) =>
        o.value in notes ? ["answer", "answer-sub"] : ["answer"],
      ),
      "status",
    ],
  };
}

test("🔴 an approved card reads top to bottom: its path, the code with a gap row for what it leaves out, the marked line and the note under it, the quote, its source, the question, each answer with its sub-line, then what it still needs", async () => {
  const { page: html, key } = build(setup("v7-face", v7()));
  const { app } = await openLive(html, { practice: V7_DONE });
  const id = Object.entries(key.ids).find(
    ([, v]) => v.source_id === V7_CARD.source_id,
  )?.[0];
  const card = app
    .getByTestId("item")
    .find((n) => z.object({ id: z.string() }).parse(n.meta()).id === id);
  assert.ok(id !== undefined && card !== undefined, "the card is drawn");
  assert.deepEqual(shownFacts(card), fixtureFacts());
  // Guards: the question's id is not what the line prints; no generator word names a section.
  assert.notEqual(V7_QUESTION.short, `${V7_QUESTION.id}?`);
  assert.deepEqual(
    ["◀ this line", "Requirement", "REQUIREMENT", "CODE"].filter((w) =>
      shownBy(card).includes(w),
    ),
    [],
  );
});
