/**
 * WHAT A PAPER IS MADE OF — its files and its bibliography, as values. One owner for two questions
 * many places used to answer for themselves (docs/design/paper-sources.md):
 *
 *   Q1  which files make up the paper   `paper.tex` and what its includes bring in, each with a role
 *   Q2  which bibliography TeX reads    a discriminated union, decided from the COMMITTED bytes
 *
 * `paperSources` (src/paper-sources.ts) is the only function that reads a paper's files to answer
 * them; everything downstream takes this value. The bibliography is decided by the latex adapter
 * (`decideBibliography`), which knows TeX's and bibtex's rules; this file holds the states and what
 * a consumer reads from each.
 *
 * ── WHY "COMMITTED" ─────────────────────────────────────────────────────────────────
 * A `filecontents` block without `[overwrite]` writes its file only when no file of that name
 * exists, so whether TeX reads the block depends on what lies on the disk — and after ONE build,
 * TeX's own copy lies there. A static answer from the disk would differ between a fresh checkout and
 * a built working copy. So the static answer reads only what a fresh checkout holds: the block is
 * `embedded` unless a COMMITTED `.bib` of that name holds something else (`conflict`).
 *
 * This value is the answer BEFORE a build. What one build's bibtex actually read is recorded by the
 * build (`references.ts`) and compared with this value by `paper/refs-checked`.
 */
import type { PaperSource } from "./paper-source.ts";
import type { AbsolutePath } from "./paths.ts";
import type { Span } from "./tex-document.ts";

/** The main file's name — the file TeX is given. */
export const MAIN_FILE = "paper.tex";

/**
 * What an included file is to the paper: prose of its body, macros of its preamble, or one of
 * paperlint's own inputs (`paper-guards.tex`) found only on the search path the build adds. A role is
 * the file's, across every include of it: one included in the preamble and again in the body is body.
 */
export type Role = "body" | "preamble" | "package-input";

/** One file of the paper: where it is, its path as the paper names it, its text. */
export interface SourceFile {
  readonly path: AbsolutePath;
  /** Relative to the paper directory (or, for a package input, to paperlint's inputs). */
  readonly rel: string;
  readonly text: string;
}

/** A file an include brings in. The main file has no role: it is `PaperSources.main`. */
export interface IncludedFile extends SourceFile {
  readonly role: Role;
}

/** A name in a name list (`author`, `editor`), split into its parts as BibTeX defines them. */
export interface BibName {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  /** A name written as one unit (`{World Health Organization}`). */
  readonly name?: string;
}

/** One entry of a database. */
export interface BibEntry {
  /** Lower-cased (`@Article` → `article`). */
  readonly type: string;
  readonly key: string;
  /** From its `@` to its closing brace or parenthesis, in the text of the file that holds it. */
  readonly span: Span;
  /** Its fields, LaTeX read into text (`{\"u}` → `ü`, `\url{x}` → a link); a list field joined by ` and `. */
  readonly fields: Readonly<Record<string, string>>;
  /** Its name lists (`author`, `editor`, …), each name split into its parts. */
  readonly names: Readonly<Record<string, readonly BibName[]>>;
}

/** The bytes of one database, where they sit, and what the reader read from them. */
export interface BibText {
  /** The file holding the bytes: the `.bib`, or the `.tex` that holds the block. */
  readonly path: AbsolutePath;
  /** That file's whole text; every span here is an offset into it. */
  readonly text: string;
  /** The database inside `text`: all of it for a `.bib`, the body for a block. */
  readonly body: Span;
  readonly entries: readonly BibEntry[];
  /** The same entries as bibtex takes them, in order: what two databases are compared by. */
  readonly written: readonly WrittenEntry[];
  /** The `@preamble` commands, as written, in order: bibtex writes them into the `.bbl`. */
  readonly preamble: readonly string[];
}

/**
 * An entry as bibtex takes it from the database: the type, the key, and each field's value with the
 * `@string`s it uses expanded where it uses them (a later redefinition changes nothing) and its LaTeX
 * as written — `{\"o}` and `ö` are different values here, as they are in the `.bbl` bibtex writes.
 */
export interface WrittenEntry {
  /** Lower-cased, as bibtex reads it. */
  readonly type: string;
  readonly key: string;
  /** Whitespace runs folded to one space, as bibtex folds them. */
  readonly fields: Readonly<Record<string, string>>;
}

/** A `filecontents` block writing a `.bib`, as the parse tree gives it. */
export interface EmbeddedBib {
  /** The file name the block writes, as written (`refs.bib`). */
  readonly writes: string;
  /** `[overwrite]` or `[force]`: TeX writes the file even when one exists. */
  readonly overwrite: boolean;
  /** The whole environment, `\begin` to `\end`, in `bib.path`. */
  readonly span: Span;
  readonly bib: BibText;
}

/** Where a database, or a `thebibliography`, is declared. */
export interface Declared {
  readonly file: AbsolutePath;
  readonly span: Span;
}

/**
 * One database a `\bibliography{a,b}` or `\addbibresource{…}` declares, decided from committed bytes.
 * `name` is as declared, without a `.bib` suffix (`refs`, `bibs/x`), or the URL of a remote resource.
 */
