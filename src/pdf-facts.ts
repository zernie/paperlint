/**
 * READ A FINISHED PDF with pdf.js — the shell around `pdf-geometry.ts` and `core/banal/xml.ts`. Page
 * count, the fonts the pages draw text with, the last page's words, and every page's text boxes
 * (the input banal measures page geometry from, written as pdftohtml XML by `core/banal/xml.ts`).
 *
 * pdf.js arrives as the npm package `unpdf` (a zero-dependency build of Mozilla's pdf.js), so
 * reading a PDF needs nothing installed on the system. It replaced three poppler programs
 * (`pdfinfo`, `pdffonts`, `pdftotext -bbox`), which every consumer had to install by hand; the
 * equivalence was measured before the switch (issue #61, see `pdf-geometry.ts`).
 *
 * ── THE RESULT IS A UNION, AND A FAILED READ CANNOT LOOK LIKE A CLEAN ONE ─────
 * `readPdf` never throws for a property of the file: an unreadable or encrypted PDF, and a PDF whose
 * pages draw text while pdf.js resolves no font for it, come back as `ok: false` with a reason. The
 * last case is the one that matters: on Node 20 pdf.js returns zero fonts and no error, and an empty
 * font list reads as "no Type 3, nothing unembedded" — a clean verdict over nothing.
 *
 * ── LAZY ────────────────────────────────────────────────────────────────────────
 * `unpdf` is imported on the first read, not when this module loads: `rpp lint` imports the build
 * and must not pay pdf.js's start-up for a command that never opens a PDF.
 */
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { readFileSync } from "node:fs";
import {
  DEFAULT_ASCENT,
  DEFAULT_DESCENT,
  fontsOf,
  wordsOf,
  type Fonts,
  type PageText,
  type RawFont,
  type RawPage,
  type TextRun,
} from "./pdf-geometry.ts";
import {
  fillsOf,
  isUpright,
  type PageLayout,
  type TextBox,
} from "./core/banal/xml.ts";

type PdfJs = Awaited<ReturnType<typeof import("unpdf").getResolvedPDFJS>>;
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type Page = Awaited<ReturnType<Doc["getPage"]>>;
type Item = Awaited<ReturnType<Page["getTextContent"]>>["items"][number];
type TextItem = Extract<Item, { str: string }>;

/**
 * What `readPdf` measured. `last` is the last page's words; `classifyLastPage` reads it. `layout` is
 * every page's text boxes, for banal (`core/banal/xml.ts` writes them as the XML banal reads).
 */
export interface PdfFacts {
  readonly pages: number;
  readonly fonts: Fonts;
  readonly last: PageText;
  readonly layout: readonly PageLayout[];
}

export type PdfReadFailure =
  "unreadable" | "encrypted" | "zero-fonts-on-text" | "empty";

export type PdfRead =
  | { readonly ok: true; readonly facts: PdfFacts }
  | {
      readonly ok: false;
      readonly reason: PdfReadFailure;
      readonly detail: string;
    };

/** The port `rpp build` and the facts writer take, so a test can hand them any outcome. */
export type PdfReader = (path: string) => Promise<PdfRead>;

/**
 * The options every read uses, exactly as measured in the spike. `fontExtraProperties` is
 * load-bearing: without it pdf.js exports no `type`/`subtype`, and every font's program is unknown.
 * `disableFontFace` keeps pdf.js from trying to install fonts into a page that does not exist here.
 */
export const PDFJS_OPTIONS = {
  disableFontFace: true,
  fontExtraProperties: true,
  verbosity: 0,
  useSystemFonts: false,
  isEvalSupported: false,
} as const;

let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  // eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
  pdfjs ??= import("unpdf").then((m) => m.getResolvedPDFJS());
  return pdfjs;
}

const fail = (reason: PdfReadFailure, detail: string): PdfRead => ({
  ok: false,
  reason,
  detail,
});

