/**
 * The witness card: one situation in code per card (`situation`, `example`, `details`, and
 * optionally `more_like_this`, `repeat` and each rule's `explanation`). The core's checks of those
 * fields, both ways, and what the card shows, in the fake DOM. Phone layout and saving are in
 * label-page-browser.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import {
  APPROVAL_PRACTICE,
  ITEMS,
  approval,
  approvalCard,
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
/** The generic witness page every test here starts from: an invented project, three practice cards. */
const FIXTURE = Fixture.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "fixtures", "witness-items.json"),
      "utf8",
    ),
  ),
);
const witness = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...FIXTURE,
  ...over,
});
/** The fixture's items with `change` applied to the first one. */
const firstItem = (
  change: (i: Record<string, unknown>) => Record<string, unknown>,
) =>
  witness({
    items: FIXTURE.items.map((i, n) => (n === 0 ? change(i) : i)),
  });
const PRACTICE_DONE = Object.fromEntries(
  FIXTURE.practice.map((p, n) => [
    `r1-P${String(n + 1)}`,
    { answers: p.expected, source: "page" },
  ]),
);
const [FIRST] = FIXTURE.items;
assert.ok(FIRST !== undefined);
const RuleList = z.array(z.record(z.string(), z.unknown()));
const firstRule = RuleList.parse(FIRST["rules"])[0];
const Example = z
  .object({ lines: z.array(z.record(z.string(), z.unknown())) })
  .loose();
const firstExample = Example.parse(FIRST["example"]);

/** An item built for the witness card before this one: the rule, two readings and a file. */
const oldCard = <T extends { readonly body: string }>(c: T, n: number) => ({
  ...approvalCard(c, n),
  readings: { a: "on", b: "off" },
  file: "`src/a.ts`: B flags it",
});

