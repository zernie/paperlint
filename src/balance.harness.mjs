/**
 * `balance.ts` — the decision of the balance step, as tables.
 *
 * Everything here is pure, so no row needs TeX: a row is a class option list, a `.bbl`, a
 * `pdftotext -bbox` page, or a list of measured attempts, and the answer the step must give. The
 * real-pdflatex half is `test/e2e/build.mjs` (the `balance` fixture); the shell that runs the
 * attempts is `build.harness.mjs`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  acmartFormat,
  optionOn,
  balanceApplies,
  ACMART_TWO_COLUMN_FORMATS,
  ACMART_FORMATS,
  lastPdfPage,
  bibitemOffsets,
  injectBalance,
  balancePositions,
  BALANCE_LINE,
  BALANCE_TOL_PT,
  isBalanced,
  breaksLayout,
  rejection,
  pickBalancePosition,
  nextBalanceStep,
  nearMiss,
  formatPositions,
  describeFailedScan,
} = await import(join(HERE, "balance.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// ── which format an option list selects ───────────────────────────────────────────────────
const FORMAT_TABLE = [
  [[], "manuscript", "no option — acmart's default, manuscript"],
  [["sigconf"], "sigconf", "a bare format option"],
  [["format=sigplan"], "sigplan", "the key=value spelling"],
  [["sigconf", "screen", "nonacm"], "sigconf", "other options are not formats"],
  [["acmsmall", "sigconf"], "sigconf", "the LAST format wins"],
  [["sigconf", "format=acmsmall"], "acmsmall", "…in either spelling"],
  [["review=sigconf"], "manuscript", "a value of another key is not a format"],
];
for (const [opts, want, label] of FORMAT_TABLE)
  check(`format: ${label}`, acmartFormat(opts) === want);
check(
  "every two-column format is a real acmart format",
  ACMART_TWO_COLUMN_FORMATS.every((f) => ACMART_FORMATS.includes(f)),
);
check(
  "acmart's one-column formats are not in the two-column list",
  ["manuscript", "acmsmall", "acmlarge", "sigchi-a", "acmcp"].every(
    (f) => !ACMART_TWO_COLUMN_FORMATS.includes(f),
  ),
);
check("review is on when bare", optionOn(["sigconf", "review"], "review"));
check("review=true is on", optionOn(["review=true"], "review"));
check("review=false is off", !optionOn(["review=false"], "review"));
check(
  "the last spelling of an option wins",
  !optionOn(["review", "review=false"], "review"),
);

// ── does the step apply ───────────────────────────────────────────────────────────────────
const acm = (...options) => ({ name: "acmart", options });
const APPLIES = [
  [
    "acmart sigconf with a bibliography — applies, and the why says so",
    { documentclass: acm("sigconf"), bibliography: true },
    true,
    "acmart sigconf is two-column — will place \\balance in the bibliography",
  ],
  [
    "sigplan is two-column as well",
    { documentclass: acm("format=sigplan"), bibliography: true },
    true,
    "acmart sigplan is two-column",
  ],
  [
    "acmart with no format is manuscript — one-column, skipped",
    { documentclass: acm(), bibliography: true },
    false,
    "acmart manuscript is one-column",
  ],
  [
    "acmsmall is one-column, skipped",
    { documentclass: acm("acmsmall"), bibliography: true },
    false,
    "acmart acmsmall is one-column",
  ],
  [
    "not acmart — skipped, naming the class",
    { documentclass: { name: "article", options: [] }, bibliography: true },
    false,
    "article is not acmart",
  ],
  [
    "no bibliography — skipped, saying where \\balance would have gone",
    { documentclass: acm("sigconf"), bibliography: false },
    false,
    "there is no \\bibliography",
  ],
  [
    "review numbers the lines — skipped",
    { documentclass: acm("sigconf", "review"), bibliography: true },
    false,
    "review numbers the lines",
  ],
  [
    "no \\documentclass — skipped",
    { documentclass: null, bibliography: true },
    false,
    "no \\documentclass",
  ],
];
for (const [label, facts, yes, why] of APPLIES) {
  const a = balanceApplies(facts);
  check(`applies: ${label}`, a.yes === yes && a.why.includes(why));
}

// ── the tolerance is the one the CI rule judges with ──────────────────────────────────────
// Every shipped venue profile carries `last_page_balance_tol_pt`; a profile that disagrees with the
// step's constant would let the build accept a page the rule then rejects, or the reverse.
const venuesDir = join(
  HERE,
  "..",
  "skills",
  "submit-paper",
  "references",
  "venues",
);
const tols = readdirSync(venuesDir)
  .filter((f) => f.endsWith(".jsonc"))
  .map((f) => {
    const { config, error } = ts.parseConfigFileTextToJson(
      f,
      readFileSync(join(venuesDir, f), "utf8"),
    );
    assert.ok(!error, `${f} parses as JSONC`);
    return [f, config.last_page_balance_tol_pt];
  })
  .filter(([, t]) => t !== undefined);
check(
  "at least one venue profile declares the balance tolerance (else this check sees nothing)",
  tols.length > 0,
);
check(
  `BALANCE_TOL_PT equals every venue profile's last_page_balance_tol_pt (${tols.map(([f, t]) => `${f}=${t}`).join(", ")})`,
  tols.every(([, t]) => t === BALANCE_TOL_PT),
);

// ── the PDF's last page ───────────────────────────────────────────────────────────────────
const words = (x, count, top, height) =>
  Array.from({ length: count }, (_, i) => {
    const y = top + (height * i) / (count - 1);
    return `<word xMin="${x}" yMin="${y.toFixed(1)}" xMax="${x + 20}" yMax="${(y + 8).toFixed(1)}">w</word>`;
  }).join("\n");
const page = (body, w = 612) =>
  `<page width="${w}.000000" height="792.000000">\n${body}\n</page>`;
const bbox = (...pages) => `<doc>\n${pages.join("\n")}\n</doc>`;
const last = lastPdfPage(bbox(page("first"), page("second", 595)));
check(
  "the last page: the count of pages, its width, and its markup alone",
  last.pages === 2 && last.widthPt === 595 && last.xml.trim() === "second",
);
check(
  "no page at all — null, not a zero-page success",
  lastPdfPage("") === null,
);

// ── the bibliography ──────────────────────────────────────────────────────────────────────
// The shape ACM-Reference-Format writes (from a real TeX Live 2023 .bbl, 2026-09-24): the key on the
// next line after a `%`, and a comment that MENTIONS \bibitem, which the parser must not count.
const BBL = [
  "\\begin{thebibliography}{3}",
  "% a note about \\bibitem in a comment",
  "\\bibitem[A(2021)]%",
  "        {a}",
  "Alpha.",
  "",
  "\\bibitem[B(2022)]%",
  "        {b}",
  "Beta.",
  "",
  "\\bibitem[C(2023)]%",
  "        {c}",
  "Gamma.",
  "\\end{thebibliography}",
  "",
].join("\n");
const offsets = bibitemOffsets(BBL);
check(
  "three \\bibitem's, the one in a comment not counted",
  offsets.length === 3,
);
check(
  "each offset points AT a \\bibitem",
  offsets.every((o) => BBL.startsWith("\\bibitem[", o)),
);
const injected = injectBalance(BBL, offsets, 1);
check(
  "\\balance goes on its own line just before the chosen \\bibitem, and nothing else changes",
  injected ===
    BBL.slice(0, offsets[1]) + BALANCE_LINE + BBL.slice(offsets[1]) &&
    injected.split("\n").includes("\\balance") &&
    injected.replace(BALANCE_LINE, "") === BBL,
);
check(
  "before the FIRST \\bibitem is position 0",
  injectBalance(BBL, offsets, 0).indexOf("\\balance") <
    injectBalance(BBL, offsets, 0).indexOf("\\bibitem["),
);
assert.throws(
  () => injectBalance(BBL, offsets, 3),
  /no \\bibitem #4/,
  "a position past the last \\bibitem throws",
);
n++;
check(
  "positions: one per \\bibitem, from the first — no hand-picked lower bound",
  JSON.stringify(balancePositions(4)) === "[0,1,2,3]" &&
    balancePositions(0).length === 0,
);

// ── overfull boxes ────────────────────────────────────────────────────────────────────────
check(
  "an overfull hbox always breaks the layout",
  breaksLayout({ box: "hbox", pt: 0.1 }),
);
check(
  "balance.sty's own 1.503 pt vbox does not",
  !breaksLayout({ box: "vbox", pt: 1.503 }),
);
check("a 3 pt vbox does", breaksLayout({ box: "vbox", pt: 3 }));

// ── judging an attempt ────────────────────────────────────────────────────────────────────
const BASE = { pages: 6, columns: [625.2, 303.8], overfull: 0 };
const built = (position, o = {}) => ({
  position,
  kind: "built",
  pages: 6,
  columns: [464.2, 461.5],
  overfull: 0,
  secondColumn: false,
  ...o,
});
const failed = (position) => ({ position, kind: "failed", lines: ["! boom"] });
const REJECT = [
  ["a balanced build with nothing else wrong is accepted", built(0), null],
  ["a build that did not compile", failed(0), "failed"],
  [
    "🔴 balance.sty says it ran in the second column — rejected even when the page came out balanced",
    built(0, { secondColumn: true }),
    "second-column",
  ],
  ["the page count moved", built(0, { pages: 7 }), "pages"],
  [
    "nothing to measure on the last page",
    built(0, { columns: null }),
    "unmeasurable",
  ],
  [
    "columns further apart than the tolerance",
    built(0, { columns: [625.2, 303.8] }),
    "unbalanced",
  ],
  [
    "exactly at the tolerance is balanced",
    built(0, { columns: [400, 400 - BALANCE_TOL_PT] }),
    null,
  ],
  [
    "🔴 balanced, but one more overfull box than the unbalanced build — the position-8 case",
    built(0, { overfull: 1 }),
    "overfull",
  ],
  [
    "an overfull box the unbalanced build ALREADY had is not this step's to reject",
    built(0, { overfull: 1 }),
    null,
    { ...BASE, overfull: 1 },
  ],
];
for (const [label, attempt, want, base = BASE] of REJECT)
  check(`judge: ${label}`, rejection(attempt, base) === want);
check(
  "isBalanced reads the gap, in either direction",
  isBalanced([300, 400]) && !isBalanced([100, 400]),
);

// ── the search ────────────────────────────────────────────────────────────────────────────
const POS = [0, 1, 2, 3];
const kindOf = (s) => (s.kind === "none" ? "none" : `${s.kind} ${s.position}`);
const SEARCH = [
  ["nothing tried yet — the first position", [], "try 0"],
  [
    "the first attempt was rejected — the next one",
    [built(0, { secondColumn: true })],
    "try 1",
  ],
  [
    "an accepted attempt — chosen, and the scan STOPS",
    [built(0, { secondColumn: true }), built(1)],
    "chosen 1",
  ],
  [
    "a failed compile is a rejection, not the end of the scan",
    [failed(0)],
    "try 1",
  ],
  [
    "🔴 not monotone: a rejected position AFTER an accepted one does not unseat it",
    [built(0, { overfull: 1 }), built(1), built(2, { overfull: 1 })],
    "chosen 1",
  ],
  [
    "every position rejected — none",
    POS.map((p) => built(p, { columns: [625.2, 303.8] })),
    "none",
  ],
];
for (const [label, attempts, want] of SEARCH)
  check(
    `search: ${label}`,
    kindOf(nextBalanceStep(POS, attempts, BASE)) === want,
  );
check(
  "pickBalancePosition: the FIRST acceptable in attempt order",
  pickBalancePosition([built(2), built(1)], BASE) === 2,
);
check(
  "pickBalancePosition: none acceptable — null",
  pickBalancePosition([failed(0)], BASE) === null,
);

// ── reporting a failed scan ───────────────────────────────────────────────────────────────
const tried = [
  built(0, { secondColumn: true, columns: [625.2, 303.8] }),
  built(1, { columns: [520, 380] }),
  built(2, { columns: [470, 460], overfull: 1 }),
  failed(3),
];
check(
  "the near miss is the smallest gap among MEASURED attempts, whatever rejected it",
  nearMiss(tried)?.position === 2 && nearMiss([failed(0)]) === null,
);
check(
  "positions print 1-based, runs collapsed",
  formatPositions([0, 1, 2, 4, 6, 7]) === "1–3, 5, 7–8",
);
const report = describeFailedScan(tried, BASE, 4).join("\n");
check(
  "the failure says how many positions were tried of how many",
  report.includes("tried 4 of 4 \\bibitem positions"),
);
check(
  "…the unbalanced baseline and the tolerance",
  report.includes("625.2 / 303.8 pt") &&
    report.includes(`tolerance ${BALANCE_TOL_PT} pt`),
);
check(
  "…the closest miss with its columns and why it was rejected",
  report.includes(
    "closest: before \\bibitem #3 — 470.0 / 460.0 pt (added an overfull box)",
  ),
);
check(
  "…and every position grouped by its reason",
  report.includes("\\bibitem #1: fell in the second column") &&
    report.includes("\\bibitem #2: stayed unbalanced") &&
    report.includes("\\bibitem #4: did not compile"),
);
const allSecond = describeFailedScan(
  [built(0, { secondColumn: true }), built(1, { secondColumn: true })],
  BASE,
  2,
).join("\n");
check(
  "every position in the second column — the report says \\balance belongs in the body text",
  /belongs in the body text/.test(allSecond) &&
    !/belongs in the body text/.test(report),
);

console.log(
  `✓ ${String(n)} assertions passed — balance: which papers, where \\balance goes, and when the scan stops`,
);
