/**
 * READ A FINISHED PDF with pdf.js — the shell around `pdf-geometry.ts` and `adapters/banal/xml.ts`. Page
 * count, the fonts the pages draw text with, the last page's words, and every page's text boxes
 * (the input banal measures page geometry from, written as pdftohtml XML by `adapters/banal/xml.ts`).
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
 * `unpdf` is imported on the first read, not when this module loads: `paperlint lint` imports the build
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
import type { PageLayout, TextBox } from "./domain/page-layout.ts";
// eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
import { fillsFor, isUpright } from "./adapters/pdfjs/fill.ts";
import {
  appendixOutlineDests,
  linkTargetsOf,
  metadataOf,
  namedRefs,
  pageTextOf,
  refOf,
  xmpOf,
} from "./pdf-content.ts";
import { messageOf } from "./domain/text.ts";
import { fieldOf, isRecord, numbersOf } from "./domain/record.ts";

type PdfJs = Awaited<ReturnType<typeof import("unpdf").getResolvedPDFJS>>;

/** A text item as this module reads it; pdf.js's `TextItem` is one. */
interface TextItem {
  readonly str: string;
  readonly fontName: string;
  /** pdf.js types it `any[]`; `numbersOf` reads it. */
  readonly transform: readonly unknown[];
  readonly width: number;
  readonly height: number;
}
/** What else pdf.js lists among a page's items: a marked-content boundary, with no text. */
interface MarkedContent {
  readonly type: string;
  readonly str?: undefined;
}
type Item = TextItem | MarkedContent;

/** A page's operators, as `fillsFor` walks them; pdf.js's operator list is one. */
interface OperatorList {
  readonly fnArray: readonly number[];
  readonly argsArray: readonly unknown[];
}

/** A viewport as this module reads it; pdf.js's `PageViewport` is one. */
interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly transform: readonly number[];
  convertToViewportPoint(x: number, y: number): readonly unknown[];
}

/**
 * A page as this module reads it. pdf.js's `PDFPageProxy` is one, and so is a test's fake page: the
 * module depends on these five members, not on the rest of pdf.js's page.
 */
interface Page {
  getOperatorList(): Promise<OperatorList>;
  getTextContent(): Promise<{ readonly items: readonly Item[] }>;
  /** pdf.js's `commonObjs`: loaded objects by id, iterable as `[id, object]` pairs. */
  readonly commonObjs: {
    has(id: string): boolean;
    get(id: string): unknown;
    [Symbol.iterator](): Iterator<readonly unknown[]>;
  };
  getViewport(params: { scale: number }): Viewport;
  /** pdf.js's annotations; the link ones carry `url`. */
  getAnnotations(): Promise<readonly unknown[]>;
}

/** A document as this module reads it; pdf.js's `PDFDocumentProxy` is one. */
interface Doc {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<Page>;
  /** The Info dictionary, and the XMP packet when there is one. */
  getMetadata(): Promise<{
    readonly info: unknown;
    readonly metadata: Iterable<unknown> | null;
  }>;
  /** Every named destination: name → explicit destination. */
  getDestinations(): Promise<unknown>;
  /** The 0-based index of the page a destination's reference names. */
  getPageIndex(ref: object): Promise<number>;
  /** One named destination, or null. */
  getDestination(id: string): Promise<unknown>;
  /** The bookmarks: `{ title, dest, items }`, or null. */
  getOutline(): Promise<unknown>;
}

/** A viewport point, which pdf.js types as `any[]`: the two numbers it holds. */
const pointOf = (xy: readonly unknown[]): [number, number] => [
  Number(xy[0]),
  Number(xy[1]),
];

/**
 * What `readPdf` measured. `last` is the last page's words; `classifyLastPage` reads it. `layout` is
 * every page's text boxes, for banal (`adapters/banal/xml.ts` writes them as the XML banal reads).
 */
