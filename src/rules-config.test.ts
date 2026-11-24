/**
 * `rules-config.ts` — parsing the `rules` key into ESLint config blocks, and deriving which rules
 * paperlint ships. The end-to-end path (a project's paperlint.json → `paperlint lint`) is in `cli-e2e.test.mjs`;
 * this pins the parser's output shape and each refusal.
 */
import { failureMessage } from "../lib/check.ts";
import { expect, it } from "vitest";

const { parseRuleBlocks, shippedRuleIds, unknownKeys } =
  await import("./rules-config.ts");

// A failed check is recorded and the rest of the test keeps running.
const check = (label: string, cond: unknown, detail?: unknown): void => {
  expect.soft(cond, failureMessage(label, detail)).toBeTruthy();
};

const SHIPPED = new Set(["pdf/last-page-balance", "paper/typography"]);
const parse = (raw: unknown) => parseRuleBlocks(raw, "S", SHIPPED, "/consumer");

it("no `rules` key: no blocks", () => {
  const none = parse(undefined);
  check("no `rules` key: no blocks", none.ok && none.value.length === 0);
});
it("a block keeps files, ignores and rules, with basePath", () => {
  const r = parse([
    {
      files: ["papers/a/**"],
      ignores: ["papers/a/old/**"],
      rules: { "pdf/last-page-balance": ["error", { tolerancePt: 90 }] },
    },
  ]);
  check(
    "a block keeps files, ignores and rules, and gets the settings file's directory as basePath",
    r.ok &&
      JSON.stringify(r.value[0]) ===
        JSON.stringify({
          basePath: "/consumer",
          files: ["papers/a/**"],
          ignores: ["papers/a/old/**"],
          rules: { "pdf/last-page-balance": ["error", { tolerancePt: 90 }] },
        }),
    JSON.stringify(r),
  );
});
it("the object form is one block with no `files`", () => {
  const r = parse({ "pdf/last-page-balance": "error" });
  check(
    "the object form is ONE block with no `files` — narrowed to each rule's own files later",
    r.ok &&
      JSON.stringify(r.value) ===
        JSON.stringify([
          {
            basePath: "/consumer",
            rules: { "pdf/last-page-balance": "error" },
          },
        ]),
    JSON.stringify(r),
  );
});
it("both severity spellings are accepted", () => {
  check(
    "both severity spellings are accepted",
    parse([
      { rules: { "paper/typography": 0, "pdf/last-page-balance": "warn" } },
    ]).ok,
  );
});
const refusals: [unknown, string][] = [
  ["pdf/last-page-balance", 'S → "rules" must be { "<rule>": "<severity>" }'],
  [{ a: 1 }, '"a" is not a rule paperlint ships'],
  [[42], "S → rules[0] must be an object"],
  [[{ rules: [] }], "S → rules[0].rules must be an object"],
  [[{ files: [], rules: {} }], "S → rules[0].files must be a non-empty list"],
  [
    [{ files: ["x"], ignores: [1], rules: {} }],
    "S → rules[0].ignores must be a non-empty list",
  ],
  [
    [{ languageOptions: {}, rules: {} }],
    'S → rules[0]: unknown key "languageOptions"',
  ],
  [
    [{ rules: { "markdown/no-html": "error" } }],
    '"markdown/no-html" is not a rule paperlint ships',
  ],
  [
    [{ rules: { "paper/typography": ["loud"] } }],
    'S → rules[0].rules["paper/typography"]: ["loud"] is not a severity',
  ],
];
it("every refusal names its key", () => {
  for (const [raw, says] of refusals) {
    const r = parse(raw);
    check(
      `refused, naming the key: ${says}`,
      !r.ok && r.error.includes(says),
      JSON.stringify(r),
    );
  }
});
it("unknown top-level keys are found by name", () => {
  check(
    "unknown top-level keys are found by name; the known ones are not",
    JSON.stringify(
      unknownKeys({ papersDir: "p", rules: [], papersDri: "x" }),
    ) === JSON.stringify(["papersDri"]),
  );
});
it("shipped rule ids are read off the config's own plugins", () => {
  const foreign = { rules: { "no-html": {} } };
  const ids = shippedRuleIds(
    [
      {
        plugins: {
          pdf: { rules: { "last-page-balance": {} } },
          markdown: foreign,
        },
      },
      // A plugin that carries only a language (the `tex` plugin does) has no rules to ship.
      {
        plugins: {
          paper: { rules: { typography: {} } },
          tex: { languages: {} },
        },
      },
      { files: ["x"] },
    ],
    [foreign],
  );
  check(
    "shipped rule ids are read off the config's own plugins; a foreign plugin is skipped",
    JSON.stringify([...ids].sort()) ===
      JSON.stringify(["paper/typography", "pdf/last-page-balance"]),
    JSON.stringify([...ids]),
  );
});