/** A font object pdf.js left in `commonObjs`, read into a `RawFont`, or null when it is not one. */
export function rawFontOf(id: string, obj: unknown): RawFont | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (!("loadedName" in o) && !("isType3Font" in o)) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  return {
    id,
    name: str(o["name"]) ?? "",
    type: str(o["type"]),
    subtype: str(o["subtype"]),
    isType3Font: o["isType3Font"] === true,
    missingFile: o["missingFile"] === true,
  };
}

const isText = (it: Item): it is TextItem =>
  "str" in it && it.str.trim() !== "";

/** The font pdf.js resolved for `id`, if it did. `get` throws on an unresolved id; `has` does not. */
function resolved(page: Page, id: string): unknown {
  return page.commonObjs.has(id) ? page.commonObjs.get(id) : null;
}

/**
 * The fonts pdf.js has loaded for the document so far, by id. `commonObjs` is shared by every page
 * and holds fonts alongside other objects; `rawFontOf` keeps only the fonts.
 */
function loadedFonts(page: Page): Map<string, RawFont> {
  const out = new Map<string, RawFont>();
  for (const [id, obj] of page.commonObjs as Iterable<[string, unknown]>) {
    const f = rawFontOf(id, obj);
    if (f) out.set(id, f);
  }
  return out;
}

/**
 * One page: its text items, and the fonts it drew with — the fonts its text items name, plus every
 * font first loaded while its operator list ran. The second half is not redundant: pdf.js can
 * render a run in a font that no text item names (measured on an all-Type-3 page: four fonts
 * loaded, two named by items; poppler lists four). A page that reuses an earlier page's fonts loads
 * none, and its items name them.
 */
async function readPage(
  page: Page,
  seen: ReadonlySet<string>,
  lib: PdfJs,
): Promise<{ raw: RawPage; items: TextItem[]; layout: PageLayout }> {
  // The operator list is what makes pdf.js load a page's fonts into `commonObjs`.
  const ops = await page.getOperatorList();
  const items = (await page.getTextContent()).items.filter(isText);
  const loaded = loadedFonts(page);
  const named = new Set(items.map((it) => it.fontName));
  const fonts = [...loaded.values()].filter(
    (f) => named.has(f.id) || !seen.has(f.id),
  );
  return {
    raw: { hasText: items.length > 0, fonts },
    items,
    layout: layoutOf(page, items, ops, lib),
  };
}

/**
 * A font's ascent and descent as fractions of its size, or the defaults when pdf.js has none.
 *
 * ⚠️ Type 3 fonts get the defaults: pdf.js exports no ascent for them. The obvious substitute,
 * FontBBox scaled by FontMatrix (what poppler uses), was measured on `fixtures/pdf-facts/t3-all.pdf`
 * and came out FURTHER from poppler than the defaults: 8.5 pt off on the left column against 7.2.
 * Both are far below any balance tolerance, so the simpler rule stays.
 */
function metricsOf(font: unknown): { ascent: number; descent: number } {
  const f = (font ?? {}) as Record<string, unknown>;
  const ascent = f["ascent"];
  if (typeof ascent !== "number" || !(ascent > 0))
    return { ascent: DEFAULT_ASCENT, descent: DEFAULT_DESCENT };
  const d = f["descent"];
  return { ascent, descent: typeof d === "number" ? d : DEFAULT_DESCENT };
}

/** The last page's text runs in top-down coordinates, and its size. */
function pageText(page: Page, items: readonly TextItem[]): PageText {
  const vp = page.getViewport({ scale: 1 });
  const runs: TextRun[] = items.map((it) => {
    const [a = 0, b = 0, , d = 0, e = 0, f = 0] = it.transform as number[];
    const [x, baseline] = vp.convertToViewportPoint(e, f) as [number, number];
    const size = Math.hypot(a, b) || it.height || Math.abs(d);
    return {
      text: it.str,
      x,
      baseline,
      width: it.width,
      size,
      ...metricsOf(resolved(page, it.fontName)),
    };
  });
  return {
    widthPt: vp.width,
    heightPt: vp.height,
    words: runs.flatMap(wordsOf),
  };
}

