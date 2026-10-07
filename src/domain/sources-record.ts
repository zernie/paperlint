/**
 * WHAT THE LAST BUILD READ — `<paper>/_build/sources.json`, written by `paperlint build` from TeX's
 * own files (docs/design/paper-sources.md §1) and read, offline, by the rules that need to know which
 * files make up a paper and which bibliography it uses. Nothing else answers either question: no
 * code of paperlint reads TeX source to decide them.
 *
 *   { "schema": 1,
 *     "inputs":  [ { "path": "paper.tex", "role": "body" }, … ],  the files of the paper directory TeX
 *                                                                 read, in first-read order
 *     "written": [ "refs.bib" ],                                  the `.bib` files TeX wrote (filecontents)
 *     "bibdata": [ "refs" ],                                      what `\bibdata` told bibtex to read
 *     "bibtex":  { "ran": true, "databases": [ "refs.bib" ],      the files bibtex opened, the keys it
 *                  "keys": [ … ], "exit": 0, "errors": [] },      typeset, how it ended
 *     "sha256":  { "paper.tex": "…", … } }                        every input and every opened database
 *                                                                 TeX did not write, by path and bytes
 *
 * 🔴 A role is the file's, and the main file is the body. A file is `preamble` when TeX read it only
 * before `\begin{document}` — before it opened `paper.aux` for writing (measured) — and `body` when
 * any read of it came after. The main file, the first one read, is `body` whatever its place in that
 * order: it holds `\begin{document}` itself.
 *
 * The text of the file is checked once, where it enters: `SourcesCodec` (`src/ports/sources-codec.ts`),
 * whose adapter holds the zod schema of this shape. The domain holds the value.
 *
 * 🔴 STALENESS is the record's own question: `changesSince` compares the bytes now with `sha256`, one
 * key per file, so a rule can tell that the paper changed after the build without running TeX. A `.bib`
 * TeX wrote is not hashed — its bytes are the block of the `.tex` that wrote it, which is.
 */
import type { Sha256 } from "./sha256.ts";

export const SOURCES_SCHEMA = 1;
export const SOURCES_DIR = "_build";
export const SOURCES_FILE = "sources.json";

/** The job name every file a build writes carries (`paper.aux`, `paper.fls`): the build names its job so. */
export const JOBNAME = "paper";

/** Before or after `\begin{document}`. */
export type InputRole = "preamble" | "body";

/** One file of the paper directory that TeX read. `path` is relative to it, with forward slashes. */
export interface RecordedInput {
  readonly path: string;
  readonly role: InputRole;
}

/** One error bibtex reported, as its `.blg` says it. */
export interface BibtexError {
  readonly message: string;
  /** The file it was reading (`refs.bib`, `paper.aux`). */
  readonly file: string;
  /** Null when bibtex named no line. */
  readonly line: number | null;
}

/** What the build's bibtex did — or that the build ran none (the paper names no database). */
export type RecordedBibtex =
  | { readonly ran: false }
  | {
      readonly ran: true;
      /** The database files it opened, as it names them (`refs.bib`, `bibs/x.bib`). */
      readonly databases: readonly string[];
      /** The keys it typeset: every `\bibitem` of the `.bbl`. */
      readonly keys: readonly string[];
      readonly exit: number;
      readonly errors: readonly BibtexError[];
    };

export interface SourcesRecord {
  readonly schema: typeof SOURCES_SCHEMA;
  readonly inputs: readonly RecordedInput[];
  readonly written: readonly string[];
  readonly bibdata: readonly string[];
  readonly bibtex: RecordedBibtex;
  /** Path → digest of its bytes; null for a file that was not there when the record was made. */
  readonly sha256: Readonly<Record<string, string | null>>;
}

export type ParsedRecord =
  | { readonly ok: true; readonly record: SourcesRecord }
  | { readonly ok: false; readonly why: string };

/** The record as the file holds it: two-space JSON and a final newline, so a diff of two builds reads. */
export const serializeSourcesRecord = (r: SourcesRecord): string =>
  `${JSON.stringify(r, null, 2)}\n`;

// ── reading a record ────────────────────────────────────────────────────────────────────

/** The files TeX read in the body, main file included, in the order TeX first read them. */
export const bodyInputs = (r: SourcesRecord): readonly string[] =>
  r.inputs.filter((i) => i.role === "body").map((i) => i.path);

/** The files TeX read only before `\begin{document}`, in the order TeX first read them. */
export const preambleInputs = (r: SourcesRecord): readonly string[] =>
  r.inputs.filter((i) => i.role === "preamble").map((i) => i.path);

// ── staleness ───────────────────────────────────────────────────────────────────────────

export type ChangeKind = "edited" | "deleted" | "added";

/** One file whose bytes are not those the build hashed. */
export interface Change {
  readonly path: string;
  readonly change: ChangeKind;
}

/**
 * The files whose bytes now differ from the record's: edited, deleted, or present where the record saw
 * none. `now` answers for one path with the digest of its bytes, or null when there is no such file.
 * Empty when the record is current.
 */
export function changesSince(
  r: SourcesRecord,
  now: (path: string) => Sha256 | null,
): readonly Change[] {
  return Object.entries(r.sha256).flatMap(
    ([path, recorded]): readonly Change[] => {
      const current = now(path);
      if (current === recorded) return [];
      if (current === null) return [{ path, change: "deleted" }];
      return [{ path, change: recorded === null ? "added" : "edited" }];
    },
  );
}

/** `paper.tex edited, sections/a.tex deleted` — what a finding names. */
export const describeChanges = (cs: readonly Change[]): string =>
  cs.map((c) => `${c.path} ${c.change}`).join(", ");
