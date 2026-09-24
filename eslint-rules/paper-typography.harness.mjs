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
import markdown from "@eslint/markdown";

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

// ── bareDecimal counts what the READER sees, and nothing else ─────────────────────────────
// The count used to be a regex over the raw source. On a real corpus it found 22 decimals and
// none was a defect: every one sat in markup (an option, a column spec, a comment, a listing, a
// tikz coordinate). The cases below pin both directions with EXACT counts — "some finding" would
// pass a counter that reads markup AND prose, which is precisely the old defect.
const INLINE = join(FIX, "inline-paper");
const lintSource = async (text, file) => {
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
        rules: { "paper/typography": ["warn", { debt: {} }] },
      },
      {
        files: ["**/*.md"],
        plugins: { markdown, paper: typographyPlugin },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "paper/typography": ["warn", { debt: {} }] },
      },
    ],
  });
  const [res] = await eslint.lintText(text, { filePath: join(INLINE, file) });
  assert.deepEqual(
    res.messages.filter((m) => m.fatal || !m.ruleId),
    [],
    `${file}: the language failed to parse or the rule threw on ${JSON.stringify(text)}`,
  );
  return res.messages.map((m) => m.message);
};
/** The bare-decimal count for one source, 0 when the rule is silent about it. */
const bare = async (text, file = "paper.tex") => {
  const hit = (await lintSource(text, file)).find((m) =>
    m.includes("leading zero"),
  );
  return hit ? Number(/^(\d+) ×/.exec(hit)[1]) : 0;
};
const doc = (body) =>
  `\\documentclass{acmart}\n\\begin{document}\n${body}\n\\end{document}\n`;

// CAUGHT — prose, inline math (where p-values live) and a table cell. One each, exactly.
const caughtTex = [
  ["a p-value in inline math", "We call an effect significant at $p < .05$."],
  ["a p-value after other math", "(bugfix $-31\\%$, $p=.002$)"],
  [
    "a table cell",
    "\\begin{tabular}{ll}\ntask & p \\\\\nbugfix & .037 \\\\\n\\end{tabular}",
  ],
  ["plain prose", "We use a threshold of .05 throughout."],
];
for (const [what, body] of caughtTex)
  check(`LaTeX CAUGHT, exactly one: ${what}`, (await bare(doc(body))) === 1);
check(
  "LaTeX CAUGHT: all four in one document count four",
  (await bare(doc(caughtTex.map(([, b]) => b).join("\n\n")))) === 4,
);

// SILENT — markup the reader never sees as a number. Each alone must count ZERO.
const silentTex = [
  ["a figure width option", "\\includegraphics[width=.48\\columnwidth]{f}"],
  [
    "a tabular column spec",
    "\\begin{tabular}{p{.25\\linewidth}l}\na & b \\\\\n\\end{tabular}",
  ],
  ["a comment", "Text.\n% p<.01 in the old draft\nMore text."],
  ["a listing", "\\begin{lstlisting}\nx = .25\n\\end{lstlisting}"],
  ["inline listing", "Call \\lstinline{.25} here."],
  ["a length argument", "A\\hspace{.3em}B\\hspace{.35em}C"],
  ["a macro definition body", "\\def\\x{.85}"],
  [
    "tikz coordinates",
    "\\begin{tikzpicture}\\draw (.35,.65);\\end{tikzpicture}",
  ],
  ["an arXiv id", "See arXiv 2310.05736 for details."],
  // unified-latex has no signature for these, so their arguments arrive as sibling nodes.
  [
    "an unsigned environment's width",
    "\\begin{subfigure}[b]{.48\\textwidth}\nPanel.\n\\end{subfigure}",
  ],
  [
    "an unsigned table's column spec",
    "\\begin{longtable}{p{.25\\linewidth}l}\na & b \\\\\n\\end{longtable}",
  ],
  [
    "an unknown macro's options",
    "\\adjustbox{width=.48\\linewidth}{x} \\foo[scale=.75]{y}",
  ],
];
for (const [what, body] of silentTex)
  check(`LaTeX SILENT: ${what}`, (await bare(doc(body))) === 0);
check(
  "LaTeX SILENT: the preamble and the inline bibliography are not the reader's text",
  (await bare(
    "\\documentclass{acmart}\n\\renewcommand{\\arraystretch}{.85}\n" +
      "\\begin{filecontents*}{refs.bib}\n@misc{k, note = {p = .05}, url = {https://x.org}}\n" +
      "\\end{filecontents*}\n\\begin{document}\nNothing here.\n\\end{document}\n",
  )) === 0,
);
check(
  "LaTeX: every silent case plus one real p-value counts exactly one",
  (await bare(
    doc(
      silentTex.map(([, b]) => b).join("\n\n") +
        "\n\nThe effect held at $p=.002$.",
    ),
  )) === 1,
);

check(
  "LaTeX CAUGHT: the body of an unsigned environment is still read",
  (await bare(
    doc(
      "\\begin{subfigure}{.48\\textwidth}\nHeld at $p=.05$.\n\\end{subfigure}",
    ),
  )) === 1,
);

// Markdown, on the markdown AST: text nodes including table cells; code, html and front matter
// are not prose.
check(
  "Markdown CAUGHT: a p-value in prose and one in a table cell count two",
  (await bare(
    "We call it significant at p<.05.\n\n| task | p |\n| --- | --- |\n| bugfix | .002 |\n",
    "paper.md",
  )) === 2,
);
check(
  "Markdown SILENT: fenced code, inline code, html and front matter count zero",
  (await bare(
    "---\nthreshold: .05\n---\n\nRun `.25` here.\n\n```py\nx = .25\n```\n\n<!-- p<.01 -->\n",
    "paper.md",
  )) === 0,
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
