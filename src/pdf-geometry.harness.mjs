/**
 * `pdf-geometry.ts` — the pure half of reading a PDF: the last page's columns, and the fonts.
 *
 * Every page here is written by hand as words, because the cases that matter are pages the fixture
 * corpus does not contain. Each column case reproduces an error the poppler-based measurement made
 * on 2026-08-29 (the midpoint cut, the review build, years mistaken for line numbers), ported from
 * the harness of the function this replaces.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  classifyLastPage,
  wordsOf,
  fontsOf,
  fontFact,
  programOf,
  popplerType,
  STUB_WORDS,
} = await import(join(HERE, "pdf-geometry.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const W = 612; // US letter, points

/** Words from rows `{x, top, n, step, text}`: `n` words stacked downwards, each 10 pt tall. */
const words = (rows) =>
  rows.flatMap(({ x, top, n: count = 1, step = 10, text = "word" }) =>
    Array.from({ length: count }, (_, i) => ({
      x0: x,
      y0: top + i * step,
      x1: x + 20,
      y1: top + i * step + 10,
      text,
    })),
  );
const page = (rows, widthPt = W) => ({
  widthPt,
  heightPt: 792,
  words: words(rows),
});

// ── the last page's columns ─────────────────────────────────────────────────────────────
{
  const p = classifyLastPage(
    page([
      { x: 54, top: 60, n: 40 },
      { x: 320, top: 60, n: 40 },
    ]),
  );
  check(
    "balanced: two identical columns measure identical heights",
    p.kind === "measured" && p.columns[0] === 400 && p.columns[1] === 400,
  );
}
{
  const p = classifyLastPage(
    page([
      { x: 54, top: 60, n: 60 },
      { x: 320, top: 60, n: 30 },
    ]),
  );
  check(
    "unbalanced: the 300 pt difference shows up as heights 600 / 300",
    p.kind === "measured" && p.columns[0] === 600 && p.columns[1] === 300,
  );
}
{
  // 🔴 Split at the PAGE's middle. Only the left column is filled, lines span 54…300, and a page
  // number sits centred at the bottom: the words' own midpoint would fall inside the left column.
  const rows = [];
  for (let i = 0; i < 20; i++)
    for (const x of [54, 110, 170, 230, 280])
      rows.push({ x, top: 60 + i * 10 });
  rows.push({ x: 300, top: 700, text: "24" });
  const p = classifyLastPage(page(rows));
  check(
    "midpoint: an empty right column measures 0 — the split is the page's middle, not the words'",
    p.kind === "measured" && p.columns[1] === 0 && p.columns[0] > 600,
  );
}
{
  const body = [
    { x: 54, top: 60, n: 60 },
    { x: 320, top: 60, n: 10 },
  ];
  const left = classifyLastPage(
    page([...body, { x: 20, top: 60, n: 60, text: "101" }]),
  );
  check(
    "review (left margin): numbered lines make a review build, which is not measured",
    left.kind === "review" && left.lineNumbers === 60,
  );
  const right = classifyLastPage(
    page([...body, { x: 585, top: 60, n: 60, text: "2167" }]),
  );
  check(
    "review (right margin): numbers in the right margin count too",
    right.kind === "review",
  );
  check(
    "review: without the line numbers the same page IS measured",
    classifyLastPage(page(body)).kind === "measured",
  );
  const four = classifyLastPage(
    page([...body, { x: 20, top: 60, n: 4, text: "7" }]),
  );
  check(
    "review: four stray margin numbers are not a review build — five are",
    four.kind === "measured" &&
      classifyLastPage(page([...body, { x: 20, top: 60, n: 5, text: "7" }]))
        .kind === "review",
  );
}
{
  const p = classifyLastPage(
    page([
      { x: 54, top: 60, n: 40, text: "2024" },
      { x: 320, top: 60, n: 40, text: "2025" },
    ]),
  );
  check(
    "years in the body are not line numbers — a bibliography stays measured",
    p.kind === "measured",
  );
}
{
  const stub = classifyLastPage(page([{ x: 54, top: 60, n: STUB_WORDS - 1 }]));
  check(
    "stub: a page with fewer than 60 words is a stub, with its word count",
    stub.kind === "stub" && stub.words === STUB_WORDS - 1,
  );
  check(
    "stub: at exactly 60 words the page is measured",
    classifyLastPage(page([{ x: 54, top: 60, n: STUB_WORDS }])).kind ===
      "measured",
  );
}
check(
  "a page with no width is a caller's defect: it throws, it is not a measurement",
  (() => {
    try {
      classifyLastPage(page([{ x: 54, top: 60, n: 70 }], 0));
      return false;
    } catch (e) {
      return e instanceof RangeError;
    }
  })(),
);

