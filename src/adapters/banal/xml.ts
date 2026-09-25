/**
 * THE BANAL INPUT XML: the pdftohtml-format XML (text boxes with position, size and font per page)
 * that rpp writes from the domain's page layout, which is the input banal reads — PURE. No disk, no pdf.js,
 * no process.
 *
 * `pdf-facts.ts` reads the PDF with pdf.js and hands this module plain data: every text item's box,
 * size, font, fill colour and whether it is upright. This module decides which of them a page-layout
 * tool would count, and writes them as the banal input XML, in the dialect `pdftohtml -xml` writes
 * and banal (HotCRP's page-geometry script, see `./index.ts`) reads. banal then measures that XML exactly as it measures the XML poppler's
 * `pdftohtml` writes — which is how rpp gets banal's numbers without poppler (issue #61).
 *
 * ── WHAT MAKES THE XML EQUAL TO pdftohtml's, as far as banal can tell ─────────────
 * Measured on 50 PDFs / 598 pages (2026-09-25): real banal on this XML gave the same page size,
 * columns, body and reference font size, and page counts by type as real banal on real pdftohtml.
 * It matched only with the conditions below; each gave a wrong answer when switched off.
 *
 *   1. ROTATED TEXT IS NOT WRITTEN. pdftohtml writes it with width 0 and banal drops zero-width
 *      text; writing it as a horizontal box would count a rotated margin note as body text.
 *   2. INVISIBLE TEXT (render mode 3, an OCR layer) IS NOT WRITTEN — pdftohtml does not write it.
 *   3. LIGHT TEXT IS WRITTEN WITH ITS COLOUR, and banal drops it itself. What counts as light is
 *      banal's decision (a watermark, grey code comments), so the colour goes into `<fontspec>`
 *      exactly as pdftohtml writes it and no threshold is copied here.
 *   4. SIZES AND COORDINATES AT ZOOM 3, the scale banal assumes for a modern pdftohtml. A font size
 *      is written as `round(size × 3)` — an integer, as pdftohtml writes it — and banal applies its
 *      own rounding to it; coordinates are written unrounded and banal rounds them to 1/8 of a
 *      decipoint. Rounding them here would round twice.
 *
 * banal also has to be told which pdftohtml wrote the XML, because it asks `pdftohtml -v` and
 * derives the zoom and a font-size correction from the answer. `./index.ts` answers that question
 * with `XML_DIALECT` below; the dialect and the writer live together so they cannot disagree.
 */
import type { Fill, PageLayout, TextBox } from "../../domain/page-layout.ts";

/**
 * The pdftohtml whose XML this module writes: the zoom it writes at, and the version banal is told.
 * banal (1.2, lines 1848-1867) picks zoom 3 and a font-size correction of 1 for any version >= 0.85;
 * told an older version it uses 3, and every font size it reports moves.
 */
export const XML_DIALECT = { zoom: 3, version: "24.02.0" } as const;

const BLACK = "#000000";

/** Whether pdftohtml would write this box at all (conditions 1 and 2 above). */
export const written = (b: TextBox): boolean =>
  b.upright && b.fill.kind !== "invisible" && b.text.trim() !== "";

const colourOf = (f: Fill): string => (f.kind === "rgb" ? f.hex : BLACK);

/** XML-escape text and attribute values the way pdftohtml does (a newline becomes a space). */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&#34;")
    .replace(/[\r\n]/g, " ");
}

/** A number as pdftohtml's `-noroundcoord` writes it: fixed, six decimals. */
const fixed = (n: number): string => n.toFixed(6);

/**
 * The document-wide font table. pdftohtml numbers fonts across the whole document and declares a
 * font on the first page that uses it, before that page's text; banal keeps the table across pages.
 */
class FontTable {
  private readonly ids = new Map<string, number>();

  /** The id of this font, and whether this is its first use. */
  idOf(size: number, font: string, colour: string): [number, boolean] {
    const key = `${String(size)}|${font}|${colour}`;
    const known = this.ids.get(key);
    if (known !== undefined) return [known, false];
    const id = this.ids.size;
    this.ids.set(key, id);
    return [id, true];
  }
}

/** One page: its `<page>` line, the fonts it introduces, then its text lines. */
function pageXml(p: PageLayout, n: number, fonts: FontTable): string[] {
  const z = XML_DIALECT.zoom;
  const specs: string[] = [];
  const texts: string[] = [];
  for (const b of p.boxes.filter(written)) {
    const size = Math.round(b.size * z);
    const colour = colourOf(b.fill);
    const [id, fresh] = fonts.idOf(size, b.font, colour);
    if (fresh)
      specs.push(
        `\t<fontspec id="${String(id)}" size="${String(size)}" family="${xmlEscape(b.font)}" color="${colour}"/>`,
      );
    texts.push(
      `<text top="${fixed(b.top * z)}" left="${fixed(b.left * z)}" width="${fixed(b.width * z)}" height="${fixed(b.height * z)}" font="${String(id)}">${xmlEscape(b.text)}</text>`,
    );
  }
  const head = `<page number="${String(n)}" position="absolute" top="0" left="0" height="${String(Math.round(p.heightPt * z))}" width="${String(Math.round(p.widthPt * z))}">`;
  return [head, ...specs, ...texts, "</page>"];
}

/** The pages as `pdftohtml -xml -i -zoom 3 -noroundcoord` would write them. */
export function pdf2xml(pages: readonly PageLayout[]): string {
  const fonts = new FontTable();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE pdf2xml SYSTEM "pdf2xml.dtd">',
    `<pdf2xml producer="research-paper-pipeline (pdf.js)" version="${XML_DIALECT.version}">`,
    ...pages.flatMap((p, i) => pageXml(p, i + 1, fonts)),
    "</pdf2xml>",
  ];
  return `${lines.join("\n")}\n`;
}
