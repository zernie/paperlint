/**
 * THE BANAL INPUT XML: the pdftohtml-format XML (text boxes with position, size and font per page)
 * that rpp writes from pdf.js text, which is the input banal reads — PURE. No disk, no pdf.js, no
 * process.
 *
 * `pdf-facts.ts` reads the PDF with pdf.js and hands this module plain data: every text item's box,
 * size, font, fill colour and whether it is upright. This module decides which of them a page-layout
 * tool would count, and writes them as the banal input XML, in the dialect `pdftohtml -xml` writes
 * and banal (HotCRP's page-geometry script, see `../../banal.ts`) reads. banal then measures that XML exactly as it measures the XML poppler's
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
 * derives the zoom and a font-size correction from the answer. `../../banal.ts` answers that question
 * with `XML_DIALECT` below; the dialect and the writer live together so they cannot disagree.
 */

/** The fill a text item was drawn with. `unknown` is drawn as black, as pdftohtml's default is. */
export type Fill =
  | { readonly kind: "rgb"; readonly hex: string }
  | { readonly kind: "invisible" }
  | { readonly kind: "unknown" };

/** One text item, in points, top-down. `size` is the font size in points. */
export interface TextBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly font: string;
  readonly text: string;
  readonly upright: boolean;
  readonly fill: Fill;
}

/** A page's size in points and every text item on it, in content order. */
export interface PageLayout {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly boxes: readonly TextBox[];
}

/**
 * The pdftohtml whose XML this module writes: the zoom it writes at, and the version banal is told.
 * banal (1.2, lines 1848-1867) picks zoom 3 and a font-size correction of 1 for any version >= 0.85;
 * told an older version it uses 3, and every font size it reports moves.
 */
export const XML_DIALECT = { zoom: 3, version: "24.02.0" } as const;

const BLACK = "#000000";

/** A transform `[a, b, c, d, e, f]` that draws text upright: no rotation and no skew. */
export function isUpright(m: readonly number[]): boolean {
  const eps = 1e-6;
  return Math.abs(m[1] ?? 0) < eps && Math.abs(m[2] ?? 0) < eps;
}

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

// ── fill colour, recovered from the operator list ─────────────────────────────────────────

/** The operator codes the colour walk reads — pdf.js's `OPS`, reduced to what is used. */
export interface ColourOps {
  readonly save: number;
  readonly restore: number;
  readonly setFillRGBColor: number;
  readonly setTextRenderingMode: number;
  readonly showText: number;
  readonly showSpacedText: number;
}

/** pdf.js's operator list: parallel arrays of operator codes and their arguments. */
export interface OperatorList {
  readonly fnArray: readonly number[];
  readonly argsArray: readonly unknown[];
}

/** Text as the walk compares it: normalised, with no whitespace (items and glyphs split spaces differently). */
const squeeze = (s: string): string => s.normalize("NFKC").replace(/\s+/g, "");

/** `setFillRGBColor`'s argument: a `#rrggbb` string in current pdf.js, three 0-255 numbers in older ones. */
export function hexOf(args: unknown): string {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  if (typeof a[0] === "string") return a[0].toLowerCase();
  const byte = (v: unknown): string =>
    Math.round(typeof v === "number" ? v : 0)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(a[0])}${byte(a[1])}${byte(a[2])}`;
}

/** The characters a show-text operator draws, from its glyph objects. */
function glyphText(args: unknown): string {
  const a = Array.isArray(args) ? (args as unknown[]) : [];
  const glyphs = Array.isArray(a[0]) ? (a[0] as unknown[]) : [];
  return glyphs
    .map((g) =>
      typeof g === "object" && g !== null && "unicode" in g
        ? String((g as { unicode: unknown }).unicode ?? "")
        : "",
    )
    .join("");
}

/** The graphics state the walk tracks. */
interface State {
  fill: Fill;
  mode: number;
}

/** Apply one state operator; false when `fn` is not one. */
function applyState(
  ops: ColourOps,
  fn: number,
  args: unknown,
  s: { cur: State; stack: State[] },
): boolean {
  if (fn === ops.save) s.stack.push({ ...s.cur });
  else if (fn === ops.restore)
    s.cur = s.stack.pop() ?? { fill: { kind: "unknown" }, mode: 0 };
  else if (fn === ops.setFillRGBColor)
    s.cur.fill = { kind: "rgb", hex: hexOf(args) };
  else if (fn === ops.setTextRenderingMode)
    s.cur.mode = Number((args as unknown[] | undefined)?.[0] ?? 0);
  else return false;
  return true;
}

/** Every drawn character, in content order, with the fill it was drawn in. */
export function drawnCharacters(
  ops: ColourOps,
  list: OperatorList,
): { chars: string[]; fills: Fill[] } {
  const s = { cur: { fill: { kind: "unknown" } as Fill, mode: 0 }, stack: [] };
  const chars: string[] = [];
  const fills: Fill[] = [];
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i];
    if (applyState(ops, fn, args, s)) return;
    if (fn !== ops.showText && fn !== ops.showSpacedText) return;
    const fill: Fill = s.cur.mode === 3 ? { kind: "invisible" } : s.cur.fill;
    for (const ch of squeeze(glyphText(args))) {
      chars.push(ch);
      fills.push(fill);
    }
  });
  return { chars, fills };
}

/** How far ahead the walk looks for an item it cannot find where it expects it. */
export const LOOKAHEAD = 4000;

/** The position at or after `from` where `want` starts in `chars`, or -1 within the look-ahead. */
function findRun(
  chars: readonly string[],
  want: readonly string[],
  from: number,
): number {
  const limit = Math.min(chars.length, from + LOOKAHEAD);
  for (let q = from; q < limit; q++)
    if (want.every((ch, k) => chars[q + k] === ch)) return q;
  return -1;
}

/**
 * The fill of each text item. pdf.js's text content carries no colour, so the operator list is
 * walked for the characters each show-text operator draws, and the items — in the same content
 * order — are matched against them. An item that cannot be matched gets `unknown` (drawn as black):
 * a missed match can keep light text, never drop dark text.
 */
export function fillsOf(
  ops: ColourOps,
  list: OperatorList,
  items: readonly string[],
): Fill[] {
  const { chars, fills } = drawnCharacters(ops, list);
  let at = 0;
  return items.map((text): Fill => {
    const want = [...squeeze(text)];
    if (want.length === 0) return { kind: "unknown" };
    const q = findRun(chars, want, at);
    if (q < 0) return { kind: "unknown" };
    at = q + want.length;
    return fills[q] ?? { kind: "unknown" };
  });
}
