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

test("🔴 a witness page refuses old items, an unmarked example, a rule without its explanation, a repeat out of range and a second question", () => {
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

/** `text` with every given part present, in this order. */
const inOrder = (text: string, parts: readonly string[]): readonly string[] => {
  const at = parts.map((p) => text.indexOf(p));
  return parts.filter(
    (p, n) => at[n] === -1 || (at[n - 1] ?? -1) > (at[n] ?? 0),
  );
};

test("🔴 a witness card reads top to bottom: requirement, situation, the code with its line numbers, the linter's message, the rule explained, N more like it, the question, then the settings", async () => {
  const { page, key } = build(setup("witness-face", witness()));
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  const id = Object.entries(key.ids).find(
    ([, v]) => v.source_id === "req-logging:tests",
  )?.[0];
  assert.ok(id !== undefined);
  const card = shown.slice(shown.indexOf(`\n${id} ·`));
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
      "The linter says:",
      "Checks for",
      "Why:",
      "Flagged",
      "Allowed",
      "Rule docs",
      "3 more like it",
      "scripts/backfill_prices.py",
      "and 1 more",
      "Should this requirement apply to the scripts/ folder?",
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
  assert.ok(!card.includes("Do the requirement's words settle this code?"));
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
