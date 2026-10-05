/**
 * HOW MANY PAGES THE BODY TAKES, counted from what the PDF says rather than from how banal
 * classifies its pages. A venue that limits the body «excluding references and appendices» (AIDC)
 * cannot be judged on banal's body count: banal calls any page holding non-bibliography text body,
 * so an LLM Usage Statement or an appendix placed after the bibliography is counted as body, and a
 * correct paper fails (measured, `presets/aidc.jsonc`).
 *
 * ── WHERE THE BODY ENDS: AT THE REFERENCES, OR AT THE APPENDIX, WHICHEVER COMES FIRST ──────
 * «Excluding references and appendices» excludes an appendix wherever it sits, so the body ends at
 * the first of the two. Each is found by a structural signal first:
 *
 *   references  the page of the first bibliography entry, from the destination hyperref writes for
 *               every `\bibitem` (`cite.<key>`); then, on that page, the heading line: a line that
 *               reads «References» or «Bibliography» (any case, optionally numbered), the one
 *               CONFIRMED by a next line opening the first entry, `[1]`, else the last one there.
 *               Without hyperref: the first confirmed heading, else the first bare one — a table
 *               header or a subsection titled «References» reads the same, so it is a fallback.
 *   appendix    the page hyperref anchored the appendix on (an `appendix.<letter>` destination, or a
 *               bookmark titled «Appendix…»); then, on that page, the line reading «Appendix»,
 *               «Appendix A.», «APPENDIX» or «Appendices». Without hyperref the appendix is not
 *               looked for: a sentence can end on a line reading «Appendix A.», and nothing tells
 *               it from the heading.
 *
 * A structural signal whose page has no heading line, or a confirmed references heading on another
 * page than hyperref's first entry, is a disagreement, and it is said rather than resolved by
 * picking one.
 *
 * ── THE PAGE THE BODY ENDS ON ──────────────────────────────────────────────────────
 * Body text above the heading on that page makes it a body page: a body that runs half a page past
 * the limit is over the limit, and the count must flag it rather than let a desk reject through.
 * Only when the heading is the first text of its page does the body end on the page before. A line
 * with no letter (a page number) is not body text, and neither is a running header or footer — a
 * line that repeats, digits aside, on at least three pages and a third of them.
 */

/** What ends the body. */
export type BodyEndsAt = "references" | "appendix";

/** Where hyperref anchored the bibliography's first entry and the appendix: 1-based pages, or null. */
export interface Anchors {
  readonly bib: number | null;
  readonly appendix: number | null;
}

/** Where the body ends, that no page says, or that a structural signal and the text disagree. */
export type BodyEnd =
  | {
      readonly kind: "found";
      readonly by: BodyEndsAt;
      /** 1-based page holding the heading that ends the body. */
      readonly page: number;
      /** The body, as the venue counts it: the heading's page too, when body text stands above it. */
      readonly bodyPages: number;
    }
  | { readonly kind: "missing" }
  | {
      readonly kind: "disagree";
      readonly what: BodyEndsAt;
      /** The page of the first confirmed references heading, or null when the anchor's page has no heading. */
      readonly heading: number | null;
      /** The page hyperref anchored it on. */
      readonly anchor: number;
    };

/**
 * A line that is a references heading: `References` or `Bibliography`, in any case (IEEEtran sets
 * `REFERENCES` in small caps, which pdf.js may split as `R EFERENCES`), optionally numbered
 * (`7 References`, `VII. REFERENCES`). The line is compared with every space removed.
 */
const HEADING = /^(?:(?:\d+|[ivxlcdm]+)\.?)?(?:references|bibliography)$/iu;

/** Whether one line of a page's text is the references heading. */
export const isReferencesHeading = (line: string): boolean =>
  HEADING.test(line.normalize("NFKC").replace(/\s+/gu, ""));

/** A line that is an appendix heading: `Appendix A.`, `APPENDIX`, `Appendices`, spaces removed. */
const APPENDIX_HEADING = /^appendi(?:x|ces)(?:[a-z]|\d+)?[.:]?$/iu;

