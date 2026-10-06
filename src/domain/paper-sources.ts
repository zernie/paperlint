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
 * ── WHY "COMMITTED" (§7.2, after the refutation) ────────────────────────────────────
 * A `filecontents` block without `[overwrite]` writes its file only when no file of that name
 * exists, so whether TeX reads the block depends on what lies on the disk — and after ONE build,
 * TeX's own copy lies there. A static answer from the disk would differ between a fresh checkout and
 * a built working copy. So the static answer reads only what a fresh checkout holds: the block is
 * `embedded` unless a COMMITTED `.bib` of that name holds other entries (`conflict`). A block without
 * `[overwrite]` is a finding of its own (`bib/filecontents-overwrite`), whose fix makes `embedded`
 * true on every machine. What one build's TeX actually read is a post-build fact, not this value.
 */
import type { PaperSource } from "./paper-source.ts";
import type { AbsolutePath } from "./paths.ts";
import type { Span } from "./tex-document.ts";

/** The main file's name — the file TeX is given. */
export const MAIN_FILE = "paper.tex";

/**
 * What an included file is to the paper: prose of its body, macros of its preamble, or one of
 * paperlint's own inputs (`paper-guards.tex`) found only on the search path the build adds.
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

/** One entry as bibtex finds it: from its `@` to past its closing brace or parenthesis. */
export interface BibEntry {
  /** Lower-cased (`@Article` → `article`). */
  readonly type: string;
  readonly key: string;
  /** In the text of the file that holds the entry. */
  readonly span: Span;
  /**
   * The `%` signs before the `@` on its line, when the line holds nothing else before it. bibtex has
   * no comment character, so such an entry is READ — measured: `% @misc{dead2020,…}` is in the
   * `.bbl` (fixtures/paper-sources/v5-percent-entry). Null for an entry with no `%` before it.
   */
  readonly percent: Span | null;
}

/** The bytes of one database, where they sit: a whole `.bib`, or a `filecontents` block's body. */
export interface BibText {
  /** The file holding the bytes: the `.bib`, or the `.tex` that holds the block. */
  readonly path: AbsolutePath;
  /** That file's whole text; every span here is an offset into it. */
  readonly text: string;
  /** The database inside `text`: all of it for a `.bib`, the body for a block. */
  readonly body: Span;
  readonly entries: readonly BibEntry[];
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

/** Every text TeX reads (or, `undecided`, may read) for the bibliography, each once. */
export const bibTexts = (b: Bibliography): readonly BibText[] =>
  databasesOf(b)
    .flatMap((d) => {
      const r = texReads(d);
      return r === null ? [] : [r];
    })
    .filter(
      (r, i, all) =>
        all.findIndex(
          (o) => o.path === r.path && o.body.start === r.body.start,
        ) === i,
    );

/**
 * A database's bytes as bibtex reads them, for a parser that treats `%` as a comment: the body, with
 * every `%` that stands before an entry's `@` blanked, so the parser sees the entry bibtex reads.
 * Length-preserving: an offset into the body is an offset into this text.
 */
export function bibtexView(bib: BibText): string {
  const blanks = bib.entries.flatMap((e) =>
    e.percent === null ? [] : [e.percent],
  );
  const body = bib.text.slice(bib.body.start, bib.body.end);
  return blanks.reduce(
    (t, s) =>
      t.slice(0, s.start - bib.body.start) +
      " ".repeat(s.end - s.start) +
      t.slice(s.end - bib.body.start),
    body,
  );
}
