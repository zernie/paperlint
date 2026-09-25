/**
 * THE ONE WRITER of `<paper>/_build/paper.facts.json` — what a finished PDF measures, as data a lint
 * rule can judge. It judges nothing itself.
 *
 * Two callers, one function: `rpp build` writes the facts right after a successful compile, and
 * `skills/render-paper/extract-pdf-facts.mjs` is a thin command-line shim over the same
 * `measurePaper` + `writeFactsFile` for PDFs rpp did not build and for CI steps that name that script by path. Two
 * writers would drift — one would learn a field the other does not — and the rules reading the file
 * cannot tell which wrote it.
 *
 * ── WHERE THE FACTS COME FROM ──────────────────────────────────────────────────
 * - pdf.js (`pdf-facts.ts`) — page count, the fonts the pages draw text with, the last page. Always.
 * - banal (Eddie Kohler's page-geometry tool, the one HotCRP's format checker runs) — paper size,
 *   columns, body and reference font sizes, page types. It runs on pdftohtml-style XML that rpp
 *   writes from the same pdf.js read (`adapters/banal/xml.ts`), so poppler is not needed (`adapters/banal/`).
 *   OPTIONAL: banal is GPL and rpp does not ship it — `rpp toolchain` fetches it. Found ⇒ its fields
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
import { measureGeometry } from "./adapters/banal/index.ts";
import {
  flatGeometry,
  type FactsGeometryFields,
  type Geometry,
} from "./adapters/banal/geometry.ts";
import { sha256Hex } from "./adapters/banal/install.ts";
import type { BanalRuntime } from "./adapters/banal/settings.ts";
import type { AbsolutePath, Files } from "./domain/ports.ts";
import { err, ok, type Result } from "./domain/result.ts";

export const FACTS_SCHEMA = 2;
export const FACTS_DIR = "_build";
export const FACTS_FILE = "paper.facts.json";

/** Where a paper's facts live. */
export const factsPath = (paperDir: string): string =>
  join(paperDir, FACTS_DIR, FACTS_FILE);

/** The `venue.json` a paper declares: where it is submitted, as which kind, and where its PDF is. */
export interface VenueDecl {
  readonly venue: string;
  readonly kind: string | null;
  readonly pdf: string | null;
}

/**
 * A path as the caller gave it. The `Files` adapter resolves a relative one against the process's
 * cwd, which is what these callers have always meant; the brand is not a claim this code checked it.
 */
const at = (p: string): AbsolutePath => p as AbsolutePath;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** A parsed `venue.json`, or null when it names no venue. */
export function parseVenueDecl(json: unknown): VenueDecl | null {
  const d = typeof json === "object" && json !== null ? json : {};
  const field = (k: string) => str((d as Record<string, unknown>)[k]);
  const venue = field("venue");
  return venue ? { venue, kind: field("kind"), pdf: field("pdf") } : null;
}

/**
 * The paper's `venue.json`, or null when there is none or it names no venue. The one reader of
 * that file: the build, the facts writer and the shim all read it here.
 */
export function declaredVenue(
  files: Files,
  paperDir: string,
): VenueDecl | null {
  const bytes = files.readBytes(at(join(paperDir, "venue.json")));
  return bytes === null
    ? null
    : parseVenueDecl(JSON.parse(new TextDecoder().decode(bytes)));
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
  /** The real or in-memory ports, and the banal settings the composition root parsed. */
  readonly runtime: BanalRuntime;
  /** Where `vendor/banal` is looked for (`adapters/banal/locate.ts`). */
  readonly projectRoot: string;
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
  const bytes = o.runtime.io.files.readBytes(at(pdf));
  if (bytes === null) return err(`${pdf}: gone after pdf.js read it`);
  const { io, settings } = o.runtime;
  const geometry = measureGeometry(
    io,
    settings,
    at(o.projectRoot),
    r.facts.layout,
  );
  const decl = declaredVenue(io.files, paperDir);
  const facts = factsDocument({
    pdf: posix(relative(paperDir, pdf)),
    sha: sha256Hex(bytes),
    venue: o.venue ?? decl?.venue ?? null,
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
