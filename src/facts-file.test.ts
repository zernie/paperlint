/**
 * `facts-file.ts` — the one writer of `_build/paper.facts.json`.
 *
 * The document is assembled from hand-made measurements (pure), and `measurePaper` runs on
 * in-memory files with a FAKE pdf.js reader and a FAKE measurer, so each outcome — read failed, not
 * measured, measured — is chosen rather than hoped for. Reading real PDFs is
 * `pdf-facts.harness.mjs`'s job; banal as the measurer is `adapters/banal/index.test.ts`, and the
 * real banal is `test/e2e/banal.mjs`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import {
  declaredVenue,
  factsDocument,
  factsPath,
  measurePaper,
  writeFactsFile,
  type MeasureOptions,
} from "./facts-file.ts";
import { whyNoGeometry, type Geometry } from "./domain/geometry.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { Fonts, PageText } from "./pdf-geometry.ts";
import type { PdfReader } from "./pdf-facts.ts";

/** A last page of `left` and `right` words in two columns, plus `extra`. */
const lastPage = (
  left: number,
  right: number,
  extra: PageText["words"] = [],
): PageText => {
  const col = (x: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      x0: x,
      y0: 60 + i * 10,
      x1: x + 20,
      y1: 70 + i * 10,
      text: "w",
    }));
  return {
    widthPt: 612,
    heightPt: 792,
    words: [...col(54, left), ...col(320, right), ...extra],
  };
};
const FONTS: Fonts = {
  kind: "drawn",
  list: [
    { kind: "embedded", name: "LinLibertineT", program: "Type1C" },
    { kind: "type3", name: "Type3" },
    { kind: "not-embedded", name: "Times-Roman", program: "Type1" },
  ],
};
const NONE: Geometry = {
  kind: "unmeasured",
  why: ["perl is not installed"],
  tried: null,
};
/** A measurement, in the domain's names, by a measurer called `banal`. */
const MEASURED: Geometry = {
  kind: "measured",
  by: { tool: "banal", path: "/b", how: "$BANAL" },
  geometry: {
    pageWidthIn: 8.5,
    pageHeightIn: 11,
    columns: 2,
    bodyPt: 9,
    refPt: 7,
    bodyPages: 3,
    refPages: 1,
    appendixPages: 1,
    pagesByType: { body: 3, bib: 1, appendix: 1 },
  },
};
const doc = (last: PageText, geometry: Geometry = NONE) =>
  factsDocument({
    pdf: "paper.pdf",
    sha: "a".repeat(64),
    venue: "agenticdev",
    kind: "short",
    read: { pages: 4, fonts: FONTS, last, layout: [] },
    geometry,
  });

// ── the document ────────────────────────────────────────────────────────────────────────
test("schema 2; a measured last page gives both heights, in both fields", () => {
  const d = doc(lastPage(60, 30));
  assert.equal(d.schema, 2);
  assert.deepEqual(d.last_page, { kind: "measured", columns_pt: [600, 300] });
  assert.deepEqual(d.last_page_cols_pt, [600, 300]);
  assert.equal(d.npages, 4);
  assert.equal(d.fonts_source, "pdfjs-drawn");
});

test("fonts keep poppler's spelling; Type 3 is embedded; no usable program is not", () => {
  const d = doc(lastPage(60, 30));
  assert.deepEqual(d.fonts[1], {
    name: "Type3",
    type: "Type 3",
    embedded: true,
    program: "Type3",
  });
  // Guards: a font with no usable program is `embedded: false`.
  assert.equal(d.fonts[2]?.embedded, false);
});

test("🔴 a review build: last_page says review, and last_page_cols_pt is null", () => {
  const numbers = Array.from({ length: 60 }, (_, i) => ({
    x0: 20,
    y0: 60 + i * 10,
    x1: 30,
    y1: 70 + i * 10,
    text: String(i + 1),
  }));
  const d = doc(lastPage(60, 10, numbers));
  // Guards: no fudged heights on a review build.
  assert.deepEqual(d.last_page, { kind: "review", line_numbers: 60 });
  assert.equal(d.last_page_cols_pt, null);
  const stub = doc(lastPage(3, 0));
  assert.deepEqual(stub.last_page, { kind: "stub", words: 3 });
});

test("🔴 geometry_source and the nine columns come from ONE branch", () => {
  const none = doc(lastPage(60, 30));
  assert.equal(none.geometry_source, null);
  assert.equal(none.page_w_in, null);
  assert.equal(none.body_pages, null);
  const measured = doc(lastPage(60, 30), MEASURED);
  // Guards: the file names the measurer that measured, from the provenance only an adapter builds.
  assert.equal(measured.geometry_source, "banal");
  assert.deepEqual(
    [
      measured.body_pages,
      measured.ref_pages,
      measured.page_w_in,
      measured.ref_pt,
    ],
    [3, 1, 8.5, 7],
  );
});

