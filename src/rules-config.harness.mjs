/**
 * `rules-config.ts` — parsing the `rules` key into ESLint config blocks, and deriving which rules
 * rpp ships. The end-to-end path (a consumer's package.json → `rpp lint`) is in `cli.harness.mjs`;
 * this pins the parser's output shape and each refusal.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { parseRuleBlocks, shippedRuleIds, unknownKeys } = await import(
  join(HERE, "rules-config.ts")
);

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

const SHIPPED = new Set(["pdf/last-page-balance", "paper/typography"]);
const parse = (raw) => parseRuleBlocks(raw, "S", SHIPPED, "/consumer");

check(
  "no `rules` key: no blocks",
  parse(undefined).ok && parse(undefined).value.length === 0,
);
{
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
}
check(
  "both severity spellings are accepted",
  parse([{ rules: { "paper/typography": 0, "pdf/last-page-balance": "warn" } }])
    .ok,
);
const refusals = [
  [{ a: 1 }, "S.rules must be a list"],
  [[42], "S.rules[0] must be an object"],
  [[{ rules: [] }], "S.rules[0].rules must be an object"],
  [[{ files: [], rules: {} }], "S.rules[0].files must be a non-empty list"],
  [
    [{ files: ["x"], ignores: [1], rules: {} }],
    "S.rules[0].ignores must be a non-empty list",
  ],
  [
    [{ languageOptions: {}, rules: {} }],
    'S.rules[0]: unknown key "languageOptions"',
  ],
  [
    [{ rules: { "markdown/no-html": "error" } }],
    '"markdown/no-html" is not a rule rpp ships',
  ],
  [
    [{ rules: { "paper/typography": ["loud"] } }],
    'S.rules[0].rules["paper/typography"]: ["loud"] is not a severity',
  ],
];
for (const [raw, says] of refusals) {
  const r = parse(raw);
  check(
    `refused, naming the key: ${says}`,
    !r.ok && r.error.includes(says),
    JSON.stringify(r),
  );
}
check(
  "unknown top-level keys are found by name; the known ones are not",
  JSON.stringify(unknownKeys({ papersDir: "p", rules: [], papersDri: "x" })) ===
    JSON.stringify(["papersDri"]),
);
{
  const foreign = { rules: { "no-html": {} } };
  const ids = shippedRuleIds(
    [
      {
        plugins: {
          pdf: { rules: { "last-page-balance": {} } },
          markdown: foreign,
        },
      },
      { plugins: { paper: { rules: { typography: {} } } } },
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
}

console.log(
  `✓ ${String(n)} assertions passed — rules-config: blocks parsed with basePath, every refusal names its key`,
);
