/**
 * `facts-file.ts` — the one writer of `_build/paper.facts.json`.
 *
 * The document is assembled from hand-made measurements (pure), and `writeFacts` runs with a FAKE
 * pdf.js reader and a fake banal, so each outcome — read failed, banal missing, banal required —
 * is chosen rather than hoped for. Reading real PDFs is `pdf-facts.harness.mjs`'s job.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { factsDocument, banalFacts, writeFacts, factsPath, declaredVenue } =
  await import(join(HERE, "facts-file.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

/** A last page of `rows` words stacked in two columns of `left` and `right` words. */
const lastPage = (left, right, extra = []) => ({
  widthPt: 612,
  heightPt: 792,
  words: [
    ...Array.from({ length: left }, (_, i) => ({
      x0: 54,
      y0: 60 + i * 10,
      x1: 74,
      y1: 70 + i * 10,
      text: "w",
    })),
    ...Array.from({ length: right }, (_, i) => ({
      x0: 320,
      y0: 60 + i * 10,
      x1: 340,
      y1: 70 + i * 10,
      text: "w",
    })),
    ...extra,
  ],
});
const FONTS = {
  kind: "drawn",
  list: [
    { kind: "embedded", name: "LinLibertineT", program: "Type1C" },
    { kind: "type3", name: "Type3" },
    { kind: "not-embedded", name: "Times-Roman", program: "Type1" },
  ],
};
const doc = (last, banal = null) =>
  factsDocument({
    pdf: "paper.pdf",
    sha: "a".repeat(64),
    venue: "agenticdev",
    kind: "short",
    read: { pages: 4, fonts: FONTS, last },
    banal,
  });

// ── the document ────────────────────────────────────────────────────────────────────────
{
  const d = doc(lastPage(60, 30));
  check("schema is 2", d.schema === 2);
  check(
    "a measured last page: both heights, in last_page and in schema 1's last_page_cols_pt",
    d.last_page.kind === "measured" &&
      JSON.stringify(d.last_page.columns_pt) === "[600,300]" &&
      JSON.stringify(d.last_page_cols_pt) === "[600,300]",
  );
  check(
    "fonts keep poppler's type spelling; a Type 3 font is `Type 3` and embedded, as poppler says",
    JSON.stringify(d.fonts[1]) ===
      JSON.stringify({
        name: "Type3",
        type: "Type 3",
        embedded: true,
        program: "Type3",
      }),
  );
  check(
    "🔴 a font with no usable program is `embedded: false`",
    d.fonts[2].name === "Times-Roman" && d.fonts[2].embedded === false,
  );
  check(
    "without banal the geometry is null and geometry_source says it was not measured",
    d.geometry_source === null && d.page_w_in === null && d.body_pages === null,
  );
  check(
    "npages comes from pdf.js",
    d.npages === 4 && d.fonts_source === "pdfjs-drawn",
  );
}
{
  const numbers = Array.from({ length: 60 }, (_, i) => ({
    x0: 20,
    y0: 60 + i * 10,
    x1: 30,
    y1: 70 + i * 10,
    text: String(i + 1),
  }));
  const d = doc(lastPage(60, 10, numbers));
  check(
    "🔴 a review build: last_page says review, and last_page_cols_pt is null — no fudged heights",
    d.last_page.kind === "review" &&
      d.last_page.line_numbers === 60 &&
      d.last_page_cols_pt === null,
  );
  const stub = doc(lastPage(3, 0));
  check(
    "a stub last page: its word count, and null heights",
    stub.last_page.kind === "stub" &&
      stub.last_page.words === 3 &&
      stub.last_page_cols_pt === null,
  );
}

// ── banal ───────────────────────────────────────────────────────────────────────────────
{
  // banal omits `type` on body pages; three typeless pages are three body pages.
  const b = banalFacts({
    papersize: [792, 612],
    columns: 2,
    bodyfontsize: 9,
    pages: [{}, {}, {}, { type: "bib", reffontsize: 7 }, { type: "appendix" }],
  });
  check(
    "🔴 banal: a page without a type IS a body page — 3 body, 1 bib, 1 appendix",
    b.body_pages === 3 && b.ref_pages === 1 && b.appendix_pages === 1,
    JSON.stringify(b),
  );
  check(
    "banal: papersize is [height, width] in points → inches",
    b.page_w_in === 8.5 &&
      b.page_h_in === 11 &&
      b.ref_pt === 7 &&
      b.body_pt === 9,
  );
}

