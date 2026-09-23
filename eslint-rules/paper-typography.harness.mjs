/**
 * Both halves for `paper/typography`, plus the halves the RATCHET needs — which are the ones a
 * naive test forgets. A rule that only ever gets asserted "fires on the defective fixture" says
 * nothing about the mechanism that actually decides whether a human sees it.
 *
 * Four sub-checks, and every one of them has a documented way of being silently wrong:
 *   sectionSign   counted only the literal glyph once and returned ZERO on the paper whose
 *                 reviewer raised it — the source writes the MACRO form
 *   bareDecimal   must not eat an arXiv id, where the dot follows a digit
 *   figMixed      fires only when BOTH spellings appear; either alone is a style, not a defect
 *   unreachable   must accept url and arXiv id, not only doi — three venues issue no doi at all
 * So each gets a fixture line that would flip it, and the clean fixture carries the near-misses.
 */
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIX = join(ROOT, "fixtures", "paper-typography");

const { texLanguage } = await import(join(HERE, "latex-language.mjs"));
const typographyPlugin = (await import(join(HERE, "paper-typography.mjs")))
  .default;

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// A new rule in this module with no declared severity must not slip through unnoticed.
assert.deepEqual(
  Object.keys(typographyPlugin.rules).sort(),
  ["typography"],
  "the module's rule set changed — update the config and this harness",
);

const lint = async (file, debt) => {
  const eslint = new ESLint({
    cwd: FIX,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage } },
          paper: typographyPlugin,
        },
        language: "tex/latex",
        rules: { "paper/typography": ["warn", { debt }] },
      },
    ],
  });
  const [res] = await eslint.lintFiles([file]);
  assert.deepEqual(
    res.messages.filter((m) => m.fatal || !m.ruleId),
    [],
    `${file}: the language failed to parse or the rule threw — a linter crash, not a finding`,
  );
  return res.messages.map((m) => m.message);
};

const CLEAN = join(FIX, "clean-paper", "paper.tex");
const MESSY = join(FIX, "messy-paper", "paper.tex");

// ── half one: it FIRES, and on each of the four independently ──────────────────────────────
const fresh = await lint(MESSY, {});
check(
  "fires on the section sign",
  fresh.some((m) => m.includes("§")),
);
check(
  "fires on the bare decimal",
  fresh.some((m) => m.includes("leading zero")),
);
check(
  "fires on mixed Fig./Figure",
  fresh.some((m) => m.includes("mixed in one document")),
);
check(
  "fires on unreachable bibliography entries",
  fresh.some((m) => m.includes("bibliography entries")),
);
check("four sub-checks, four findings", fresh.length === 4);

// 🔴 The MACRO form is counted, not just the glyph. This is the half that was missing when the
// check first shipped: it returned zero on the very paper the reviewer wrote about.
const signs = fresh.find((m) => m.includes("§"));
check(
  "the section sign count includes the macro form, not only the glyph",
  /^3 ×/.test(signs),
);

// ── half two: it STAYS QUIET on clean input, including the near-misses ─────────────────────
const clean = await lint(CLEAN, {});
check("silent on a clean paper", clean.length === 0);
// Each near-miss is in the clean fixture on purpose; naming them keeps the reason alive.
check(
  "an arXiv id is not a bare decimal",
  !clean.some((m) => m.includes("leading zero")),
);
check(
  "`Figure` used consistently is not a defect",
  !clean.some((m) => m.includes("mixed in one document")),
);
check(
  "url and arXiv id count as reachable, not only doi",
  !clean.some((m) => m.includes("bibliography entries")),
);

// ── the RATCHET: three halves, because this is what decides if a human ever sees it ────────
const KEY = "messy-paper";

// (a) debt equal to the count → silence. Old sin, already recorded.
const paid = await lint(MESSY, {
  [KEY]: { sectionSign: 3, bareDecimal: 2, figMixed: 1, unreachable: 2 },
});
check("known debt, unchanged, is silent", paid.length === 0);

// (b) debt ABOVE the count → still silent, and it does not re-baseline noisily. Lowering is free.
const lowered = await lint(MESSY, {
  [KEY]: { sectionSign: 99, bareDecimal: 99, figMixed: 99, unreachable: 99 },
});
check("paying debt down is silent", lowered.length === 0);

// (c) debt BELOW the count → speaks, and says both numbers. A bare "3 ×" would not tell a
// reader whether anything changed, which is the entire point of the ratchet.
const grew = await lint(MESSY, {
  [KEY]: { sectionSign: 1, bareDecimal: 99, figMixed: 99, unreachable: 99 },
});
check("growth over known debt is reported", grew.length === 1);
check("growth names the before and after", grew[0].includes("was 1, now 3"));

// (d) debt for ANOTHER paper must not silence this one — the key is the paper's own directory.
const wrongKey = await lint(MESSY, {
  "clean-paper": {
    sectionSign: 99,
    bareDecimal: 99,
    figMixed: 99,
    unreachable: 99,
  },
});
check("debt is keyed per paper, not shared", wrongKey.length === 4);

console.log(
  `✓ ${String(n)} assertions passed — paper/typography, both halves and the ratchet`,
);