/** Whether one line of a page's text is an appendix heading. */
export const isAppendixHeading = (line: string): boolean =>
  APPENDIX_HEADING.test(line.normalize("NFKC").replace(/\s+/gu, ""));

/** Whether a line opens the first entry of a numbered bibliography: `[1]`. */
const isFirstEntry = (line: string): boolean => /^\s*\[\s*1\s*\]/u.test(line);

/** A page's lines, and where its headings are: the confirmed one, and every one. */
interface PageReading {
  readonly lines: readonly string[];
  /** Line index of a heading whose next non-empty line is `[1]`, or -1. */
  readonly confirmed: number;
  /** Line indices of every heading line. */
  readonly headings: readonly number[];
}

function readPage(text: string): PageReading {
  const lines = text.split("\n");
  const headings = lines.flatMap((l, i) => (isReferencesHeading(l) ? [i] : []));
  const confirmed =
    headings.find((i) =>
      isFirstEntry(lines.slice(i + 1).find((l) => l.trim() !== "") ?? ""),
    ) ?? -1;
  return { lines, confirmed, headings };
}

/** A line with digits blanked and spaces collapsed: what a running header keeps from page to page. */
const shape = (line: string): string =>
  line.replace(/\d+/gu, "#").replace(/\s+/gu, " ").trim();

/** The shapes of the lines that repeat on at least three pages and a third of them. */
function runningLines(pages: readonly PageReading[]): ReadonlySet<string> {
  const onPages = pages.flatMap((p) => [...new Set(p.lines.map(shape))]);
  const sorted = onPages.toSorted();
  const floor = Math.max(3, pages.length / 3);
  // In sorted order, a shape on `floor` pages is the same string `floor - 1` places further on.
  return new Set(
    sorted.filter((s, i) => sorted[i + Math.ceil(floor) - 1] === s),
  );
}

/** The heading line the references start at on a page: the confirmed one, else the last one. */
const startLine = (p: PageReading): number =>
  p.confirmed >= 0 ? p.confirmed : (p.headings.at(-1) ?? -1);

/** A heading that ends the body: its 0-based page and its line there. */
interface At {
  readonly kind: "at";
  readonly by: BodyEndsAt;
  readonly page: number;
  readonly line: number;
  /** The lines of that page above the heading. */
  readonly above: readonly string[];
}
type Start = At | Extract<BodyEnd, { readonly kind: "disagree" | "missing" }>;

/** The references heading at line `line` of 0-based page `page`. */
const at = (page: number, p: PageReading, line: number): At => ({
  kind: "at",
  by: "references",
  page,
  line,
  above: p.lines.slice(0, line),
});

/** Where the references start: at hyperref's first entry's page, else at the heading in the text. */
function referencesAt(
  pages: readonly PageReading[],
  anchor: number | null,
): Start {
  const confirmed = pages.findIndex((p) => p.confirmed >= 0);
  if (anchor !== null) {
    const p = pages[anchor - 1];
    const line = p === undefined ? -1 : startLine(p);
    if (p === undefined || line < 0)
      return { kind: "disagree", what: "references", heading: null, anchor };
    if (confirmed >= 0 && confirmed !== anchor - 1)
      return {
        kind: "disagree",
        what: "references",
        heading: confirmed + 1,
        anchor,
      };
    return at(anchor - 1, p, line);
  }
  const i =
    confirmed >= 0 ? confirmed : pages.findIndex((p) => p.headings.length > 0);
  const p = pages[i];
  return p === undefined ? { kind: "missing" } : at(i, p, startLine(p));
}

/** Where the appendix starts: on hyperref's page for it, at the line reading «Appendix». */
function appendixAt(
  pages: readonly PageReading[],
  anchor: number | null,
): Start {
  if (anchor === null) return { kind: "missing" };
  const lines = pages[anchor - 1]?.lines ?? [];
  const line = lines.findIndex(isAppendixHeading);
  return line < 0
    ? { kind: "disagree", what: "appendix", heading: null, anchor }
    : {
        kind: "at",
        by: "appendix",
        page: anchor - 1,
        line,
        above: lines.slice(0, line),
      };
}

