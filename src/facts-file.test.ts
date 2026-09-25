/**
 * `facts-file.ts` — the one writer of `_build/paper.facts.json`.
 *
 * The document is assembled from hand-made measurements (pure), and `measurePaper` runs on
 * in-memory adapters with a FAKE pdf.js reader and a scripted banal, so each outcome — read failed,
 * banal missing, banal failing, banal measuring — is chosen rather than hoped for. Reading real PDFs
 * is `pdf-facts.harness.mjs`'s job; the real banal is `test/e2e/banal.mjs`.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  exitedWith,
  memoryFiles,
  memoryIo,
  scriptedProcess,
} from "./adapters/memory/index.ts";
import {
  declaredVenue,
  factsDocument,
  factsPath,
  measurePaper,
  writeFactsFile,
  type MeasureOptions,
} from "./facts-file.ts";
import { whyNoGeometry, type Geometry } from "./adapters/banal/geometry.ts";
import { sha256Hex } from "./adapters/banal/install.ts";
import { geometryOf } from "./adapters/banal/output.ts";
import { parseBanalSettings } from "./adapters/banal/settings.ts";
import type { AbsolutePath, Io, ProcessExit } from "./domain/ports.ts";
import type { BanalCandidate } from "./adapters/banal/locate.ts";
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
  source: "none",
  why: { kind: "perl-missing" },
  tried: null,
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
  const g = geometryOf({
    papersize: [792, 612],
    columns: 2,
    bodyfontsize: 9,
    pages: [{}, {}, {}, { type: "bib", reffontsize: 7 }, { type: "appendix" }],
  });
  const by: BanalCandidate = {
    path: "/b" as AbsolutePath,
    provenance: { kind: "env" },
  };
  const measured = doc(lastPage(60, 30), { source: "banal", by, geometry: g });
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
const MEASURED =
  '{"papersize":[792,612],"columns":2,"bodyfontsize":9,"pages":[{},{"type":"bib","reffontsize":7}]}';
const dirs = { home: "/h", tmp: "/t", cwd: "/r" };

/** Options over in-memory ports: the PDF and venue.json on "disk", banal answering `exit`. */
function setup(env: Record<string, string>, exit?: ProcessExit) {
  const files = memoryFiles({
    [PDF]: PDF_BYTES,
    [`${PAPER}/venue.json`]: JSON.stringify({
      venue: "agenticdev",
      kind: "short",
    }),
    "/own/banal": "",
  });
  const run = scriptedProcess(() => exit ?? exitedWith(MEASURED));
  const io: Io = memoryIo({ files, run });
  const o: MeasureOptions = {
    readPdf: good,
    runtime: { io, settings: parseBanalSettings(env, dirs) },
    projectRoot: "/r",
  };
  return { files, run, o };
}

test("measure: venue and kind from venue.json, pdf relative to the paper, the file's sha256", async () => {
  const { o } = setup({});
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

test("measure without banal: the facts are there with null geometry, and the reason says why", async () => {
  const { o } = setup({});
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  assert.equal(m.value.facts.geometry_source, null);
  const g = m.value.geometry;
  assert.match(
    g.source === "none" ? whyNoGeometry(g) : "",
    /^banal not found: /,
  );
});

test("measure with $BANAL: banal gets the .xml and a quoted $PDFTOHTML, and its geometry is in", async () => {
  const { o, run } = setup({ BANAL: "/own/banal" });
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  assert.equal(m.value.facts.geometry_source, "banal");
  assert.equal(m.value.facts.columns, 2);
  assert.equal(m.value.facts.body_pages, 1);
  const c = run.calls[0];
  // Guards: the poppler-free path — banal is handed rpp's XML, never the PDF.
  assert.match(c?.args.at(-1) ?? "", /\.xml$/);
  assert.match(c?.env["PDFTOHTML"] ?? "", /^'.*pdftohtml'$/);
});

test("measure with a failing banal: no geometry, and the reason names exit, message and source", async () => {
  const { o } = setup(
    { BANAL: "/own/banal" },
    { kind: "exited", status: 3, stdout: "", stderr: "boom\n" },
  );
  const m = await measurePaper(PAPER, PDF, o);
  const g = m.ok ? m.value.geometry : NONE;
  // Guards: a banal that runs and fails is not reported as "not found".
  assert.match(
    g.source === "none" ? whyNoGeometry(g) : "",
    /^banal failed \(exit 3\): boom \(banal from \$BANAL: \/own\/banal\)$/,
  );
});

test("a failed read is the one error line, and nothing is written", async () => {
  const { o, files } = setup({});
  const before = files.map.size;
  const m = await measurePaper(PAPER, PDF, {
    ...o,
    readPdf: async () => ({ ok: false, reason: "unreadable", detail: "boom" }),
  });
  assert.match(!m.ok ? m.error : "", /pdf\.js \(unreadable\): boom/);
  assert.equal(files.map.size, before);
});

test("writeFactsFile: <paper>/_build/paper.facts.json holds exactly the document", async () => {
  const { o, files } = setup({});
  const m = await measurePaper(PAPER, PDF, o);
  assert.ok(m.ok);
  const out = writeFactsFile(files, PAPER, m.value.facts);
  assert.equal(out, factsPath(PAPER));
  const text = new TextDecoder().decode(files.map.get(out));
  assert.deepEqual(JSON.parse(text), m.value.facts);
});

test("declaredVenue: none without venue.json, none when it names no venue", () => {
  assert.equal(declaredVenue(memoryFiles(), PAPER), null);
  const files = memoryFiles({ [`${PAPER}/venue.json`]: '{"kind":"x"}' });
  assert.equal(declaredVenue(files, PAPER), null);
});