export interface PdfFacts {
  readonly pages: number;
  readonly fonts: Fonts;
  readonly last: PageText;
  readonly layout: readonly PageLayout[];
  /** Each page's text, in content order, a line break after each line (`pageTextOf`). */
  readonly pageTexts: readonly string[];
  /** The target of every link, with its 1-based page. */
  readonly links: readonly PdfLink[];
  /** The 1-based page of the first bibliography entry hyperref anchored, or null without one. */
  readonly bibAnchorPage: number | null;
  /** The 1-based page the appendix starts on, from hyperref's destinations and bookmarks, or null. */
  readonly appendixAnchorPage: number | null;
  /** The Info dictionary and XMP packet, flat (`metadataOf`). */
  readonly metadata: Readonly<Record<string, string>>;
}

/** A link annotation's target, and the page it is on. */
export interface PdfLink {
  readonly page: number;
  readonly uri: string;
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

/** The port `paperlint build` and the facts writer take, so a test can hand them any outcome. */
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
  if (!isRecord(obj)) return null;
  const o = obj;
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
  typeof it.str === "string" && it.str.trim() !== "";

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
  // pdf.js yields `[id, object]` pairs, typed `any[]`.
  for (const entry of page.commonObjs) {
    const f = rawFontOf(String(entry[0]), entry[1]);
    if (f) out.set(f.id, f);
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
): Promise<{
  raw: RawPage;
  items: TextItem[];
  layout: PageLayout;
  text: string;
  links: readonly string[];
}> {
  // The operator list is what makes pdf.js load a page's fonts into `commonObjs`.
  const ops = await page.getOperatorList();
  const all = (await page.getTextContent()).items;
  const items = all.filter(isText);
  const loaded = loadedFonts(page);
  const named = new Set(items.map((it) => it.fontName));
  const fonts = [...loaded.values()].filter(
    (f) => named.has(f.id) || !seen.has(f.id),
  );
  return {
    raw: { hasText: items.length > 0, fonts },
    items,
    layout: layoutOf(page, items, ops, lib),
    text: pageTextOf(all),
    links: linkTargetsOf(await page.getAnnotations()),
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
  const f = isRecord(font) ? font : {};
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
    const [a = 0, b = 0, , d = 0, e = 0, f = 0] = numbersOf(it.transform);
    const [x, baseline] = pointOf(vp.convertToViewportPoint(e, f));
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
  const name = fieldOf(font, "name");
  return typeof name === "string" && name ? name : id;
}

/**
 * One text item as a box, in points, top-down. The size is the item's vertical scale, which is what
 * pdftohtml reports as the font size; upright is judged in VIEWER space (the page's /Rotate applied),
 * because that is where pdftohtml draws.
 */
function boxOf(
  page: Page,
  vp: Viewport,
  it: TextItem,
  lib: PdfJs,
): Omit<TextBox, "fill"> {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = numbersOf(it.transform);
  const [x, baseline] = pointOf(vp.convertToViewportPoint(e, f));
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
      numbersOf(lib.Util.transform(vp.transform, it.transform)),
    ),
  };
}

/** Every text item of a page as a box with its fill — the input of `pdf2xml`. */
function layoutOf(
  page: Page,
  items: readonly TextItem[],
  ops: OperatorList,
  lib: PdfJs,
): PageLayout {
  const vp = page.getViewport({ scale: 1 });
  const boxes = fillsFor(lib.OPS, ops, items, (it) => it.str).map(
    ({ item, fill }): TextBox => ({ ...boxOf(page, vp, item, lib), fill }),
  );
  return { widthPt: vp.width, heightPt: vp.height, boxes };
}

/**
 * Every page's fonts, and the last page's words. Exported with `failureOf` so a test can hand it a
 * document whose objects pdf.js shapes only in rare files (a font without metrics, a zero-scale
 * transform, no pages) — `readPdf` below is the one production caller.
 */