// ── measuring and writing ───────────────────────────────────────────────────────────────
const PAPER = "/r/papers/p";
const PDF = `${PAPER}/paper.pdf`;
const PDF_BYTES = "%PDF-pretend";
const good: PdfReader = async () => ({
  ok: true,
  facts: { pages: 2, fonts: FONTS, last: lastPage(60, 60), layout: [] },
});
/** The shipped presets at their real paths: `extends` resolves through the same Files port. */
const SHIPPED_PRESETS = Object.fromEntries(
  readdirSync(packageVenuesDir())
    .filter((f) => /\.jsonc?$/.test(f))
    .map((f) => [
      join(packageVenuesDir(), f),
      readFileSync(join(packageVenuesDir(), f)),
    ]),
);

/** Options over in-memory files: the PDF and paperlint.json on "disk", a measurer answering `geometry`. */
function setup(geometry: Geometry = NONE) {
  const files = memoryFiles({
    [PDF]: PDF_BYTES,
    ...SHIPPED_PRESETS,
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "paperlint:agenticdev",
      kind: "short",
    }),
  });
  const measured: unknown[] = [];
  const o: MeasureOptions = {
    readPdf: good,
    files,
    measure: {
      measure(pages) {
        measured.push(pages);
        return geometry;
      },
    },
  };
  return { files, measured, o };
}

test("measure: venue and kind from paperlint.json, pdf relative to the paper, the file's sha256", async () => {
  const { o } = setup();
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  assert.equal(m.value.facts.pdf, "paper.pdf");
  assert.equal(
    m.value.facts.pdf_sha256,
    sha256Hex(new TextEncoder().encode(PDF_BYTES)),
  );
  assert.deepEqual(
    [m.value.facts.venue, m.value.facts.kind],
    ["agenticdev", "short"],
  );
  const over = await measurePaper(PAPER, PDF, { ...o, venue: "aisec" });
  assert.equal(over.ok && over.value.facts.venue, "aisec");
});

test("measure, not measured: the facts are there with null geometry, and the measurer's reason is kept", async () => {
  const { o, measured } = setup(NONE);
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  assert.equal(m.value.facts.geometry_source, null);
  const g = m.value.geometry;
  assert.equal(
    g.kind === "unmeasured" ? whyNoGeometry(g) : "",
    "perl is not installed",
  );
  // Guards: the measurer is handed the pages pdf.js read — the one read feeds both halves.
  assert.deepEqual(measured, [[]]);
});

test("measure, measured: the geometry is in the file under its measurer's name", async () => {
  const { o } = setup(MEASURED);
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  assert.equal(m.value.facts.geometry_source, "banal");
  assert.deepEqual(
    [m.value.facts.columns, m.value.facts.body_pages, m.value.facts.page_w_in],
    [2, 3, 8.5],
  );
});

test("a failed read is the one error line, and nothing is written", async () => {
  const { o, files } = setup();
  const before = files.map.size;
  const m = await measurePaper(PAPER, PDF, {
    ...o,
    readPdf: async () => ({ ok: false, reason: "unreadable", detail: "boom" }),
  });
  assert.match(!m.ok ? m.error : "", /pdf\.js \(unreadable\): boom/);
  assert.equal(files.map.size, before);
});

test("writeFactsFile: <paper>/_build/paper.facts.json holds exactly the document", async () => {
  const { o, files } = setup();
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  const out = writeFactsFile(files, PAPER, m.value.facts);
  assert.equal(out, factsPath(PAPER));
  const text = new TextDecoder().decode(files.map.get(out));
  assert.deepEqual(JSON.parse(text), m.value.facts);
});

test("declaredVenue: none without paperlint.json; no label when it extends no preset", () => {
  assert.equal(declaredVenue(memoryFiles(), PAPER), null);
  const files = memoryFiles({
    [`${PAPER}/paperlint.json`]: '{"kind":"x","pdf":"b/p.pdf"}',
  });
  assert.deepEqual(declaredVenue(files, PAPER), {
    label: null,
    kind: "x",
    pdf: "b/p.pdf",
  });
});

test("declaredVenue: the label is the preset's, and an extends that resolves nowhere is refused", () => {
  const ok = memoryFiles({
    ...SHIPPED_PRESETS,
    [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisec"}',
  });
  assert.equal(declaredVenue(ok, PAPER)?.label, "aisec");
  const typo = memoryFiles({
    ...SHIPPED_PRESETS,
    [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisek"}',
  });
  assert.throws(() => declaredVenue(typo, PAPER), /shipped presets/);
});

test("declaredVenue: a paperlint.json with an unknown key is refused, naming the key", () => {
  const files = memoryFiles({
    [`${PAPER}/paperlint.json`]: '{"venu":"agenticdev"}',
  });
  assert.throws(() => declaredVenue(files, PAPER), /unknown key "venu"/);
});