// ── writing ─────────────────────────────────────────────────────────────────────────────
const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-facts-file-")));
try {
  const paper = join(root, "papers", "p");
  mkdirSync(paper, { recursive: true });
  const pdf = join(paper, "paper.pdf");
  writeFileSync(pdf, "%PDF-pretend");
  writeFileSync(
    join(paper, "venue.json"),
    JSON.stringify({ venue: "agenticdev", kind: "short" }),
  );
  const good = async () => ({
    ok: true,
    facts: { pages: 2, fonts: FONTS, last: lastPage(60, 60) },
  });
  const opts = { readPdf: good, banal: "optional", projectRoot: root, env: {} };

  const w = await writeFacts(paper, pdf, opts);
  const onDisk = JSON.parse(readFileSync(factsPath(paper), "utf8"));
  check(
    "written to <paper>/_build/paper.facts.json, and the returned document is what is on disk",
    w.ok &&
      w.path === join(paper, "_build", "paper.facts.json") &&
      JSON.stringify(onDisk) === JSON.stringify(w.facts),
  );
  check(
    "🔴 `pdf` is relative to the PAPER directory, and pdf_sha256 is the file's",
    onDisk.pdf === "paper.pdf" &&
      onDisk.pdf_sha256 ===
        createHash("sha256").update(readFileSync(pdf)).digest("hex"),
    JSON.stringify(onDisk.pdf),
  );
  check(
    "venue and kind come from venue.json; an explicit value overrides it",
    onDisk.venue === "agenticdev" &&
      onDisk.kind === "short" &&
      (await writeFacts(paper, pdf, { ...opts, venue: "aisec" })).facts
        .venue === "aisec",
  );
  check(
    "banal optional and absent: written, and the reason the geometry is null is returned",
    w.geometryMissing?.startsWith("banal not found: ") &&
      onDisk.geometry_source === null,
    String(w.geometryMissing),
  );

  rmSync(join(paper, "_build"), { recursive: true });
  const req = await writeFacts(paper, pdf, { ...opts, banal: "required" });
  check(
    "🔴 banal REQUIRED and absent: a failure naming banal, and nothing written",
    !req.ok &&
      /banal not found/.test(req.lines[0]) &&
      !existsSync(factsPath(paper)),
  );

  const fake = join(root, "banal.pl");
  writeFileSync(
    fake,
    `print '{"papersize":[792,612],"columns":2,"bodyfontsize":9,"pages":[{},{"type":"bib","reffontsize":7}]}';\n`,
  );
  const withBanal = await writeFacts(paper, pdf, {
    ...opts,
    banal: "required",
    env: { BANAL: fake },
  });
  check(
    "banal found ($BANAL): its geometry is in the facts, and geometry_source says banal",
    withBanal.ok &&
      withBanal.facts.geometry_source === "banal" &&
      withBanal.facts.columns === 2 &&
      withBanal.facts.body_pages === 1,
    JSON.stringify(withBanal),
  );

  const before = readFileSync(factsPath(paper), "utf8");
  const failed = await writeFacts(paper, pdf, {
    ...opts,
    readPdf: async () => ({ ok: false, reason: "unreadable", detail: "boom" }),
  });
  check(
    "a failed read: the reason is returned and the old facts file is left untouched",
    !failed.ok &&
      /pdf\.js \(unreadable\): boom/.test(failed.lines[0]) &&
      readFileSync(factsPath(paper), "utf8") === before,
  );
  check(
    "declaredVenue: a venue.json without a venue declares nothing",
    (() => {
      writeFileSync(join(paper, "venue.json"), JSON.stringify({ kind: "x" }));
      return declaredVenue(paper) === null;
    })(),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — facts-file: schema 2, review/stub nulls, banal optional or required, one writer`,
);
