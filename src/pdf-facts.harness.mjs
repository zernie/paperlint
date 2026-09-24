/**
 * `pdf-facts.ts` — pdf.js reading REAL PDFs, committed under `fixtures/pdf-facts/`.
 *
 * The pure decisions are tested in `pdf-geometry.harness.mjs` with hand-written words. This file is
 * the other half: that the shell asks pdf.js the right questions, with the right options, and maps
 * what comes back. The expected numbers are the ones poppler reported for the same files in the
 * 2026-09-24 measurement (issue #61), so a pass here is agreement with the tool this replaced.
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, "..", "fixtures", "pdf-facts");
const { readPdf } = await import(join(HERE, "pdf-facts.ts"));
const { classifyLastPage } = await import(join(HERE, "pdf-geometry.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

const read = async (name) => {
  const r = await readPdf(join(FIX, name));
  assert.ok(r.ok, `${name} must read: ${JSON.stringify(r)}`);
  return r.facts;
};
const kinds = (facts) =>
  facts.fonts.kind === "drawn" ? facts.fonts.list.map((f) => f.kind) : [];
const named = (facts, name) =>
  facts.fonts.kind === "drawn"
    ? facts.fonts.list.find((f) => f.name === name)
    : undefined;

// ── t3-all: every text font is Type 3 ──────────────────────────────────────────────────
{
  const f = await read("t3-all.pdf");
  check(
    "t3-all: four Type 3 fonts, as poppler lists — including one no text item names",
    kinds(f).length === 4 && kinds(f).every((k) => k === "type3"),
    JSON.stringify(f.fonts),
  );
  const last = classifyLastPage(f.last);
  check(
    "t3-all: one page, measured, within 7.2 pt of poppler's 150.1 / 553.2",
    f.pages === 1 &&
      last.kind === "measured" &&
      Math.abs(last.columns[0] - 150.1) <= 7.2 &&
      Math.abs(last.columns[1] - 553.2) <= 7.2,
    JSON.stringify(last),
  );
}

// ── ttf: a LuaLaTeX PDF, composite TrueType ────────────────────────────────────────────
{
  const f = await read("ttf.pdf");
  const arsenal = named(f, "Arsenal SC Regular");
  check(
    "ttf: the composite TrueType font is CIDTrueType — the program is read, not guessed",
    arsenal?.kind === "embedded" && arsenal.program === "CIDTrueType",
    JSON.stringify(f.fonts),
  );
  check(
    "ttf: two pages, and the 8-word last page is a stub",
    f.pages === 2 && classifyLastPage(f.last).kind === "stub",
  );
}

// ── t3-mixed: the sub/uni bug of the poppler reader ────────────────────────────────────
{
  const f = await read("t3-mixed.pdf");
  // pdffonts prints this font as `Times-Roman  Type 1  Custom  no  no  yes`. The old reader
  // tested `yes` anywhere in the row, found the `uni` column's, and called the font embedded.
  const times = named(f, "Times-Roman");
  check(
    "🔴 t3-mixed: Times-Roman (pdffonts: `no no yes`) is NOT embedded",
    times?.kind === "not-embedded",
    JSON.stringify(times),
  );
  const cols = classifyLastPage(f.last);
  check(
    "t3-mixed: columns within 0.2 pt of poppler's 153.5 / 554.9 — the fonts' own ascent is used",
    cols.kind === "measured" &&
      Math.abs(cols.columns[0] - 153.5) <= 0.2 &&
      Math.abs(cols.columns[1] - 554.9) <= 0.2,
    JSON.stringify(cols),
  );
  check(
    "t3-mixed: four fonts — two embedded Type 1, one Type 3, one not embedded",
    JSON.stringify(kinds(f)) ===
      JSON.stringify(["embedded", "embedded", "type3", "not-embedded"]),
    JSON.stringify(f.fonts),
  );
}

// ── corrupt-font: poppler says embedded, the program does not parse ────────────────────
{
  const f = await read("corrupt-font.pdf");
  check(
    "corrupt-font: a font program that does not parse counts as not embedded",
    named(f, "CMR10")?.kind === "not-embedded" &&
      named(f, "CMBX12")?.kind === "embedded",
    JSON.stringify(f.fonts),
  );
}

// ── what cannot be read says so ─────────────────────────────────────────────────────────
{
  const r = await readPdf(join(FIX, "encrypted.pdf"));
  check(
    "an encrypted PDF is `encrypted`, not a crash",
    !r.ok && r.reason === "encrypted",
    JSON.stringify(r),
  );
}
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "rpp-pdf-facts-")));
try {
  const notPdf = join(tmp, "paper.pdf");
  writeFileSync(notPdf, "%PDF-stale\n");
  const bad = await readPdf(notPdf);
  check(
    "a file that is not a PDF is `unreadable`, with pdf.js's reason",
    !bad.ok && bad.reason === "unreadable" && /PDF/.test(bad.detail),
    JSON.stringify(bad),
  );
  const missing = await readPdf(join(tmp, "nope.pdf"));
  check(
    "a missing file is `unreadable`, not an exception",
    !missing.ok && missing.reason === "unreadable",
    JSON.stringify(missing),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — pdf-facts: pdf.js on real PDFs agrees with poppler, and says what it cannot read`,
);