// ── words from a text run ───────────────────────────────────────────────────────────────
{
  const ws = wordsOf({
    text: "ab  cd",
    x: 100,
    baseline: 200,
    width: 60,
    size: 10,
    ascent: 0.8,
    descent: -0.2,
  });
  check(
    "a run splits at whitespace into words with proportional x",
    ws.length === 2 &&
      ws[0].text === "ab" &&
      ws[0].x0 === 100 &&
      ws[0].x1 === 120 &&
      ws[1].x0 === 140,
  );
  check(
    "a word spans ascent above the baseline to descent below it",
    ws[0].y0 === 192 && ws[0].y1 === 202,
  );
}

// ── fonts ───────────────────────────────────────────────────────────────────────────────
const font = (over) => ({
  id: "f1",
  name: "ABCDEF+LinLibertineT",
  type: "Type1",
  subtype: "Type1C",
  isType3Font: false,
  missingFile: false,
  ...over,
});
check(
  "an embedded font: the subset tag is dropped, the program named",
  JSON.stringify(fontFact(font({}))) ===
    JSON.stringify({
      kind: "embedded",
      name: "LinLibertineT",
      program: "Type1C",
    }),
);
check(
  "🔴 a font with no usable program is NOT embedded — whatever else the PDF says about it",
  fontFact(font({ name: "Times-Roman", subtype: undefined, missingFile: true }))
    .kind === "not-embedded",
);
check(
  "a Type 3 font is its own kind, named Type3",
  JSON.stringify(fontFact(font({ isType3Font: true, name: "" }))) ===
    JSON.stringify({ kind: "type3", name: "Type3" }),
);
check(
  "programs: composite TrueType, CFF-in-CID, OpenType, and an unknown one kept verbatim",
  programOf("CIDFontType2", undefined) === "CIDTrueType" &&
    programOf("CIDFontType0", "CIDFontType0C") === "CIDType0C" &&
    programOf("CIDFontType0", undefined) === "CIDType0" &&
    programOf("TrueType", "OpenType") === "OpenType" &&
    programOf("MMType1", undefined) === "MMType1" &&
    programOf(undefined, undefined) === "unknown:undefined/undefined",
);
check(
  "the type column keeps poppler's spelling, which consumers match on",
  popplerType({ kind: "type3", name: "Type3" }) === "Type 3" &&
    popplerType(fontFact(font({}))) === "Type 1C" &&
    popplerType({ kind: "embedded", name: "x", program: "unknown:Foo/Bar" }) ===
      "unknown:Foo/Bar",
);
{
  const r = fontsOf([
    { hasText: true, fonts: [font({ id: "a" }), font({ id: "b", name: "B" })] },
    { hasText: true, fonts: [font({ id: "a" })] },
  ]);
  check(
    "fonts: each font once, in the order pages first drew them",
    r.kind === "drawn" && r.list.length === 2 && r.list[1].name === "B",
  );
}
{
  const r = fontsOf([
    { hasText: true, fonts: [font({ id: "a" })] },
    { hasText: true, fonts: [] },
  ]);
  check(
    "🔴 text on a page with no font is a FAILED READ, naming the page — not an empty list",
    r.kind === "zero-fonts-on-text" && r.pages.join() === "2",
  );
}
check(
  "no page draws text and there are no fonts: that is `no-text`, not a failure",
  fontsOf([{ hasText: false, fonts: [] }]).kind === "no-text",
);

console.log(
  `✓ ${String(n)} assertions passed — pdf-geometry: columns, stub/review, words from runs, fonts`,
);
