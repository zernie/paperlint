/**
 * THE ONE WRITER of `<paper>/_build/paper.facts.json` — what a finished PDF measures, as data a lint
 * rule can judge. It judges nothing itself.
 *
 * Two callers, one function: `paperlint build` writes the facts right after a successful compile, and
 * `skills/render-paper/extract-pdf-facts.mjs` is a thin command-line shim over the same
 * `measurePaper` + `writeFactsFile` for PDFs paperlint did not build and for CI steps that name that script by path. Two
 * writers would drift — one would learn a field the other does not — and the rules reading the file
 * cannot tell which wrote it.
 *
 * ── WHERE THE FACTS COME FROM ──────────────────────────────────────────────────
 * - pdf.js (`pdf-facts.ts`) — page count, the fonts the pages draw text with, the last page. Always.
 * - a page-geometry measurer, through the `MeasureGeometry` port (`ports/measure-geometry.ts`) —
 *   today banal (Eddie Kohler's page-geometry tool, the one HotCRP's format checker runs) — paper size,
 *   columns, body and reference font sizes, page types. It runs on pdftohtml-style XML that paperlint
 *   writes from the same pdf.js read (`adapters/banal/xml.ts`), so poppler is not needed (`adapters/banal/`).
 *   OPTIONAL: banal is GPL and paperlint does not ship it — `paperlint toolchain` fetches it. Found ⇒ its fields
 *   are filled and `geometry_source` says `banal`; not found ⇒ they are null and `geometry_source`
 *   is null, so a rule can tell "not measured" from "measured as zero". Whether that is a failure is
 *   the caller's policy: `extract-pdf-facts.mjs --strict` refuses to write such facts.
 *
 * ── SCHEMA 2 (2026-09-24) ───────────────────────────────────────────────────────
 * Every schema-1 field keeps its name. The number changed because three meanings did, and a
 * consumer that pins the schema must hear about it rather than read new meanings under the old
 * number: fonts are the ones pages DRAW (pdf.js), not every font in a resource dictionary; Type 3
 * fonts are all named `Type3`; `embedded` means a usable program is present, so a corrupted one is
 * false. `pdf` is now relative to the PAPER directory, not to wherever the command ran.
 *
 * 🔴 STALENESS. The PDF is not committed, so neither are these facts: they live in `_build/` and
 * carry `pdf_sha256`. A rule compares it with the PDF on disk and refuses facts about another build.
 */
import { join, relative, sep } from "node:path";
import {
  classifyLastPage,
  popplerType,
  type FontFact,
  type LastPage,
} from "./pdf-geometry.ts";
import { describeFailure, type PdfFacts, type PdfReader } from "./pdf-facts.ts";
import {
  flatGeometry,
  type FactsGeometryFields,
  type FlatGeometry,
  type Geometry,
} from "./domain/geometry.ts";
import { parseSha256, sha256Hex, type Sha256 } from "./domain/sha256.ts";
import type { MeasureGeometry } from "./ports/measure-geometry.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { Files } from "./ports/files.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { paperPreset, paperPresetProblem } from "./presets.ts";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";

export const FACTS_SCHEMA = 2;
export const FACTS_DIR = "_build";
export const FACTS_FILE = "paper.facts.json";

/** Where a paper's facts live. */
export const factsPath = (paperDir: string): string =>
  join(paperDir, FACTS_DIR, FACTS_FILE);

/**
 * A path as the caller gave it. The `Files` adapter resolves a relative one against the process's
 * cwd, which is what these callers have always meant; the brand is not a claim this code checked it.
 */
const at = (p: string): AbsolutePath => p as AbsolutePath;

/** What the facts need from a paper's `paperlint.json`: its venue's label, its kind, where its PDF is. */
export interface VenueDecl {
  /** The venue preset's display label (`agenticdev`), or null when the paper extends none. */
  readonly label: string | null;
  readonly kind: string | null;
  readonly pdf: string | null;
}

/**
 * What a paper's `paperlint.json` declares, or null when it has none. THROWS with a one-line reason
 * when the file does not parse or its `extends` does not resolve: the build reports that as its
 * `facts` failure rather than building against no venue.
 */
export function declaredVenue(
  files: Files,
  paperDir: string,
  venuesDir: string = packageVenuesDir(),
): VenueDecl | null {
  const p = paperPreset(paperDir, { files, venuesDir });
  const problem = paperPresetProblem(paperDir, p);
  if (problem !== null) throw new Error(problem);
  if (p.kind === "resolved")
    return {
      label: p.preset.label,
      kind: p.settings.kind,
      pdf: p.settings.pdf,
    };
  return p.kind === "none" && p.settings
    ? { label: null, kind: p.settings.kind, pdf: p.settings.pdf }
    : null;
}

