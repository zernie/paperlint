#!/usr/bin/env node
/**
 * Find a verbatim passage in a PDF, render its page, highlight the passage and crop to its column.
 *
 * Usage: node crop_quote.js <pdf> <out.png> "<passage>" [--page N]
 *   (in this checkout `node crop_quote.ts`; a consumer runs the compiled `.js`, because Node strips
 *   no types under node_modules)
 * Prints one JSON line: {"page": N, "pages": [every page the passage is on], "words": "the matched words"}.
 * Exit 1: the passage is not in the PDF, or not on the --page asked for (nothing written).
 * Exit 2: a wrong call, a PDF pdf.js cannot read, or no @napi-rs/canvas to draw with (nothing written).
 * Exit 3: it is on more than one page and --page does not pick one (an abstract repeats its body; the
 * first hit is the wrong one as often as the right one).
 *
 * The words come from pdf.js through the reader `paperlint build` uses (`src/pdf-facts.ts`): each text
 * item's box, split at spaces with its width shared out by characters. The page is drawn by unpdf's
 * `renderPageAsImage` on @napi-rs/canvas, an optional peer dependency: only this script needs it, so
 * a project that never crops a quote never downloads it, and one that does is told the one command.
 *
 * Matching ignores case, punctuation, spacing and line-end hyphenation: the PDF's words and the passage are
 * both reduced to letters and digits (NFKC first, so a ligature reads as its letters) and compared as one
 * stream. A passage matches whole or not at all; there is no shorter fallback, because a fallback that finds
 * "a" place is how a crop lands on the wrong sentence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { describeFailure, readPdf } from "#src/pdf-facts";
import { messageOf } from "#src/domain/text";
import type { PageLayout } from "#src/domain/page-layout";
import { isMain } from "../../paper-pipeline/scripts/consumer.mjs";

type Canvas = typeof import("@napi-rs/canvas");

const DPI = 150;
/** Points of page shown above and below the passage. */
const CONTEXT_PT = 60;
/** The highlight: yellow at 43% over the text, so the words stay readable under it. */
const HIGHLIGHT = "rgba(255, 214, 0, 0.43)";
const USAGE =
  'usage: node crop_quote.js <pdf> <out.png> "<passage>" [--page N]';

/** A word of the PDF in points, top-down, with its 1-based page and that page's size. */
interface Word {
  readonly page: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly text: string;
}

const norm = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * How wide `text` is in a proportional font, in arbitrary units. pdf.js gives a run's width, not
 * each glyph's, so a word's place in its run is its share of this measure: an even share per
 * character put the highlight of "every" on "very" (looked at). The added unit per character keeps
 * a canvas with no font at all, where every width is 0, at that even share instead of dividing by 0.
 */
const measurer = (canvas: Canvas): ((text: string) => number) => {
  const ctx = canvas.createCanvas(1, 1).getContext("2d");
  ctx.font = "100px sans-serif";
  return (text) => ctx.measureText(text).width + text.length;
};

/** Every word of every page, in pdf.js's content order. */
const wordsOf = (
  layout: readonly PageLayout[],
  measure: (text: string) => number,
): readonly Word[] =>
  layout.flatMap((p, i) =>
    p.boxes.flatMap((b) => {
      const at = (k: number) =>
        b.left + (b.width * measure(b.text.slice(0, k))) / measure(b.text);
      return [...b.text.matchAll(/\S+/g)].map((m) => ({
        page: i + 1,
        pageWidth: p.widthPt,
        pageHeight: p.heightPt,
        x0: at(m.index),
        y0: b.top,
        x1: at(m.index + m[0].length),
        y1: b.top + b.height,
        text: m[0],
      }));
    }),
  );

/** A match: the words it covers, never none. */
type Match = readonly [Word, ...Word[]];

/** Each match of the passage, as the words it covers. */
function occurrences(ws: readonly Word[], passage: string): readonly Match[] {
  const keys = ws.map((w) => norm(w.text));
  let end = 0;
  const starts = keys.map((k) => {
    const start = end;
    end += k.length;
    return start;
  });
  const needle = norm(passage);
  if (!needle) return [];
  const hits = [...keys.join("").matchAll(new RegExp(`(?=${needle})`, "g"))];
  // The word a letter falls in: the last word starting at or before it (an empty word starts where the next does).
  const wordAt = (at: number) => starts.findLastIndex((s) => s <= at);
  return hits
    .map(({ index: at }): readonly Word[] =>
      ws
        .slice(wordAt(at), wordAt(at + needle.length - 1) + 1)
        .filter((w) => norm(w.text)),
    )
    .filter((m): m is Match => m.length > 0);
}

/** A rectangle in pixels of the page drawn at DPI. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const SCALE = DPI / 72;

/**
 * The crop: the column the passage sits in (every word of its page within 40 pt of the passage's
 * left and right edge, plus 8 pt), CONTEXT_PT above and below it, inside the page.
 */
function cropOf(sel: Match, ws: readonly Word[]): Rect {
  const [{ page, pageWidth, pageHeight }] = sel;
  const xs0 = Math.min(...sel.map((w) => w.x0));
  const xs1 = Math.max(...sel.map((w) => w.x1));
  const col = ws.filter(
    (w) => w.page === page && w.x0 >= xs0 - 40 && w.x1 <= xs1 + 40,
  );
  const cx0 = Math.max(0, Math.min(...col.map((w) => w.x0), xs0) - 8);
  const cx1 = Math.min(pageWidth, Math.max(...col.map((w) => w.x1), xs1) + 8);
  const cy0 = Math.max(0, Math.min(...sel.map((w) => w.y0)) - CONTEXT_PT);
  const cy1 = Math.min(
    pageHeight,
    Math.max(...sel.map((w) => w.y1)) + CONTEXT_PT,
  );
  const [x, y] = [Math.floor(cx0 * SCALE), Math.floor(cy0 * SCALE)];
  return { x, y, w: Math.ceil(cx1 * SCALE) - x, h: Math.ceil(cy1 * SCALE) - y };
}

