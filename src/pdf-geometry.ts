/**
 * WHAT A PDF'S TEXT AND FONTS SAY, once pdf.js has read them — PURE. No disk, no pdf.js.
 *
 * `pdf-facts.ts` is the shell: it opens the PDF with pdf.js (the `unpdf` package) and hands this
 * module plain data — text runs with their metrics, and the fonts each page resolved. Everything
 * that DECIDES something is here, so every branch is a row in a table test fed with hand-written
 * words, including pages the fixture corpus does not contain.
 *
 * ── WHY pdf.js AND NOT POPPLER (issue #61) ───────────────────────────────────
 * The facts used to come from three poppler programs (`pdfinfo`, `pdffonts`, `pdftotext -bbox`), a
 * system install rpp could not provide and every consumer had to add by hand. A measurement on 25
 * PDFs (2026-09-24) found pdf.js equal on page count and on the Type 3 count of every PDF, and the
 * last page's column heights within 0.2 pt except on an all-Type-3 page (7.2 pt; pdf.js has no
 * ascent for Type 3). No verdict flipped at a 120 pt tolerance.
 *
 * ── THE LAST PAGE IS A MEASUREMENT, NOT A VERDICT ────────────────────────────
 * `classifyLastPage` returns the heights of the two columns, or says why there is nothing to
 * measure. It carries no threshold: whether a venue requires balance, and how much difference it
 * allows, belongs to the lint rule `pdf/last-page-balance`, which a consumer turns on per venue.
 */

/** One word on a page, in points, top-down: `y0` is the top edge, `y1` the bottom. */
export interface Word {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly text: string;
}

/** A page's size and its words. */
export interface PageText {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly words: readonly Word[];
}

/** The heights of the last page's two columns, in points: [left, right]. */
export type Columns = readonly [left: number, right: number];

/**
 * What the last page is, as far as balance goes.
 *
 * - `measured` — the heights of both columns.
 * - `stub`     — fewer than `STUB_WORDS` words: a tail of a few lines is not a layout.
 * - `review`   — numbered lines in the outer margins. The numbers run down the whole page, so every
 *                column would measure full height; a review build is not judged at all.
 */
export type LastPage =
  | { readonly kind: "measured"; readonly columns: Columns }
  | { readonly kind: "stub"; readonly words: number }
  | { readonly kind: "review"; readonly lineNumbers: number };

/** Below this many words the last page is a stub. */
export const STUB_WORDS = 60;
/** This many short integers in the outer margins make a review build. */
export const REVIEW_LINE_NUMBERS = 5;
/** The outer margins, as a fraction of the page width, where line numbers sit. */
export const MARGIN_FRACTION = 0.08;

const round1 = (n: number): number => Number(n.toFixed(1));

/** Top of the highest word to bottom of the lowest one; 0 for no words. */
function heightOf(words: readonly Word[]): number {
  if (words.length === 0) return 0;
  const top = Math.min(...words.map((w) => w.y0));
  const bottom = Math.max(...words.map((w) => w.y1));
  return round1(bottom - top);
}

/** A short integer standing in the left or right margin: a line number of a review build. */
function isLineNumber(w: Word, widthPt: number): boolean {
  const margin = widthPt * MARGIN_FRACTION;
  return (
    /^\d{1,4}$/.test(w.text.trim()) &&
    (w.x1 < margin || w.x0 > widthPt - margin)
  );
}

/**
 * Classify the last page and, when it has a layout, measure its two columns.
 *
 * 🔴 THE PAGE IS SPLIT AT ITS OWN MIDDLE, not between the outermost words: on a page where only the
 * left column is filled, the words' midpoint falls inside that column and cuts it in two ("77 / 731"
 * for six lines at the top left, measured 2026-08-29). A word belongs to the side its left edge is on.
 *
 * Throws on a page with no width — the caller built `PageText` from the PDF's own viewport, so a
 * non-positive width is a defect in the caller, not a property of a paper.
 */
