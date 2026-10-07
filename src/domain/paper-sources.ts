/**
 * WHAT A DATABASE IS — the values the bibtex reader (`BibReader`, src/ports/bib-reader.ts) returns for
 * a `.bib`, or for the body of a `filecontents` block: its entries, and the bytes bibtex takes from
 * them. Which databases a paper reads is TeX's answer, recorded by the build (`_build/sources.json`,
 * src/domain/sources-record.ts, docs/design/paper-sources.md §1); nothing here decides it.
 */
import type { AbsolutePath } from "./paths.ts";
import type { Span } from "./tex-document.ts";

/** The main file's name — the file TeX is given. */
export const MAIN_FILE = "paper.tex";

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
