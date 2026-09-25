/**
 * THE ONE WRITER of `<paper>/_build/paper.facts.json` — what a finished PDF measures, as data a lint
 * rule can judge. It judges nothing itself.
 *
 * Two callers, one function: `rpp build` writes the facts right after a successful compile, and
 * `skills/render-paper/extract-pdf-facts.mjs` is a thin command-line shim over the same
 * `writeFacts` for PDFs rpp did not build and for CI steps that name that script by path. Two
 * writers would drift — one would learn a field the other does not — and the rules reading the file
 * cannot tell which wrote it.
 *
 * ── WHERE THE FACTS COME FROM ──────────────────────────────────────────────────
 * - pdf.js (`pdf-facts.ts`) — page count, the fonts the pages draw text with, the last page. Always.
 * - banal (Eddie Kohler's page-geometry tool, the one HotCRP's format checker runs) — paper size,
 *   columns, body and reference font sizes, page types. It runs on pdftohtml-style XML that rpp
 *   writes from the same pdf.js read (`pdf-layout.ts`), so poppler is not needed (`banal.ts`).
 *   OPTIONAL: banal is GPL and rpp does not ship it — `rpp toolchain` fetches it. Found ⇒ its fields
 *   are filled and `geometry_source` says `banal`; not found ⇒ they are null and `geometry_source`
 *   is null, so a rule can tell "not measured" from "measured as zero". A caller that requires it
 *   (`extract-pdf-facts.mjs --strict`) gets a failure instead.
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
import { createHash } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- legacy I/O, moves behind a port in #76
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  classifyLastPage,
  popplerType,
  type FontFact,
  type LastPage,
} from "./pdf-geometry.ts";
import { describeFailure, type PdfFacts, type PdfReader } from "./pdf-facts.ts";
import { findBanal, measureLayout, missingBanal } from "./banal.ts";
import { spawnProcess } from "./adapters/node/process.ts";
import type { RunProcess } from "./core/ports.ts";

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
 * The paper's `venue.json`, or null when there is none or it names no venue. The one reader of
 * that file: the build, the facts writer and the shim all read it here.
 */
export function declaredVenue(paperDir: string): VenueDecl | null {
  const f = join(paperDir, "venue.json");
  if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const venue = str(d["venue"]);
  return venue ? { venue, kind: str(d["kind"]), pdf: str(d["pdf"]) } : null;
}

export const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

// ── banal ───────────────────────────────────────────────────────────────────────────────

/** The geometry banal measures, in the facts file's field names. */
export interface BanalFacts {
  readonly page_w_in: number | null;
  readonly page_h_in: number | null;
  readonly columns: number | null;
  readonly body_pt: number | null;
  readonly ref_pt: number | null;
  readonly body_pages: number;
  readonly ref_pages: number;
  readonly appendix_pages: number;
  readonly pages_by_type: Readonly<Record<string, number>>;
}