/** What to draw: the PDF, the passage's words on one page, and the part of that page to keep. */
interface Drawing {
  readonly pdf: string;
  readonly sel: Match;
  readonly crop: Rect;
}

/** The page drawn at DPI, cropped, the passage's words filled yellow over the text: a PNG. */
async function draw(
  canvas: Canvas,
  { pdf, sel, crop }: Drawing,
): Promise<Buffer> {
  const { renderPageAsImage } = await import("unpdf");
  const png = await renderPageAsImage(
    new Uint8Array(readFileSync(pdf)),
    sel[0].page,
    {
      canvasImport: () => Promise.resolve(canvas),
      scale: SCALE,
    },
  );
  const img = await canvas.loadImage(Buffer.from(png));
  const out = canvas.createCanvas(crop.w, crop.h);
  const ctx = out.getContext("2d");
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.fillStyle = HIGHLIGHT;
  sel.forEach((s) => {
    ctx.fillRect(
      (s.x0 - 0.5) * SCALE - crop.x,
      (s.y0 - 0.5) * SCALE - crop.y,
      (s.x1 - s.x0 + 1) * SCALE,
      (s.y1 - s.y0 + 1) * SCALE,
    );
  });
  return out.encode("png");
}

/** The arguments of a run. */
interface Args {
  readonly pdf: string;
  readonly out: string;
  readonly passage: string;
  readonly page: number | null;
}

/** The arguments, or null for a wrong call. */
function parse(argv: readonly string[]): Args | null {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { page: { type: "string" } },
    });
    const [pdf, out, passage, ...rest] = positionals;
    const page = values.page === undefined ? null : Number(values.page);
    const pageOk = page === null || (Number.isInteger(page) && page > 0);
    return pdf && out && passage !== undefined && rest.length === 0 && pageOk
      ? { pdf, out, passage, page }
      : null;
  } catch {
    return null;
  }
}

/** The one match to crop, or the refusal and its exit code. */
type Pick =
  | {
      readonly kind: "one";
      readonly match: Match;
      readonly pages: readonly number[];
    }
  | {
      readonly kind: "refused";
      readonly code: 1 | 3;
      readonly message: string;
    };

const pageOf = (m: Match): number => m[0].page;

/** The match `--page` picks among `found`; without `--page`, the only page's first match. */
function pick(found: readonly Match[], a: Args): Pick {
  const pages = [...new Set(found.map(pageOf))].sort((p, q) => p - q);
  const listed = `[${pages.join(", ")}]`;
  const picked = found.filter((m) => a.page === null || pageOf(m) === a.page);
  const [match] = picked;
  if (found.length === 0)
    return {
      kind: "refused",
      code: 1,
      message: `NOT FOUND: ${a.passage.slice(0, 80)}`,
    };
  if (!match)
    return {
      kind: "refused",
      code: 1,
      message: `NOT ON PAGE ${String(a.page)}: found on pages ${listed}`,
    };
  if (new Set(picked.map(pageOf)).size > 1)
    return {
      kind: "refused",
      code: 3,
      message: `ON SEVERAL PAGES ${listed}: pass --page to pick one`,
    };
  return { kind: "one", match, pages };
}

/** The canvas module, or the line that says how to install it. */
async function canvasOr(load: () => Promise<Canvas>): Promise<Canvas | string> {
  const canvas = await load().catch(messageOf);
  return typeof canvas === "string"
    ? `crop_quote draws the crop with @napi-rs/canvas, which is not installed: npm install --save-dev @napi-rs/canvas (${canvas})`
    : canvas;
}

/** The whole run; the exit code is the return value. */
async function main(
  argv: readonly string[],
  load: () => Promise<Canvas>,
): Promise<number> {
  const a = parse(argv);
  if (!a) return fail(2, USAGE);
  const canvas = await canvasOr(load);
  if (typeof canvas === "string") return fail(2, canvas);
  const read = await readPdf(a.pdf);
  if (!read.ok) return fail(2, describeFailure(read, a.pdf));
  const ws = wordsOf(read.facts.layout, measurer(canvas));
  const got = pick(occurrences(ws, a.passage), a);
  if (got.kind === "refused") return fail(got.code, got.message);
  const [first, ...rest] = got.match;
  const sel: Match = [first, ...rest.filter((w) => w.page === first.page)];
  if (sel.length < got.match.length)
    process.stderr.write(
      `passage runs past page ${String(first.page)}: highlighted the part on it\n`,
    );
  writeFileSync(
    a.out,
    await draw(canvas, { pdf: a.pdf, sel, crop: cropOf(sel, ws) }),
  );
  const words = sel.map((w) => w.text).join(" ");
  process.stdout.write(
    `${JSON.stringify({ page: first.page, pages: got.pages, words })}\n`,
  );
  return 0;
}

/** `message` on stderr, and `code`. */
function fail(code: number, message: string): number {
  process.stderr.write(`${message}\n`);
  return code;
}

if (isMain(import.meta.url))
  process.exitCode = await main(
    process.argv.slice(2),
    () => import("@napi-rs/canvas"),
  );