// ── the document ────────────────────────────────────────────────────────────────────────

/** One font as the facts file spells it. `type` keeps poppler's spelling (`Type 3`). */
export interface FontEntry {
  readonly name: string;
  readonly type: string;
  readonly embedded: boolean;
  readonly program: string;
}

export type LastPageEntry =
  | {
      readonly kind: "measured";
      readonly columns_pt: readonly [number, number];
    }
  | { readonly kind: "stub"; readonly words: number }
  | { readonly kind: "review"; readonly line_numbers: number };

/** The facts file's content. */
export type FactsDocument = {
  readonly schema: typeof FACTS_SCHEMA;
  readonly pdf: string;
  readonly pdf_sha256: string;
  readonly venue: string | null;
  readonly kind: string | null;
  readonly npages: number;
  readonly fonts_source: "pdfjs-drawn";
  readonly fonts: readonly FontEntry[];
  readonly last_page: LastPageEntry;
  /** Schema 1's field, kept: the two heights, or null when the last page is a stub or a review build. */
  readonly last_page_cols_pt: readonly [number, number] | null;
} & FactsGeometryFields;

export function fontEntry(f: FontFact): FontEntry {
  return {
    name: f.name,
    type: popplerType(f),
    // A Type 3 font's glyphs are procedures inside the PDF: nothing is substituted, so it IS
    // embedded (poppler says so too). Its defect is being Type 3, which `type` already names.
    embedded: f.kind !== "not-embedded",
    program: f.kind === "type3" ? "Type3" : f.program,
  };
}

export function lastPageEntry(p: LastPage): LastPageEntry {
  if (p.kind === "measured")
    return { kind: "measured", columns_pt: [p.columns[0], p.columns[1]] };
  if (p.kind === "review")
    return { kind: "review", line_numbers: p.lineNumbers };
  return { kind: "stub", words: p.words };
}

/** Everything the document is assembled from. */
export interface FactsInput {
  /** The PDF's path relative to the paper directory, with forward slashes. */
  readonly pdf: string;
  readonly sha: string;
  readonly venue: string | null;
  readonly kind: string | null;
  readonly read: PdfFacts;
  readonly geometry: Geometry;
}

/** Assemble the document. Pure. */
export function factsDocument(i: FactsInput): FactsDocument {
  const last = lastPageEntry(classifyLastPage(i.read.last));
  return {
    schema: FACTS_SCHEMA,
    pdf: i.pdf,
    pdf_sha256: i.sha,
    venue: i.venue,
    kind: i.kind,
    npages: i.read.pages,
    fonts_source: "pdfjs-drawn",
    fonts:
      i.read.fonts.kind === "drawn" ? i.read.fonts.list.map(fontEntry) : [],
    last_page: last,
    last_page_cols_pt: last.kind === "measured" ? last.columns_pt : null,
    ...flatGeometry(i.geometry),
  };
}

// ── measuring and writing ───────────────────────────────────────────────────────────────

/** What `measurePaper` needs besides the paper and its PDF. */
export interface MeasureOptions {
  readonly readPdf: PdfReader;
  readonly venue?: string | null;
  readonly kind?: string | null;
  /** The page-geometry measurer (banal, as the composition root wired it). */
  readonly measure: MeasureGeometry;
  /** Where the PDF and `paperlint.json` are read from. */
  readonly files: Files;
}

/** The document, and the geometry it was projected from — a caller decides what "no geometry" means. */
export interface Measured {
  readonly facts: FactsDocument;
  readonly geometry: Geometry;
}

const posix = (p: string): string => p.split(sep).join("/");

/**
 * Measure `pdf`: pdf.js always, banal when one is found. Writes nothing. The error is one line: the
 * PDF could not be read. Whether a missing geometry is a failure is the CALLER's policy — the build
 * writes the facts anyway, the shim's `--strict` refuses them.
 */
export async function measurePaper(
  paperDir: string,
  pdf: string,
  o: MeasureOptions,
): Promise<Result<Measured, string>> {
  const r = await o.readPdf(pdf);
  if (!r.ok) return err(describeFailure(r, pdf));
  const bytes = o.files.readBytes(at(pdf));
  if (bytes === null) return err(`${pdf}: gone after pdf.js read it`);
  const geometry = o.measure.measure(r.facts.layout);
  const decl = declaredVenue(o.files, paperDir);
  const facts = factsDocument({
    pdf: posix(relative(paperDir, pdf)),
    sha: sha256Hex(bytes),
    venue: o.venue ?? decl?.label ?? null,
    kind: o.kind ?? decl?.kind ?? null,
    read: r.facts,
    geometry,
  });
  return ok({ facts, geometry });
}

/**
 * Write `<paperDir>/_build/paper.facts.json`, atomically. A caller that decides not to write leaves
 * an earlier file as it was — its `pdf_sha256` no longer matches the PDF, so a rule refuses it.
 */