/** A body end that was found. */
type Found = Extract<BodyEnd, { readonly kind: "found" }>;

/** The body's end at a heading: the heading's page counts when body text stands above it. */
function endAt(pages: readonly PageReading[], at: At): Found {
  const running = runningLines(pages);
  const body = at.above.some((l) => /\p{L}/u.test(l) && !running.has(shape(l)));
  return {
    kind: "found",
    by: at.by,
    page: at.page + 1,
    bodyPages: body ? at.page + 1 : at.page,
  };
}

/**
 * Where the body ends — at the references or the appendix, whichever comes first — from each
 * page's text and where hyperref anchored the two. Pure.
 */
export function bodyEnd(
  texts: readonly string[],
  anchors: Anchors = { bib: null, appendix: null },
): BodyEnd {
  const pages = texts.map(readPage);
  const starts = [
    referencesAt(pages, anchors.bib),
    appendixAt(pages, anchors.appendix),
  ];
  const disagree = starts.find(
    (s): s is Extract<BodyEnd, { readonly kind: "disagree" }> =>
      s.kind === "disagree",
  );
  if (disagree !== undefined) return disagree;
  const first = starts
    .filter((s): s is At => s.kind === "at")
    .toSorted((a, b) => a.page - b.page || a.line - b.line)[0];
  return first === undefined ? { kind: "missing" } : endAt(pages, first);
}

/**
 * The pages of a paper split as a venue counts them when its body limit includes the appendices
 * and only the pages holding nothing but references are reference pages (MSR: «10 pages for the
 * main text, inclusive of all figures, tables, appendices, etc. Two more pages containing only
 * references are permitted.»):
 *
 *   body        the pages up to the references — their page too when body text stands above the
 *               heading — and, when the appendix starts after the references, every page from the
 *               appendix's to the last, which holds appendix text
 *   references  the pages between, which hold only references
 *
 * An appendix before the references is body like any other text, and ends nothing. The appendix is
 * found by hyperref's anchor only (`appendixAt`): without hyperref, an appendix after the references
 * is not told from them and is counted with them. Pure.
 */
export type PageSplit =
  | {
      readonly kind: "found";
      /** 1-based page holding the references heading. */
      readonly page: number;
      readonly bodyPages: number;
      readonly refPages: number;
      /** 1-based page the appendix starts on, when it follows the references; else null. */
      readonly appendixFrom: number | null;
    }
  | { readonly kind: "missing" }
  | Extract<BodyEnd, { readonly kind: "disagree" }>;

/** Whether heading `a` stands after heading `b` in the document. */
const after = (a: At, b: At): boolean =>
  a.page > b.page || (a.page === b.page && a.line > b.line);

export function pageSplit(
  texts: readonly string[],
  anchors: Anchors = { bib: null, appendix: null },
): PageSplit {
  const pages = texts.map(readPage);
  const refs = referencesAt(pages, anchors.bib);
  const appendix = appendixAt(pages, anchors.appendix);
  if (refs.kind === "disagree") return refs;
  if (appendix.kind === "disagree") return appendix;
  if (refs.kind === "missing") return { kind: "missing" };
  const upTo = endAt(pages, refs).bodyPages;
  const tail =
    appendix.kind === "at" && after(appendix, refs) ? appendix.page : null;
  // The pages from the appendix to the end, less the ones already counted up to the references.
  const appendixPages = tail === null ? 0 : pages.length - Math.max(tail, upTo);
  const bodyPages = upTo + appendixPages;
  return {
    kind: "found",
    page: refs.page + 1,
    bodyPages,
    refPages: pages.length - bodyPages,
    appendixFrom: tail === null ? null : tail + 1,
  };
}
