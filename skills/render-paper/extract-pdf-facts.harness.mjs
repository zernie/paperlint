#!/usr/bin/env node
/**
 * A test of PARSING `pdftotext -bbox` coordinates — the half of the balancing measurement where
 * 08-29 saw four errors in a row in one day. A test against a live PDF would have caught none of
 * them: they're all about how the coordinates are read, not about whether the paper builds.
 *
 * Each case below reproduces a specific error from that day, not an invented situation. The
 * markup is written by hand because it needs pages that don't exist in the corpus today.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { columnHeights } = await import(join(HERE, "extract-pdf-facts.mjs"));

const W = 612; // letter, points

/** Assemble markup: lines are given as {x, yTop, yBot, n, text}. */
const page = (rows) =>
  "<page>" +
  rows
    .flatMap(({ x, yTop, yBot, n = 1, text = "word", step = 0 }) =>
      Array.from({ length: n }, (_, i) => {
        const y = yTop + i * step;
        const b = yBot + i * step;
        return `<word xMin="${x}" yMin="${y}" xMax="${x + 20}" yMax="${b}">${text}</word>`;
      }),
    )
    .join("") +
  "</page>";

// ── 1. Balanced columns: both end at the same height ─────────────────────────
{
  const xml = page([
    { x: 54, yTop: 60, yBot: 70, n: 40, step: 10 },
    { x: 320, yTop: 60, yBot: 70, n: 40, step: 10 },
  ]);
  const c = columnHeights(xml, W);
  assert.deepEqual(
    c,
    [400, 400],
    "two identical columns must produce identical heights",
  );
}

// ── 2. Unbalanced: exactly the defect the publisher bounced the paper for on 08-29 ─
{
  const xml = page([
    { x: 54, yTop: 60, yBot: 70, n: 60, step: 10 },
    { x: 320, yTop: 60, yBot: 70, n: 30, step: 10 },
  ]);
  const c = columnHeights(xml, W);
  assert.equal(
    c[0] - c[1],
    300,
    "the imbalance must show up as a height difference",
  );
}

// ── 3. 🔴 SPLIT ON THE PAGE'S MIDPOINT, NOT ON THE WORDS' EDGES ───────────────
// Error #2 of that day. The midpoint was taken between the outermost words — and on a page where
// ONLY the left column is filled, with a centered page number at the bottom, that split lands
// INSIDE the left column: part of its lines get shoved into the "right" one. The measurement gave
// "77 / 731" for a page with six lines at the top left.
//
// The case reproduces exactly this: a line spans the column's whole width (54…290), not a single
// point. The page's midpoint is 306, the words' edge-based midpoint is around 172 — that is,
// inside the line.
{
  const rows = [];
  for (let i = 0; i < 20; i += 1) {
    for (const x of [54, 110, 170, 230, 280])
      rows.push({ x, yTop: 60 + i * 10, yBot: 70 + i * 10 });
  }
  rows.push({ x: 300, yTop: 700, yBot: 708, text: "24" }); // centered page number
  const c = columnHeights(page(rows), W);
  assert.equal(
    c[1],
    0,
    `the right column is empty — must come out 0, got ${String(c[1])}`,
  );
  assert.ok(
    c[0] > 600,
    `the left column should stay whole, got ${String(c[0])}`,
  );
}

// ── 4. 🔴 A REVIEWER BUILD IS NOT JUDGED ──────────────────────────────────────
// Line numbers in the margin run down the WHOLE height of the page, so a column with a dozen
// lines of text measures as full: the 08-29 measurement gave "656.8 / 654.8" for a page whose
// right column was one-sixth filled. Balancing is only required of camera-ready, so the correct
// answer is "nothing to measure," not a fudged number.
{
  const rows = [
    { x: 54, yTop: 60, yBot: 70, n: 60, step: 10 },
    { x: 320, yTop: 60, yBot: 70, n: 10, step: 10 },
    { x: 20, yTop: 60, yBot: 68, n: 60, step: 10, text: "101" }, // line numbers in the left margin
  ];
  assert.equal(
    columnHeights(page(rows), W),
    null,
    "a reviewer build cannot be judged",
  );
  // without the line numbers, the same page IS judged — otherwise the test above would pass for any reason
  assert.notEqual(
    columnHeights(page(rows.slice(0, 2)), W),
    null,
    "without line numbers, the page is judged",
  );
}

// Line numbers in the RIGHT margin are caught the same way — the ACL template has them on both sides.
{
  const xml = page([
    { x: 54, yTop: 60, yBot: 70, n: 60, step: 10 },
    { x: 320, yTop: 60, yBot: 70, n: 10, step: 10 },
    { x: 585, yTop: 60, yBot: 68, n: 60, step: 10, text: "2167" },
  ]);
  assert.equal(
    columnHeights(xml, W),
    null,
    "numbers in the right margin are also a reviewer build",
  );
}

// A number INSIDE the text is not a line number: otherwise a bibliography with years would be
// caught as a reviewer build, and the rule would go silent on exactly the page it was written for.
{
  const xml = page([
    { x: 54, yTop: 60, yBot: 70, n: 40, step: 10, text: "2024" },
    { x: 320, yTop: 60, yBot: 70, n: 40, step: 10, text: "2025" },
  ]);
  assert.deepEqual(
    columnHeights(xml, W),
    [400, 400],
    "years in the text are not line numbers",
  );
}

// ── 5. A stub page ────────────────────────────────────────────────────────────
// A tail of six lines is not a layout defect, and a fudged number there is worse than silence.
{
  const xml = page([{ x: 54, yTop: 60, yBot: 70, n: 6, step: 10 }]);
  assert.equal(columnHeights(xml, W), null, "a near-empty page is not judged");
}

// ── 6. Missing page width — null, not a division by who-knows-what ───────────
{
  const xml = page([{ x: 54, yTop: 60, yBot: 70, n: 70, step: 10 }]);
  assert.equal(
    columnHeights(xml, null),
    null,
    "with no page width, there is nothing to split against",
  );
}

console.log("extract-pdf-facts: coordinate parsing — all checks passed");
