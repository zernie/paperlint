/**
 * The `linter-config-witness` preset: a narrow use of the generic blocks (two linter configs of one
 * requirement disagree on a line of code). Its words reach the page only through a page that names
 * it, and the items file's own labels override them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import { build, run, setup, showPage } from "../../../test/label-page-kit.ts";

const Fixture = z
  .object({
    practice: z.array(
      z.object({ expected: z.record(z.string(), z.string()) }).loose(),
    ),
    items: z.array(z.record(z.string(), z.unknown())),
  })
  .loose();
const FIXTURE = Fixture.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "fixtures", "linter-config-witness-items.json"),
      "utf8",
    ),
  ),
);
const preset = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({ ...FIXTURE, ...over });
const firstItem = (
  change: (i: Record<string, unknown>) => Record<string, unknown>,
) => preset({ items: FIXTURE.items.map((i, n) => (n === 0 ? change(i) : i)) });
const PRACTICE_DONE = Object.fromEntries(
  FIXTURE.practice.map((p, n) => [
    `r1-P${String(n + 1)}`,
    { answers: p.expected, source: "page" },
  ]),
);
const [FIRST] = FIXTURE.items;
assert.ok(FIRST !== undefined);
const firstRule = z
  .array(z.record(z.string(), z.unknown()))
  .parse(FIRST["rules"])[0];

const REFUSED: readonly (readonly [string, Record<string, unknown>, string])[] =
  [
    [
      "preset-unknown",
      preset({ preset: "no-such-preset" }),
      "preset: 'no-such-preset' is not a preset (linter-config-witness)",
    ],
    [
      "preset-no-explanation",
      firstItem((i) => ({ ...i, rules: [{ linter: "ruff", id: "T201" }] })),
      "items[0].rules[0].explanation: Invalid input: expected object, received undefined",
    ],
    [
      "preset-explanation-empty",
      firstItem((i) => ({
        ...i,
        rules: [{ ...firstRule, explanation: { source: "ruff rule" } }],
      })),
      "items[0].rules[0].explanation.what: `what` is required unless `source` is 'none'",
    ],
  ];

test("🔴 the preset refuses an unknown name and, by path, a card it cannot map", () => {
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

/** `text` with every given part present, in this order. */
const inOrder = (text: string, parts: readonly string[]): readonly string[] => {
  const at = parts.map((p) => text.indexOf(p));
  return parts.filter(
    (p, n) => at[n] === -1 || (at[n - 1] ?? -1) > (at[n] ?? 0),
  );
};

test("🔴 a page naming the preset shows its words on the generic blocks: the linter's message, the rule's docs folded with the docs-examples note, the files like it, and the settings with their sides", async () => {
  const { page, key } = build(setup("preset-face", preset()));
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  const id = Object.entries(key.ids).find(
    ([, v]) => v.source_id === "req-logging:tests",
  )?.[0];
  assert.ok(id !== undefined);
  const card = shown.slice(
    shown.indexOf(`\nCard ${String(Number(id.slice(1)))} of 3`),
  );
  assert.deepEqual(
    inOrder(card, [
      "Requirement",
      "Never log with",
      "Card 1 of 2 for this requirement",
      "One setting checks the scripts/ folder",
      "scripts/seed_db.py",
      "◀ this line",
      "The linter says:",
      "Should this requirement apply to the scripts/ folder?",
      "What the linter rule does (official docs)",
      "Rule",
      "ruff",
      "T201",
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
      "A only · Leaves out",
      "except the files under scripts/",
      "✓ matches this file",
      "A and B · Rule",
      "flags every call to",
    ]),
    [],
  );
  assert.match(shown, /No official explanation for this rule\./);
  const open = await showPage(page, {}, {}, {});
  assert.match(shown, /✗ does not match this file/);
  assert.match(
    open,
    /Example of this answer, about other code: \n?«Use/,
    "a practice button's example says it is about other code",
  );
});

test("🔴 the items file's own labels override the preset's", async () => {
  const { page } = build(
    setup(
      "preset-override",
      preset({ labels: { body: "Rule text", place: "#{n}" } }),
    ),
  );
  const shown = await showPage(page, {}, {}, PRACTICE_DONE);
  assert.deepEqual(
    [
      shown.includes("Rule text"),
      shown.includes("\nRequirement\n"),
      /\n#1\n/.test(shown),
      shown.includes("Card 1 of 2 for this requirement"),
    ],
    [true, false, true, true],
  );
});