/** The font name pdf.js resolved for an item, else its internal id. */
function fontNameOf(font: unknown, id: string): string {
  const name = (font as { name?: unknown } | null)?.name;
  return typeof name === "string" && name ? name : id;
}

/**
 * One text item as a box, in points, top-down. The size is the item's vertical scale, which is what
 * pdftohtml reports as the font size; upright is judged in VIEWER space (the page's /Rotate applied),
 * because that is where pdftohtml draws.
 */
function boxOf(
  page: Page,
  vp: ReturnType<Page["getViewport"]>,
  it: TextItem,
  lib: PdfJs,
): Omit<TextBox, "fill"> {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = it.transform as number[];
  const [x, baseline] = vp.convertToViewportPoint(e, f) as [number, number];
  const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height;
  const font = resolved(page, it.fontName);
  const m = metricsOf(font);
  return {
    top: baseline - m.ascent * size,
    left: x,
    width: it.width,
    height: (m.ascent - m.descent) * size,
    size,
    font: fontNameOf(font, it.fontName),
    text: it.str,
    upright: isUpright(
      lib.Util.transform(vp.transform, it.transform) as number[],
    ),
  };
}

/** Every text item of a page as a box with its fill — the input of `pdf2xml`. */
function layoutOf(
  page: Page,
  items: readonly TextItem[],
  ops: Awaited<ReturnType<Page["getOperatorList"]>>,
  lib: PdfJs,
): PageLayout {
  const vp = page.getViewport({ scale: 1 });
  const fills = fillsOf(
    lib.OPS,
    ops,
    items.map((it) => it.str),
  );
  const boxes = items.map((it, k): TextBox => ({
    ...boxOf(page, vp, it, lib),
    fill: fills[k] ?? { kind: "unknown" },
  }));
  return { widthPt: vp.width, heightPt: vp.height, boxes };
}

/** Every page's fonts, and the last page's words. */
async function factsOf(doc: Doc, lib: PdfJs): Promise<PdfRead> {
  const read: {
    page: Page;
    raw: RawPage;
    items: TextItem[];
    layout: PageLayout;
  }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const r = await readPage(page, seen, lib);
    for (const f of r.raw.fonts) seen.add(f.id);
    read.push({ page, ...r });
  }
  const [last] = read.slice(-1);
  if (!last) return fail("empty", "the PDF has no pages");
  const fonts = fontsOf(read.map((r) => r.raw));
  if (fonts.kind === "zero-fonts-on-text")
    return fail(
      "zero-fonts-on-text",
      `page(s) ${fonts.pages.join(", ")} draw text, but pdf.js resolved no font for it ` +
        // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
        `(Node ${process.version}; rpp needs Node >= 22.13, where pdf.js reports fonts)`,
    );
  return {
    ok: true,
    facts: {
      pages: doc.numPages,
      fonts,
      last: pageText(last.page, last.items),
      layout: read.map((r) => r.layout),
    },
  };
}

/** pdf.js's own exception names for the two conditions a caller can act on. */
function failureOf(e: unknown): PdfRead {
  const err = e as { name?: string; message?: string };
  const detail = `${err.name ?? "Error"}: ${err.message ?? String(e)}`;
  return fail(
    err.name === "PasswordException" ? "encrypted" : "unreadable",
    detail,
  );
}

/** Read a PDF from disk. Never throws for a property of the file; see the module header. */
export const readPdf: PdfReader = async (path) => {
  let data: Uint8Array;
  try {
    data = new Uint8Array(readFileSync(path));
  } catch (e) {
    return fail("unreadable", (e as Error).message);
  }
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data, ...PDFJS_OPTIONS });
  try {
    return await factsOf(await task.promise, lib);
  } catch (e) {
    return failureOf(e);
  } finally {
    await task.destroy();
  }
};

/** The one wording of a failed read, as a build step or a CLI prints it. */
export function describeFailure(
  r: Extract<PdfRead, { ok: false }>,
  pdf: string,
): string {
  return `could not read ${pdf} with pdf.js (${r.reason}): ${r.detail}`;
}