export function classifyLastPage(p: PageText): LastPage {
  if (!(p.widthPt > 0))
    throw new RangeError(`page width must be positive, got ${p.widthPt}`);
  if (p.words.length < STUB_WORDS)
    return { kind: "stub", words: p.words.length };
  const lineNumbers = p.words.filter((w) => isLineNumber(w, p.widthPt)).length;
  if (lineNumbers >= REVIEW_LINE_NUMBERS)
    return { kind: "review", lineNumbers };
  const mid = p.widthPt / 2;
  return {
    kind: "measured",
    columns: [
      heightOf(p.words.filter((w) => w.x0 < mid)),
      heightOf(p.words.filter((w) => w.x0 >= mid)),
    ],
  };
}

// ── words from text runs ────────────────────────────────────────────────────────────────

/**
 * One text run as pdf.js reports it, already in top-down page coordinates: where its baseline
 * starts, how wide it is, its font size, and the font's ascent and descent as fractions of the size
 * (descent negative, as fonts store it).
 */
export interface TextRun {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
  readonly width: number;
  readonly size: number;
  readonly ascent: number;
  readonly descent: number;
}

/** A font's vertical metrics as fractions of its size, when pdf.js supplies none. */
export const DEFAULT_ASCENT = 0.8;
export const DEFAULT_DESCENT = -0.2;

/**
 * Split a run into words. pdf.js gives a run's total width, not each glyph's, so a word's horizontal
 * extent is estimated in proportion to its characters. Only `x0` decides the column a word falls
 * in, and a run never crosses the gutter, so the estimate cannot move a word to the other side.
 */
export function wordsOf(run: TextRun): Word[] {
  const perChar = run.width / Math.max(1, run.text.length);
  const y0 = run.baseline - run.ascent * run.size;
  const y1 = run.baseline - run.descent * run.size;
  return [...run.text.matchAll(/\S+/g)].map((m) => {
    const x0 = run.x + (m.index ?? 0) * perChar;
    return { x0, y0, x1: x0 + m[0].length * perChar, y1, text: m[0] };
  });
}

// ── fonts ───────────────────────────────────────────────────────────────────────────────

/** The font programs a PDF can carry, in pdf.js's vocabulary. */
export type FontProgram =
  | "Type1"
  | "Type1C"
  | "MMType1"
  | "TrueType"
  | "OpenType"
  | "CIDType0"
  | "CIDType0C"
  | "CIDTrueType"
  | "Type3";

/** A program pdf.js named but this module does not know — kept verbatim, never guessed. */
export type UnknownProgram = `unknown:${string}`;

/**
 * One font the PDF draws text with.
 *
 * - `embedded`     — a usable font program is in the file.
 * - `type3`        — a Type 3 font: glyphs drawn as PDF procedures, usually bitmaps. pdf.js gives
 *                    every Type 3 font the same name, `Type3`, so the name carries nothing.
 * - `not-embedded` — the PDF names the font but carries no usable program for it: either none at
 *                    all, or one pdf.js could not parse. pdf.js reports both as one flag
 *                    (`missingFile`), so the two are not told apart here.
 */
export type FontFact =
  | {
      readonly kind: "embedded";
      readonly name: string;
      readonly program: Exclude<FontProgram, "Type3"> | UnknownProgram;
    }
  | { readonly kind: "type3"; readonly name: "Type3" }
  | {
      readonly kind: "not-embedded";
      readonly name: string;
      readonly program: Exclude<FontProgram, "Type3"> | UnknownProgram;
    };

/** A font as pdf.js exports it with `fontExtraProperties`, reduced to what is read here. */
export interface RawFont {
  /** pdf.js's id for the font within the document (`loadedName`). */
  readonly id: string;
  readonly name: string;
  readonly type: string | undefined;
  readonly subtype: string | undefined;
  readonly isType3Font: boolean;
  readonly missingFile: boolean;
}

/** One page: whether it draws any text, and the fonts its text resolved to. */
export interface RawPage {
  readonly hasText: boolean;
  readonly fonts: readonly RawFont[];
}

/**
 * The fonts of a document. `drawn` is non-empty BY TYPE: a document whose pages draw text has at
 * least one font, and "no fonts" is spelled only as `no-text`.
 */