/** Witness pages the core refuses, each with its whole refusal. */
const REFUSED: readonly (readonly [string, Record<string, unknown>, string])[] =
  [
    [
      "witness-old-items",
      approval({
        kind: "witness",
        practice: APPROVAL_PRACTICE.map(oldCard),
        items: ITEMS.map(oldCard),
      }),
      "practice[0].situation: is required and missing — a witness card asks about one situation in code (`situation`, `example`, `details`); items made for the earlier card, with only `readings` and `file`, are not built: make them again in this shape",
    ],
    [
      "witness-no-mark",
      firstItem((i) => ({
        ...i,
        example: {
          ...firstExample,
          lines: firstExample.lines.map((l) => ({ ...l, mark: false })),
        },
      })),
      "items[0].example.lines: no line is marked — mark the line the linter caught (`mark: true`)",
    ],
    [
      "witness-no-explanation",
      firstItem((i) => ({ ...i, rules: [{ linter: "ruff", id: "T201" }] })),
      'items[0].rules[0].explanation: is required on a witness card — the linter\'s own explanation of the rule, or `source: "none"` when it has none',
    ],
    [
      "witness-explanation-empty",
      firstItem((i) => ({
        ...i,
        rules: [{ ...firstRule, explanation: { source: "ruff rule" } }],
      })),
      "items[0].rules[0].explanation.what: is required unless `source` is 'none' — what the rule does, in its source's words",
    ],
    [
      "witness-line-no-mark",
      firstItem((i) => ({
        ...i,
        situation: {
          kind: "construct",
          summary: "One setting reports it.",
          question: "Does it forbid {line}?",
        },
        example: {
          ...firstExample,
          lines: firstExample.lines.map((l) => ({ ...l, mark: false })),
        },
      })),
      "items[0].situation.question: `{line}` names the marked line, and the example has no marked line — mark the line the linter caught (`mark: true`), or write the question without `{line}`",
    ],
    [
      "witness-source-in-explanation",
      firstItem((i) => ({
        ...i,
        rules: [
          {
            ...firstRule,
            explanation: {
              source: "ruff rule",
              what: "Checks for print.",
              why: "drawn for req-logging:tests",
            },
          },
        ],
      })),
      "the source id 'req-logging:tests' appears in the visible `rules` of item req-logging:tests. Take it out of the text (or use source ids that are not natural words).",
    ],
    [
      "approval-situation-no-example",
      approval({
        items: ITEMS.map((c, n) =>
          n === 0
            ? {
                ...approvalCard(c, n),
                situation: { kind: "scope", summary: "s", question: "q?" },
              }
            : approvalCard(c, n),
        ),
      }),
      "items[0].example: is required with `situation` — the card shows its example file under the situation; add the example, or remove `situation`",
    ],
    [
      "approval-details-no-example",
      approval({
        practice: APPROVAL_PRACTICE.map((c, n) =>
          n === 1
            ? {
                ...approvalCard(c, n),
                details: {
                  a: [{ key: "rule", raw: "r", plain: "r" }],
                  b: [{ key: "rule", raw: "r", plain: "r" }],
                },
              }
            : approvalCard(c, n),
        ),
      }),
      "practice[1].example: is required with `details` — the card shows its example file under the details; add the example, or remove `details`",
    ],
    [
      "witness-source-after-newline",
      firstItem((i) => ({
        ...i,
        rules: [
          {
            ...firstRule,
            explanation: {
              source: "ruff rule",
              what: "Checks for print.",
              example_bad: "print(1)\nreq-logging:tests",
            },
          },
        ],
      })),
      "the source id 'req-logging:tests' appears in the visible `rules` of item req-logging:tests. Take it out of the text (or use source ids that are not natural words).",
    ],
    [
      "witness-source-after-tab-in-a-line",
      firstItem((i) => ({
        ...i,
        example: {
          ...firstExample,
          lines: firstExample.lines.map((l) =>
            l["mark"] === true ? { ...l, text: "\treq-logging:tests" } : l,
          ),
        },
      })),
      "the source id 'req-logging:tests' appears in the visible `example` of item req-logging:tests. Take it out of the text (or use source ids that are not natural words).",
    ],
    [
      "witness-more-count",
      firstItem((i) => ({
        ...i,
        more_like_this: { count: 1, files: ["a.py", "b.py"] },
      })),
      "items[0].more_like_this.count: 1 is fewer than the 2 files it lists — the count is every file like it, the list may be shorter",
    ],
    [
      "witness-repeat-range",
      firstItem((i) => ({ ...i, repeat: { group: "g", index: 3, of: 2 } })),
      "items[0].repeat.index: 3 is not between 1 and 2",
    ],
    [
      "witness-two-questions",
      witness({
        questions: [
          ...z.array(z.unknown()).parse(FIXTURE["questions"]),
          {
            id: "second",
            text: "Second?",
            options: [
              { value: "a", label: "A", example: "a" },
              { value: "b", label: "B", example: "b" },
            ],
          },
        ],
      }),
      "questions: a witness page asks one question, each card's `situation.question` being its text; this one has 2",
    ],
  ];