export function writeFactsFile(
  files: Files,
  paperDir: string,
  facts: FactsDocument,
): string {
  const out = factsPath(paperDir);
  files.writeAtomic(
    at(out),
    new TextEncoder().encode(`${JSON.stringify(facts, null, 2)}\n`),
  );
  return out;
}

// ── reading ─────────────────────────────────────────────────────────────────────────────

/** What a rule judges, read back from the facts file and typed once. */
export interface ReadFacts {
  /** As the file spells it: relative to the paper directory, or absolute. */
  readonly pdf: string;
  readonly sha: Sha256;
  readonly fonts: readonly FontEntry[];
  /** The geometry columns, or null when no measurer ran (`geometry_source` is null). */
  readonly geometry: FlatGeometry | null;
}

/** Why a facts file cannot be judged. */
export type FactsProblem =
  | { readonly kind: "schema"; readonly got: string }
  | { readonly kind: "broken"; readonly why: string };

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || isNum(v);

function fontOf(v: unknown): FontEntry | null {
  if (!isRecord(v)) return null;
  const { name, type, embedded, program } = v;
  return typeof name === "string" &&
    typeof type === "string" &&
    typeof embedded === "boolean" &&
    typeof program === "string"
    ? { name, type, embedded, program }
    : null;
}

const MAYBE_NUMBERS = [
  "page_w_in",
  "page_h_in",
  "columns",
  "body_pt",
  "ref_pt",
] as const;
const NUMBERS = ["body_pages", "ref_pages", "appendix_pages"] as const;

/** The geometry columns when a measurer ran; the shape error otherwise. */
function geometryOf(
  d: Readonly<Record<string, unknown>>,
): Result<FlatGeometry | null, string> {
  if (d["geometry_source"] === null) return ok(null);
  if (typeof d["geometry_source"] !== "string")
    return err("`geometry_source` is neither a measurer's name nor null");
  const bad =
    MAYBE_NUMBERS.find((k) => !numOrNull(d[k])) ??
    NUMBERS.find((k) => !isNum(d[k]));
  if (bad) return err(`\`${bad}\` is not a number`);
  const pagesByType = d["pages_by_type"];
  if (!isRecord(pagesByType) || !Object.values(pagesByType).every(isNum))
    return err("`pages_by_type` is not an object of page counts");
  const n = (k: (typeof MAYBE_NUMBERS)[number]) => d[k] as number | null;
  return ok({
    page_w_in: n("page_w_in"),
    page_h_in: n("page_h_in"),
    columns: n("columns"),
    body_pt: n("body_pt"),
    ref_pt: n("ref_pt"),
    body_pages: d["body_pages"] as number,
    ref_pages: d["ref_pages"] as number,
    appendix_pages: d["appendix_pages"] as number,
    pages_by_type: pagesByType as Readonly<Record<string, number>>,
  });
}

/** The PDF the facts describe: its path and its sha256. */
function artifactOf(
  d: Readonly<Record<string, unknown>>,
): Result<{ pdf: string; sha: Sha256 }, string> {
  const pdf = d["pdf"];
  if (typeof pdf !== "string" || pdf === "") return err("no `pdf` path");
  try {
    return ok({ pdf, sha: parseSha256(String(d["pdf_sha256"])) });
  } catch {
    return err("no `pdf_sha256` of 64 hex digits");
  }
}

/**
 * The facts file's text → what a rule judges, or why it cannot be judged. The one reader of the
 * file in `src/`, beside its one writer: a field renamed here and not there is a compile error in
 * this module, not a rule that silently reads `undefined`. Pure.
 */
export function parseFactsText(text: string): Result<ReadFacts, FactsProblem> {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch (e) {
    return err({ kind: "broken", why: `not JSON (${(e as Error).message})` });
  }
  if (!isRecord(d)) return err({ kind: "broken", why: "not a JSON object" });
  if (d["schema"] !== FACTS_SCHEMA)
    return err({ kind: "schema", got: JSON.stringify(d["schema"] ?? null) });
  const artifact = artifactOf(d);
  if (!artifact.ok) return err({ kind: "broken", why: artifact.error });
  const rawFonts = d["fonts"];
  const fonts = Array.isArray(rawFonts) ? rawFonts.map(fontOf) : null;
  if (fonts === null || fonts.some((f) => f === null))
    return err({
      kind: "broken",
      why: "`fonts` is not a list of { name, type, embedded, program }",
    });
  const geometry = geometryOf(d);
  if (!geometry.ok) return err({ kind: "broken", why: geometry.error });
  return ok({
    ...artifact.value,
    fonts: fonts as FontEntry[],
    geometry: geometry.value,
  });
}