export type Fonts =
  | {
      readonly kind: "drawn";
      readonly list: readonly [FontFact, ...FontFact[]];
    }
  | { readonly kind: "no-text" };

/**
 * 🔴 TEXT ON A PAGE WITH NO FONT BEHIND IT IS A FAILED READ, NOT AN EMPTY LIST. Measured on Node
 * 20.20.2: pdf.js opens the same PDFs and returns ZERO fonts with no error. An empty list there
 * would read downstream as "no Type 3, nothing unembedded" — a clean verdict over nothing.
 */
export interface ZeroFontsOnText {
  readonly kind: "zero-fonts-on-text";
  /** 1-based numbers of the pages that draw text with no font resolved. */
  readonly pages: readonly number[];
}

/**
 * pdf.js's `type`/`subtype` pair → the program, keyed `type/subtype`. Composite fonts carry their
 * descendant's type. A pair not listed is kept verbatim as `unknown:…`, never guessed.
 */
const PROGRAMS: Readonly<Record<string, Exclude<FontProgram, "Type3">>> = {
  "Type1/undefined": "Type1",
  "Type1/Type1C": "Type1C",
  "MMType1/undefined": "MMType1",
  "TrueType/undefined": "TrueType",
  "CIDFontType0/undefined": "CIDType0",
  "CIDFontType0/CIDFontType0C": "CIDType0C",
  "CIDFontType2/undefined": "CIDTrueType",
};

export function programOf(
  type: string | undefined,
  subtype: string | undefined,
): Exclude<FontProgram, "Type3"> | UnknownProgram {
  // pdf.js names an OpenType-wrapped program by the wrapper, on either field, whatever it wraps.
  if (subtype === "OpenType" || type === "OpenType") return "OpenType";
  const key = `${String(type)}/${String(subtype)}`;
  return PROGRAMS[key] ?? `unknown:${key}`;
}

/** Subset fonts carry a six-letter tag, `ABCDEF+Name`; the name is what follows it. */
const withoutSubsetTag = (name: string): string =>
  name.replace(/^[A-Z]{6}\+/, "");

export function fontFact(f: RawFont): FontFact {
  if (f.isType3Font) return { kind: "type3", name: "Type3" };
  const name = withoutSubsetTag(f.name);
  const program = programOf(f.type, f.subtype);
  return f.missingFile
    ? { kind: "not-embedded", name, program }
    : { kind: "embedded", name, program };
}

/**
 * The document's fonts, each once, in the order pages first drew them — or the pages that drew
 * text with no font, which the caller turns into a failed read.
 */
export function fontsOf(pages: readonly RawPage[]): Fonts | ZeroFontsOnText {
  const bad = pages.flatMap((p, i) =>
    p.hasText && p.fonts.length === 0 ? [i + 1] : [],
  );
  if (bad.length > 0) return { kind: "zero-fonts-on-text", pages: bad };
  const seen = new Map<string, FontFact>();
  for (const p of pages)
    for (const f of p.fonts) if (!seen.has(f.id)) seen.set(f.id, fontFact(f));
  const [first, ...rest] = seen.values();
  return first
    ? { kind: "drawn", list: [first, ...rest] }
    : { kind: "no-text" };
}

/**
 * poppler's spelling of the font's type column (`pdffonts`), which the facts JSON has always used
 * and consumers match on (`Type 3`).
 */
export const POPPLER_TYPE: Readonly<Record<FontProgram, string>> = {
  Type1: "Type 1",
  Type1C: "Type 1C",
  MMType1: "Type 1",
  TrueType: "TrueType",
  OpenType: "OpenType",
  CIDType0: "CID Type 0",
  CIDType0C: "CID Type 0C",
  CIDTrueType: "CID TrueType",
  Type3: "Type 3",
};

/** The type column for any fact, the unknown ones verbatim. */
export function popplerType(f: FontFact): string {
  if (f.kind === "type3") return POPPLER_TYPE.Type3;
  return f.program.startsWith("unknown:")
    ? f.program
    : POPPLER_TYPE[f.program as FontProgram];
}