interface BanalPage {
  readonly type?: string;
  readonly reffontsize?: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * banal's JSON → the geometry fields. Pure.
 *
 * 🔴 banal OMITS a page's `type` when it is "body" (its line 1022: `push … if $page->{type} ne
 * "body"`), so counting pages whose type equals "body" gives ZERO for every paper in the world —
 * that is how the first page-limit gate was written, and it could not fire once. A page without a
 * type IS a body page.
 */
export function banalFacts(banal: Record<string, unknown>): BanalFacts {
  const pages = (
    Array.isArray(banal["pages"]) ? banal["pages"] : []
  ) as BanalPage[];
  const byType: Record<string, number> = {};
  for (const p of pages)
    byType[p.type ?? "body"] = (byType[p.type ?? "body"] ?? 0) + 1;
  const bib = pages.find((p) => p.type === "bib" && p.reffontsize != null);
  // banal gives papersize as [height, width] in points — checked against live output 2026-08-26.
  const size = banal["papersize"];
  const inches = (i: number): number | null =>
    Array.isArray(size) && num(size[i]) !== null
      ? Number(((size[i] as number) / 72).toFixed(3))
      : null;
  const refPages = byType["bib"] ?? 0;
  const appendixPages = byType["appendix"] ?? 0;
  return {
    page_w_in: inches(1),
    page_h_in: inches(0),
    columns: num(banal["columns"]),
    body_pt: num(banal["bodyfontsize"]),
    ref_pt: num(bib?.reffontsize),
    body_pages: pages.length - refPages - appendixPages,
    ref_pages: refPages,
    appendix_pages: appendixPages,
    pages_by_type: byType,
  };
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

const NO_GEOMETRY: { [K in keyof BanalFacts]: null } = {
  page_w_in: null,
  page_h_in: null,
  columns: null,
  body_pt: null,
  ref_pt: null,
  body_pages: null,
  ref_pages: null,
  appendix_pages: null,
  pages_by_type: null,
};

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
  readonly geometry_source: "banal" | null;
} & ({ [K in keyof BanalFacts]: BanalFacts[K] } | typeof NO_GEOMETRY);

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
  readonly banal: BanalFacts | null;
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
    geometry_source: i.banal ? "banal" : null,
    ...(i.banal ?? NO_GEOMETRY),
  };
}

// ── writing it ──────────────────────────────────────────────────────────────────────────

/** What `writeFacts` needs besides the paper and its PDF. */
export interface WriteOptions {
  readonly readPdf: PdfReader;
  readonly venue?: string | null;
  readonly kind?: string | null;
  /** `required`: no banal is a failure. `optional`: no banal leaves the geometry null. */
  readonly banal: "required" | "optional";
  readonly env?: NodeJS.ProcessEnv;
  /** Where `vendor/banal` is looked for (`banal.ts`, `findBanal`). */
  readonly projectRoot: string;
  /** Runs perl; the harness passes a recorder. */
  readonly run?: RunProcess;
  /** Home directory for rpp's cache; defaults to the user's. */
  readonly home?: string;
}

export type WriteResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly facts: FactsDocument;
      /** Set when banal was optional and not used: why the geometry fields are null. */
      readonly geometryMissing: string | null;
    }
  | { readonly ok: false; readonly lines: readonly string[] };

/** banal's geometry, or the reason there is none. */
function measureGeometry(
  read: PdfFacts,
  o: WriteOptions,
): { banal: BanalFacts | null; why: string | null } {
  // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
  const env = o.env ?? process.env;
  const where = findBanal(env, o.projectRoot, o.home);
  if (!where) return { banal: null, why: missingBanal(env, o.home) };
  const run = o.run ?? spawnProcess();
  const r = measureLayout(where.path, read.layout, { run, env });
  return r.ok
    ? { banal: banalFacts(r.json), why: null }
    : {
        banal: null,
        why: `${r.why} (banal from ${where.from}: ${where.path})`,
      };
}

const posix = (p: string): string => p.split(sep).join("/");

/**
 * Measure `pdf` and write `<paperDir>/_build/paper.facts.json`. Nothing is written on failure, and
 * a facts file from an earlier run is left as it was — its `pdf_sha256` no longer matches the PDF,
 * so a rule refuses it.
 */
export async function writeFacts(
  paperDir: string,
  pdf: string,
  o: WriteOptions,
): Promise<WriteResult> {
  const r = await o.readPdf(pdf);
  if (!r.ok) return { ok: false, lines: [describeFailure(r, pdf)] };
  const g = measureGeometry(r.facts, o);
  if (g.why && o.banal === "required") return { ok: false, lines: [g.why] };
  const decl = declaredVenue(paperDir);
  const facts = factsDocument({
    pdf: posix(relative(paperDir, pdf)),
    sha: sha256(pdf),
    venue: o.venue ?? decl?.venue ?? null,
    kind: o.kind ?? decl?.kind ?? null,
    read: r.facts,
    banal: g.banal,
  });
  const out = factsPath(paperDir);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(facts, null, 2)}\n`);
  return { ok: true, path: out, facts, geometryMissing: g.why };
}