export type Database =
  /** A live block writes it; no committed file of that name holds other entries. */
  | {
      readonly kind: "embedded";
      readonly name: string;
      readonly declared: Declared;
      readonly block: EmbeddedBib;
    }
  /** No block writes it; the `.bib` is in the paper's directory. */
  | {
      readonly kind: "file";
      readonly name: string;
      readonly declared: Declared;
      readonly file: BibText;
    }
  /**
   * A block AND a committed `.bib` of that name whose entries differ: two bibliographies in the
   * committed tree. TeX reads the block with `[overwrite]`, the file without it (`texReads`).
   */
  | {
      readonly kind: "conflict";
      readonly name: string;
      readonly declared: Declared;
      readonly block: EmbeddedBib;
      readonly file: BibText;
    }
  /** Declared, and neither a block nor a file: the build's bibtex will fail on it. */
  | {
      readonly kind: "missing";
      readonly name: string;
      readonly declared: Declared;
    }
  /** `\addbibresource[location=remote]{https://…}`: fetched by biber, not on disk. */
  | {
      readonly kind: "remote";
      readonly name: string;
      readonly declared: Declared;
    }
  /**
   * A name built by a macro this reader does not expand (`\bibliography{\bibfile}`), as written.
   * Never silence: the bibliography it is in is `undecided`.
   */
  | {
      readonly kind: "unresolved";
      readonly name: string;
      readonly declared: Declared;
    };

type NonEmpty<T> = readonly [T, ...T[]];

/** The paper's bibliography. */
export type Bibliography =
  /** No `\bibliography`, no `\addbibresource`, no `thebibliography`. */
  | { readonly kind: "none" }
  /** Written by hand in a `thebibliography` environment: no database. */
  | { readonly kind: "thebibliography"; readonly declared: Declared }
  /** Every declaration is read unconditionally. */
  | { readonly kind: "databases"; readonly databases: NonEmpty<Database> }
  /**
   * Some declaration sits where TeX may or may not read it — behind a switch (`\ifanon … \else …`)
   * or in a macro's body — so which databases TeX reads depends on a value this reader does not
   * compute. Every candidate is listed; a consumer checking entries checks them all.
   */
  | { readonly kind: "undecided"; readonly databases: NonEmpty<Database> };

/** A paper: its main file, the files its includes bring in (TeX order), and its bibliography. */
export interface PaperSources {
  readonly dir: AbsolutePath;
  readonly main: SourceFile;
  readonly includes: readonly IncludedFile[];
  /** The whole paper as one text with the map back to its files, and the includes not found. */
  readonly assembled: PaperSource;
  readonly bibliography: Bibliography;
}

/**
 * What bibtex takes from a database, for comparing two: each entry as bibtex reads it, in order, its
 * fields in name order, and the `@preamble` commands. Nothing else in the bytes reaches the `.bbl`:
 * not the text between entries (a `filecontents` header among it), not a `@string` no entry uses.
 */
const contentOf = (b: BibText): string =>
  JSON.stringify([
    b.written.map((e) => [
      e.type,
      e.key,
      Object.entries(e.fields).sort(([x], [y]) => x.localeCompare(y)),
    ]),
    b.preamble,
  ]);

/** Whether two databases hold the same, as TeX's own copy of a block holds the block's. */
export const sameDatabase = (a: BibText, b: BibText): boolean =>
  contentOf(a) === contentOf(b);

/** The bytes TeX reads for one database, or null when there are none on disk. */
export function texReads(db: Database): BibText | null {
  switch (db.kind) {
    case "embedded":
      return db.block.bib;
    case "file":
      return db.file;
    case "conflict":
      return db.block.overwrite ? db.block.bib : db.file;
    case "missing":
    case "remote":
    case "unresolved":
      return null;
  }
}

/** The databases a bibliography names, in declaration order: none for `none` and `thebibliography`. */
export function databasesOf(b: Bibliography): readonly Database[] {
  switch (b.kind) {
    case "none":
    case "thebibliography":
      return [];
    case "databases":
    case "undecided":
      return b.databases;
  }
}

/** An entry TeX reads (for `undecided`, may read), the text that holds it, and the database it is read for. */
export interface FoundEntry {
  readonly db: Database;
  readonly bib: BibText;
  readonly entry: BibEntry;
}

/** Each text TeX reads (or, `undecided`, may read) for the bibliography, once, with the first database read from it. */
const readings = (
  b: Bibliography,
): readonly { readonly db: Database; readonly bib: BibText }[] =>
  databasesOf(b)
    .flatMap((db) => {
      const bib = texReads(db);
      return bib === null ? [] : [{ db, bib }];
    })
    .filter(
      (r, i, all) =>
        all.findIndex(
          (o) =>
            o.bib.path === r.bib.path && o.bib.body.start === r.bib.body.start,
        ) === i,
    );

/** Every text TeX reads (or, `undecided`, may read) for the bibliography, each once. */
export const bibTexts = (b: Bibliography): readonly BibText[] =>
  readings(b).map((r) => r.bib);

/**
 * Every entry TeX reads (or, `undecided`, may read), each text once, in order. An entry is this, not
 * its key: two candidates may each define a key, with other metadata.
 */
export const entriesOf = (b: Bibliography): readonly FoundEntry[] =>
  readings(b).flatMap(({ db, bib }) =>
    bib.entries.map((entry) => ({ db, bib, entry })),
  );