test("🔴 a witness page refuses old items, an unmarked example, a rule without its explanation, `{line}` with no marked line, a source id in a rule's explanation or after a newline or tab, `situation` or `details` without an example, a «more» count below its list, a repeat out of range and a second question", () => {
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

test("a witness page builds from the generic fixture; no source id and no repeat group reaches the page", () => {
  const { page, key } = build(setup("witness-fixture", witness()));
  assert.equal(Object.keys(key.ids).length, FIXTURE.items.length);
  // Guards: the group of a repeat is the study's requirement id, private like the source id.
  assert.deepEqual(
    ["req-logging", "req-imports"].filter((s) => page.includes(s)),
    [],
  );
  assert.ok(
    page.includes('"repeat": {"index": 1, "of": 2}'),
    "the repeat shows its place",
  );
});

test("🔴 a repeat whose group is the item's own source id builds: the group never reaches the page, so it is no leak", () => {
  const { page } = build(
    setup(
      "witness-repeat-own-id",
      firstItem((i) => ({
        ...i,
        repeat: { group: "req-logging:tests", index: 1, of: 2 },
      })),
    ),
  );
  assert.ok(page.includes('"repeat": {"index": 1, "of": 2}'));
});

test("🔴 `{line}` in a situation becomes «line N» and the marked line's code; a question without it is kept as written", async () => {
  const { page } = build(setup("witness-line", witness()));
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  // Guards: N and the code are the marked line's; leading spaces are not part of the code shown.
  assert.ok(
    shown
      .replace(/\n/g, "")
      .includes(
        'Does «Never log with print; use the logging module» forbid line 31: print("cart", cart.id, cart.total)?',
      ),
  );
  assert.match(
    shown,
    /Should this requirement apply to the scripts\/ folder\?/,
  );
  assert.ok(!shown.includes("{line}"));
});

test("🔴 `{line}` writes a marked line that holds a backtick as it is", async () => {
  const { page } = build(
    setup(
      "witness-line-backtick",
      firstItem((i) => ({
        ...i,
        situation: {
          kind: "construct",
          summary: "One setting reports {line} below.",
          question: "Does it forbid {line}?",
        },
        example: {
          ...firstExample,
          lines: firstExample.lines.map((l) =>
            l["mark"] === true ? { ...l, text: "    log(`seeded ${n}`)" } : l,
          ),
        },
      })),
    ),
  );
  const shown = (await showPage(page, {}, {}, PRACTICE_DONE)).replace(
    /\n/g,
    "",
  );
  assert.deepEqual(
    [
      "One setting reports line 18: log(`seeded ${n}`) below.",
      "Does it forbid line 18: log(`seeded ${n}`)?",
    ].filter((t) => !shown.includes(t)),
    [],
  );
});

/** `text` with every given part present, in this order. */
const inOrder = (text: string, parts: readonly string[]): readonly string[] => {
  const at = parts.map((p) => text.indexOf(p));
  return parts.filter(
    (p, n) => at[n] === -1 || (at[n - 1] ?? -1) > (at[n] ?? 0),
  );
};

test("🔴 a witness card reads top to bottom: requirement, situation, the code with its marked line labelled, the linter's message, the question and its answers, then the rule's docs folded, N more files with the same situation, and the settings", async () => {
  const { page, key } = build(setup("witness-face", witness()));
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  const id = Object.entries(key.ids).find(
    ([, v]) => v.source_id === "req-logging:tests",
  )?.[0];
  assert.ok(id !== undefined);
  // A witness card counts in words: «Card N of 3», N its place in id order.
  const card = shown.slice(
    shown.indexOf(`\nCard ${String(Number(id.slice(1)))} of 3`),
  );
  // Guards: every part in place; an empty list means nothing is missing or out of order.
  assert.deepEqual(
    inOrder(card, [
      "Requirement",
      "Never log with",
      "Card 1 of 2 for this requirement",
      "One setting checks the scripts/ folder",
      "scripts/seed_db.py",
      "18",
      'print(f"seeded {len(rows)} rows")',
      "◀ this line",
      "The linter says:",
      "Should this requirement apply to the scripts/ folder?",
      "Unclear: the wording could be read either way",
      "I can't judge (tell me why)",
      "What the linter rule does (official docs)",
      "Checks for",
      "Why:",
      "The flagged/allowed examples are the docs' own, with the docs' own settings, not this project's.",
      "Flagged",
      "Allowed",
      "Rule docs",
      "3 more file(s) with the same situation",
      "scripts/backfill_prices.py",
      "and 1 more",
      "Settings behind this card",
      "Setting B flags the example line; setting A passes it.",
      "A only",
      "except the files under scripts/",
      "✓ matches this file",
      "A and B",
      "flags every call to",
    ]),
    [],
  );
  assert.ok(
    !card.includes(
      "Does the requirement forbid this line, or apply to this file?",
    ),
  );
});

test("a rule with no official explanation says so; a card that is not repeated says nothing about repeats", async () => {
  const { page } = build(setup("witness-none", witness()));
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  assert.match(shown, /No official explanation for this rule\./);
  assert.match(shown, /Card 2 of 2 for this requirement/);
  assert.equal(shown.split("for this requirement").length - 1, 2);
  // Guards: a value matched with no answer either way shows no mark at all.
  assert.match(shown, /✗ does not match this file/);
});

test("🔴 once the practice is done, «How to answer» folds into a toggle; with every card answered the page says so and what to do next", async () => {
  const { page, key } = build(setup("witness-howto", witness()));
  const folded = async (practice: Record<string, unknown>) => {
    const { app } = await openLive(page, { answers: {}, groups: {}, practice });
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
      { answers: { witness: "open" }, source: "page" },
    ]),
  );
  const { app } = await openLive(page, {
    answers: all,
    groups: {},
    practice: PRACTICE_DONE,
  });
  assert.match(
    app.textContent,
    /All 3 items are complete\. Tell the agent you are done; you can still change any answer\./,
  );
});