export async function factsOf(doc: Doc, lib: PdfJs): Promise<PdfRead> {
  const read: (Awaited<ReturnType<typeof readPage>> & { page: Page })[] = [];
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
        `(Node ${process.version}; paperlint needs Node >= 22.13, where pdf.js reports fonts)`,
    );
  return {
    ok: true,
    facts: {
      pages: doc.numPages,
      fonts,
      last: pageText(last.page, last.items),
      layout: read.map((r) => r.layout),
      ...saidOf(read, await doc.getMetadata()),
      ...(await anchorsOf(doc)),
    },
  };
}

/**
 * Where hyperref anchored the bibliography's first entry (the lowest page of a `cite.<key>`
 * destination) and the appendix (the lowest page of an `appendix.<letter>` destination or of a
 * bookmark titled «Appendix…»). A reference pdf.js cannot place is skipped.
 */
async function anchorsOf(
  doc: Doc,
): Promise<Pick<PdfFacts, "bibAnchorPage" | "appendixAnchorPage">> {
  const destinations = await doc.getDestinations();
  const bookmarked = await Promise.all(
    appendixOutlineDests(await doc.getOutline()).map(async (d) =>
      refOf(typeof d === "string" ? await doc.getDestination(d) : d),
    ),
  );
  return {
    bibAnchorPage: await lowestPage(doc, namedRefs(destinations, "cite.")),
    appendixAnchorPage: await lowestPage(doc, [
      ...namedRefs(destinations, "appendix."),
      ...bookmarked.filter((r): r is object => r !== null),
    ]),
  };
}

/** The lowest 1-based page any of `refs` names, or null when none can be placed. */
async function lowestPage(
  doc: Doc,
  refs: readonly object[],
): Promise<number | null> {
  const pages = await Promise.all(
    refs.map((r) =>
      doc.getPageIndex(r).then(
        (i) => [i + 1],
        () => [],
      ),
    ),
  );
  const found = pages.flat();
  return found.length === 0 ? null : Math.min(...found);
}

/** What the pages say, from each page's read, and the document's metadata. */
function saidOf(
  read: readonly Pick<Awaited<ReturnType<typeof readPage>>, "text" | "links">[],
  meta: Awaited<ReturnType<Doc["getMetadata"]>>,
): Pick<PdfFacts, "pageTexts" | "links" | "metadata"> {
  return {
    pageTexts: read.map((r) => r.text),
    links: read.flatMap((r, i) => r.links.map((uri) => ({ page: i + 1, uri }))),
    metadata: metadataOf(meta.info, xmpOf(meta.metadata)),
  };
}

/** pdf.js's own exception names for the two conditions a caller can act on. */
export function failureOf(e: unknown): PdfRead {
  const name = fieldOf(e, "name");
  const message = fieldOf(e, "message");
  const detail = `${typeof name === "string" ? name : "Error"}: ${typeof message === "string" ? message : String(e)}`;
  return fail(
    name === "PasswordException" ? "encrypted" : "unreadable",
    detail,
  );
}

/** Read a PDF from disk. Never throws for a property of the file; see the module header. */
export const readPdf: PdfReader = async (path) => {
  let data: Uint8Array;
  try {
    data = new Uint8Array(readFileSync(path));
  } catch (e) {
    return fail("unreadable", messageOf(e));
  }
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data, ...PDFJS_OPTIONS });
  // A promise chain rather than try/catch/finally: every path returns a value here, and the code
  // after such a statement is a block that can never run — which coverage reports as unrun.
  const read = await task.promise
    .then((doc) => factsOf(doc, lib))
    .catch(failureOf);
  await task.destroy();
  return read;
};

/** The one wording of a failed read, as a build step or a CLI prints it. */
export function describeFailure(
  r: Extract<PdfRead, { ok: false }>,
  pdf: string,
): string {
  return `could not read ${pdf} with pdf.js (${r.reason}): ${r.detail}`;
}
