/**
 * What an item's text says that belongs in a field (#373): each shape found where a page writes it,
 * and quiet on prose that only looks like it. The texts are the forms consumer pages wrote.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  lineNamed,
  oldShapes,
  readingsNamed,
  rulesNamed,
} from "./item-text.ts";

const NOTHING = { rules: [], unit: false, readings: false };

test("🔴 a rule named in the text, the way pages write it, is found with its linter and id", () => {
  const found = [
    "From the line: «x» — a/b · CLAUDE.md line 25 · rule: ruff `TID251`",
    "rule eslint `no-console`: Disallow the use of `console`",
    "Rule eslint `max-len`: Enforce a maximum line length",
    "read as eslint `@typescript-eslint/no-explicit-any`",
    "rule: `react/jsx-key`",
    "ruff ANN001 checks it",
    "ESLint rule n/no-unsupported-features/node-builtins",
    "Follow eslint `quotes`",
  ].map((t) => rulesNamed(t).map((f) => f.rule));
  // Guards: the linter is the one the text says, or the id's shape (a Ruff code, else ESLint).
  assert.deepEqual(found, [
    [{ linter: "ruff", id: "TID251" }],
    [{ linter: "eslint", id: "no-console" }],
    [{ linter: "eslint", id: "max-len" }],
    [{ linter: "eslint", id: "@typescript-eslint/no-explicit-any" }],
    [{ linter: "eslint", id: "react/jsx-key" }],
    [{ linter: "ruff", id: "ANN001" }],
    [{ linter: "eslint", id: "n/no-unsupported-features/node-builtins" }],
    [{ linter: "eslint", id: "quotes" }],
  ]);
});

test("prose with rule-like words names no rule", () => {
  const quiet = [
    "The rule is simple: indent with spaces",
    "a rule of thumb, not a rule anyone checks",
    "Run `ruff check` and `eslint .` before pushing",
    "Target `ES2022`, encode as UTF8, video in H264",
    "// eslint-disable-next-line is not allowed",
    "ruff `format` handles it; eslint `--fix` too",
    "Rule 5 of the checklist",
  ].flatMap(rulesNamed);
  assert.deepEqual(quiet, []);
});

test("🔴 a source line carried or cited in the text is found; a line of code is not one", () => {
  const found = [
    "From the line: «- No `any`» — a/b · AGENTS.md line 267",
    "a/b · CLAUDE.md:293 · requirement 1 of 2 in this line: «x»",
    "a/b · .github/copilot-instructions.md:20",
    "see docs/STYLE.md#L12",
    "the function at src/sort.py:12",
    "Max line 100 characters",
  ].map((t) => lineNamed(t).map((f) => f.found));
  // Guards: the first sign only, and nothing for a code file or a "line" that is a length.
  assert.deepEqual(found, [
    ["From the line"],
    ["requirement 1 of 2"],
    [".github/copilot-instructions.md:20"],
    ["docs/STYLE.md#L12"],
    [],
    [],
  ]);
});

test("🔴 two readings written into one string are found; one 'A:' alone is not two readings", () => {
  const found = [
    "reading A: options {} · reading B: options {}",
    "Rule eslint `max-len` · A: [100] · B: [120] · file `a.ts`",
    "Reading B — tests excluded",
    "readings A and B differ on tests",
    "Plan A: ship it",
    // prose: the article "a" after "reading" is not a label
    "Use pathlib when reading a file.",
    "Reload when reading a config",
  ].map((t) => readingsNamed(t).map((f) => f.found));
  assert.deepEqual(found, [
    ["reading A"],
    ["· A: [100] · B:"],
    ["Reading B"],
    ["readings A"],
    [],
    [],
    [],
  ]);
});

test("🔴 a shape the item's own field holds is not reported; one it does not hold is, by text field", () => {
  const texts = [
    [
      "context",
      "rule: ruff `TID251` · CLAUDE.md:3 · reading A: x · reading B: y",
    ],
  ] as const;
  assert.deepEqual(
    oldShapes(texts, NOTHING).map((f) => [f.in, f.field]),
    [
      ["context", "rules"],
      ["context", "unit"],
      ["context", "readings"],
    ],
  );
  // Guards: holding a different rule does not cover the one named.
  assert.deepEqual(
    oldShapes(texts, {
      rules: [{ linter: "eslint", id: "TID251" }],
      unit: true,
      readings: true,
    }).map((f) => f.found),
    ["ruff `TID251`"],
  );
  assert.deepEqual(
    oldShapes(texts, {
      rules: [{ linter: "ruff", id: "TID251" }],
      unit: true,
      readings: true,
    }),
    [],
  );
});
