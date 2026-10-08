/**
 * The bibtex reader over `@retorquere/bibtex-parser` — the one `.bib` reader of paperlint
 * (`src/ports/bib-reader.ts`).
 *
 * It reads a well-formed database as bibtex does: entries, fields (LaTeX read into text, so `{\"u}`
 * is `ü` and `\url{x}` a link), name lists split into names, `@string`s expanded, `@preamble`. A
 * second reading keeps each field as bibtex takes it, LaTeX as written: what two databases are
 * compared by (`sameDatabase`), where `{\"u}` and `ü` must stay different. A malformed
 * database is bibtex's to report: the build runs bibtex and fails with bibtex's own lines. The two
 * readers also differ on one well-formed shape: bibtex has no comment syntax, so an entry behind
 * `%` or inside `@comment{…}` is one bibtex reads and this reader does not. The build records what
 * bibtex read, and `paper/refs-checked` names such an entry (`src/references.ts`).
 *
 * The parser gives each entry's text (`input`), not its place: each is found in the body in order.
 *
 * A database read after others starts with the `@string`s they left in force (`inherited`), as bibtex
 * reads a paper's databases in sequence with one table of them: the parser takes them as its table of
 * predefined `@string`s, which the database's own definitions override from where they stand. Each
 * database is still parsed as its own text, so every entry keeps its place in the file that holds it.
 */
import {
  parse,
  type Creator,
  type Entry,
  type Library,
  type Options,
} from "@retorquere/bibtex-parser";
import type {
  BibEntry,
  BibName,
  BibStrings,
  BibText,
  WrittenEntry,
} from "../../domain/paper-sources.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Span } from "../../domain/tex-document.ts";
import type { BibReader } from "../../ports/bib-reader.ts";

/** A title as written, not sentence-cased; no field kept as raw LaTeX. */
const OPTIONS: Readonly<Options> = { sentenceCase: false, verbatimFields: [] };

/**
 * Every field as bibtex takes it: `@string`s expanded where they are used, LaTeX left as written (no
 * conversion, no name split, no outer braces dropped).
 */
const AS_WRITTEN: Readonly<Options> = {
  raw: true,
  sentenceCase: false,
  verbatimFields: [/.*/],
  removeOuterBraces: [],
};

/** A name's parts, those it has: the parser leaves the others out. */
const nameOf = (c: Readonly<Creator>): BibName =>
  Object.fromEntries(
    Object.entries({
      lastName: c.lastName,
      firstName: c.firstName,
      prefix: c.prefix,
      suffix: c.suffix,
      name: c.name,
    }).filter((kv): kv is [string, string] => kv[1] !== undefined),
  );

const isText = (x: unknown): x is string => typeof x === "string";
const isName = (x: unknown): x is Readonly<Creator> =>
  typeof x === "object" && x !== null;

/** An entry's fields and name lists, from the parser's one record of both. */
function fieldsOf(e: Readonly<Entry>): Pick<BibEntry, "fields" | "names"> {
  const pairs = Object.entries(e.fields);
  const isNames = (k: string): boolean => e.mode[k] === "creatorlist";
  return {
    // A list field (`keywords`, `publisher`) is joined as BibTeX writes it.
    fields: Object.fromEntries(
      pairs
        .filter(([k]) => !isNames(k))
        .map(([k, v]) => [k, [v].flat().filter(isText).join(" and ")]),
    ),
    names: Object.fromEntries(
      pairs
        .filter(([k]) => isNames(k))
        .map(([k, v]) => [k, [v].flat().filter(isName).map(nameOf)]),
    ),
  };
}

/** Each entry the parser read, placed in the text: found in `source` in order, `source` at `offset`. */
function placed(
  parsed: readonly Readonly<Entry>[],
  source: string,
  offset: number,
): readonly BibEntry[] {
  return parsed.reduce<{
    readonly from: number;
    readonly found: readonly BibEntry[];
  }>(
    (acc, e) => {
      const at = source.indexOf(e.input, acc.from);
      const end = at + e.input.length;
      const span = { start: offset + at, end: offset + end };
      const entry = { type: e.type.toLowerCase(), key: e.key, span };
      return { from: end, found: [...acc.found, { ...entry, ...fieldsOf(e) }] };
    },
    { from: 0, found: [] },
  ).found;
}

/** The entries the parser finished: one it could not keeps no text — it is malformed, and bibtex reports it. */
const finished = (lib: Readonly<Library>): readonly Readonly<Entry>[] =>
  lib.entries.filter((e) => e.input !== "");

/** An entry as bibtex takes it; a list field (`keywords`) as one value. */
const writtenOf = (e: Readonly<Entry>): WrittenEntry => ({
  type: e.type.toLowerCase(),
  key: e.key,
  fields: Object.fromEntries(
    Object.entries(e.fields).map(([k, v]) => [
      k,
      [v].flat().filter(isText).join(", "),
    ]),
  ),
});

/**
 * The database in `body` of `text`, the text of the file at `path`, read with the `@string`s
 * `inherited` in force. The parser is handed a copy of them: it writes into its own.
 */
function read(
  path: AbsolutePath,
  text: string,
  body: Span,
  inherited: BibStrings = {},
): BibText {
  const source = text.slice(body.start, body.end);
  const lib = parse(source, { ...OPTIONS, strings: { ...inherited } });
  const asWritten = parse(source, { ...AS_WRITTEN, strings: { ...inherited } });
  return {
    path,
    text,
    body,
    entries: placed(finished(lib), source, body.start),
    written: finished(asWritten).map(writtenOf),
    preamble: lib.preamble,
    inherited,
    // Its own as bibtex takes them: the reading that keeps LaTeX as written.
    strings: { ...inherited, ...asWritten.strings },
  };
}

export const bibReader: BibReader = {
  read,
  readFile: (path, text, inherited) =>
    read(path, text, { start: 0, end: text.length }, inherited),
};
