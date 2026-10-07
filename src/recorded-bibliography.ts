/**
 * THE BIBLIOGRAPHY THE LAST BUILD READ — the entries of the databases bibtex opened, from the build's
 * record (`_build/sources.json`, docs/design/paper-sources.md §1), through the one bibtex reader. Nothing
 * here reads TeX source to decide which bibliography a paper has: TeX answered, the build wrote it
 * down, and `paperRecord` says whether the paper is still the one it was written for.
 *
 *   unrecorded   no record, or a stale one — the rules that need it are silent (`paper/sources-fresh`
 *                speaks), the scripts refuse ("run `npx paperlint build` first")
 *   recorded     a current record, and the databases bibtex opened that are on disk now (none when
 *                bibtex ran none), and the names of those that are not
 *
 * WHERE A FINDING ABOUT AN ENTRY GOES (`entryReports`). ESLint lints `paper.tex` only, so every finding
 * is a place in it. An entry of a `.bib` TeX wrote (a `filecontents` block) is reported on its own line
 * in the block of `paper.tex` whose body bibtex takes as the same database (`sameDatabase`) — a lookup
 * of where the text stands, which decides nothing: the record said what TeX read. When no block of
 * `paper.tex` is that database — the block is in an included file, or `paper.tex` was edited after the
 * build — and for the entry of every other `.bib`, the finding is at the top of `paper.tex`, the file,
 * line and column of the entry at the front of the message (`refs.bib:12:1:`).
 */
import { extname, posix, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  sameDatabase,
  type BibEntry,
  type BibText,
} from "./domain/paper-sources.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type { Span } from "./domain/tex-document.ts";
import {
  JOBNAME,
  spelledIn,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import {
  paperRecord,
  type PaperRecord,
  type RecordReadDeps,
} from "./paper-record.ts";
import type { BibReader } from "./ports/bib-reader.ts";
import type { LatexReader } from "./ports/latex.ts";
import { decoded, lineColumn } from "./tex-paper.ts";

/** What reading the recorded bibliography needs: the disk, the record's schema, the bibtex reader. */
export interface RecordedReadDeps extends RecordReadDeps {
  readonly bib: BibReader;
}

/** And what finding where a `.bib` TeX wrote stands needs besides: the reader of `filecontents` blocks. */
export interface RecordedDeps extends RecordedReadDeps {
  readonly latex: Pick<LatexReader, "filecontents">;
}

/** A database bibtex opened that is on disk now, as the bibtex reader reads it. */
export interface ReadDatabase {
  /** As bibtex names it: `refs.bib`, `bibs/x.bib`. */
  readonly name: string;
  /** A `.bib` TeX wrote (a `filecontents` block), not one the author keeps. */
  readonly written: boolean;
  readonly bib: BibText;
}

export type RecordedBibliography =
  | {
      readonly kind: "unrecorded";
      readonly record: Exclude<PaperRecord, { readonly kind: "fresh" }>;
    }
  | {
      readonly kind: "recorded";
      readonly record: SourcesRecord;
      /** In the order bibtex opened them, each once. */
      readonly databases: readonly ReadDatabase[];
      /**
       * As bibtex names them: the databases it opened that the paper directory does not hold — found on
       * its search path (BIBINPUTS). One that was there when the build recorded it and is gone now made
       * the record stale instead: every database bibtex opened is hashed.
       */
      readonly unread: readonly string[];
    };

/** The bibliography the last build of the paper in `dir` read. */
export function recordedBibliography(
  dir: string,
  deps: RecordedReadDeps,
): RecordedBibliography {
  const r = paperRecord(dir, deps);
  if (r.kind !== "fresh") return { kind: "unrecorded", record: r };
  const { bibtex, written } = r.record;
  const opened = (bibtex.ran ? bibtex.databases : [])
    .filter(
      (d, i, all) =>
        all.findIndex((o) => resolve(dir, o) === resolve(dir, d)) === i,
    )
    .map((name) => {
      const path = callerPath(resolve(dir, name));
      const text = decoded(deps.files.readBytes(path));
      return {
        name,
        bib: text === null ? null : deps.bib.readFile(path, text),
      };
    });
  return {
    kind: "recorded",
    record: r.record,
    databases: opened.flatMap(({ name, bib }): readonly ReadDatabase[] =>
      bib === null ? [] : [{ name, written: written.includes(name), bib }],
    ),
    unread: opened.filter((d) => d.bib === null).map((d) => d.name),
  };
}

/** An entry of a database bibtex opened, and where it stands in that database. */
export interface RecordedEntry {
  readonly database: ReadDatabase;
  readonly entry: BibEntry;
  /** Its place among the database's entries: what pairs it with the same entry of a block. */
  readonly index: number;
}

/** Every entry of the databases, in the order bibtex opened them and the entries stand. */
export const entriesOfDatabases = (
  databases: readonly ReadDatabase[],
): readonly RecordedEntry[] =>
  databases.flatMap((database) =>
    database.bib.entries.map((entry, index) => ({ database, entry, index })),
  );

// ── where a finding about an entry goes ─────────────────────────────────────────────────────

/** Where a finding about an entry is reported in paper.tex. */
export type EntryReport =
  | { readonly kind: "here"; readonly span: Span }
  /** At the top of paper.tex; `where` names the entry (`refs.bib:12:1`). */
  | { readonly kind: "elsewhere"; readonly span: Span; readonly where: string };

/** The first line of an entry: `@misc{key,` — what a finding underlines. */
const headOf = (bib: BibText, e: BibEntry): Span => {
  const first = bib.text
    .slice(e.span.start, e.span.end)
    .split("\n", 1)
    .join("");
  return { start: e.span.start, end: e.span.start + first.length };
};

const TOP: Span = { start: 0, end: 0 };

/** A text of the paper that may hold a block: a file of the record, the main file as the editor has it. */
interface Holder {
  readonly path: AbsolutePath;
  readonly text: string;
}

/**
 * The text of every `.tex` the record lists, in the order TeX first read them: from disk, except
 * `override` (the main file as the editor holds it), which stands for its own path. A record is only
 * current while every file it lists is on disk, so none is skipped for being absent.
 */
function holders(
  dir: string,
  record: SourcesRecord,
  override: Holder | null,
  deps: RecordedDeps,
): readonly Holder[] {
  return record.inputs
    .map((i) => callerPath(resolve(dir, i.path)))
    .filter((p) => extname(p) === ".tex")
    .map((path) =>
      override !== null && override.path === path
        ? override
        : { path, text: decoded(deps.files.readBytes(path)) },
    )
    .filter((h): h is Holder => h.text !== null);
}

/** The block, in some text of the paper, that holds what bibtex read of `db`. */
const blockHolding = (
  db: ReadDatabase,
  texts: readonly Holder[],
  deps: RecordedDeps,
): { readonly holder: Holder; readonly bib: BibText } | null =>
  texts
    .flatMap((holder) =>
      deps.latex
        .filecontents(holder.text, JOBNAME)
        // The block that wrote this database: its file, then its text.
        .filter((b) => spelledIn([posix.normalize(b.writes)], db.name) !== null)
        .map((b) => ({
          holder,
          bib: deps.bib.read(holder.path, holder.text, b.body),
        })),
    )
    .find((b) => sameDatabase(b.bib, db.bib)) ?? null;

/** The paper being linted: where it is, the record of its build, and its main file as the editor holds it. */
export interface LintedPaper {
  readonly dir: string;
  readonly record: SourcesRecord;
  readonly main: Holder;
}

/** Where a finding about `f` is reported, given the block of a text of the paper that holds its database (or none). */
function reportOf(
  paper: LintedPaper,
  block: { readonly holder: Holder; readonly bib: BibText } | null,
  f: RecordedEntry,
): EntryReport {
  const there = block?.bib.entries[f.index];
  if (block === null || there?.key !== f.entry.key)
    return {
      kind: "elsewhere",
      span: TOP,
      where: `${f.database.name}:${lineColumn(f.database.bib.text, headOf(f.database.bib, f.entry).start)}`,
    };
  const span = headOf(block.bib, there);
  return block.holder.path === paper.main.path
    ? { kind: "here", span }
    : {
        kind: "elsewhere",
        span: TOP,
        where: `${relative(paper.dir, block.holder.path)}:${lineColumn(block.holder.text, span.start)}`,
      };
}

/**
 * Where each finding about `found` is reported, in the same order. The main file is read as the editor
 * holds it; the record's other `.tex` files are read from disk.
 */
export function entryReports(
  paper: LintedPaper,
  found: readonly RecordedEntry[],
  deps: RecordedDeps,
): readonly EntryReport[] {
  const texts = holders(paper.dir, paper.record, paper.main, deps);
  // Only the written databases that have a finding are searched for their block.
  const blocks = new Map(
    found
      .map((f) => f.database)
      .filter((d, i, all) => d.written && all.indexOf(d) === i)
      .map((d) => [d, blockHolding(d, texts, deps)] as const),
  );
  return found.map((f) => reportOf(paper, blocks.get(f.database) ?? null, f));
}

/**
 * The text the author edits for each database bibtex opened, in the order it opened them: for a `.bib`
 * TeX wrote, the block of `paper.tex` or of an included file that holds what bibtex read; for any other
 * database, and for a written one no block holds, the file itself. What a script reads, so its entries
 * stand where the author finds them.
 */
export function authoredTexts(
  dir: string,
  recorded: Extract<RecordedBibliography, { readonly kind: "recorded" }>,
  deps: RecordedDeps,
): readonly BibText[] {
  const texts = holders(dir, recorded.record, null, deps);
  return recorded.databases.map(
    (d) => (d.written ? blockHolding(d, texts, deps)?.bib : undefined) ?? d.bib,
  );
}
