/**
 * The bibtex reader over `@retorquere/bibtex-parser` — the one `.bib` reader of paperlint
 * (`src/ports/bib-reader.ts`).
 *
 * It reads a well-formed database as bibtex does: entries, fields (LaTeX read into text, so `{\"u}`
 * is `ü` and `\url{x}` a link), name lists split into names, `@string` and `@preamble`. A malformed
 * database is bibtex's to report: the build runs bibtex and fails with bibtex's own lines. The two
 * readers also differ on one well-formed shape: bibtex has no comment syntax, so an entry behind
 * `%` or inside `@comment{…}` is one bibtex reads and this reader does not. The build records what
 * bibtex read, and `paper/refs-checked` names such an entry (`src/references.ts`).
 *
 * The parser gives each entry's text (`input`), not its place: each is found in the body in order.
 */
import {
  parse,
  type Creator,
  type Entry,
  type Options,
} from "@retorquere/bibtex-parser";
import type { BibEntry, BibName, BibText } from "../../domain/paper-sources.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Span } from "../../domain/tex-document.ts";
import type { BibReader } from "../../ports/bib-reader.ts";

/** A title as written, not sentence-cased; no field kept as raw LaTeX. */
const OPTIONS: Readonly<Options> = { sentenceCase: false, verbatimFields: [] };

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

/** The database in `body` of `text`, the text of the file at `path`. */
function read(path: AbsolutePath, text: string, body: Span): BibText {
  const source = text.slice(body.start, body.end);
  const lib = parse(source, OPTIONS);
  // An entry the parser could not finish keeps no text: it is malformed, and bibtex reports it.
  const parsed = lib.entries.filter((e) => e.input !== "");
  return {
    path,
    text,
    body,
    entries: placed(parsed, source, body.start),
    strings: lib.strings,
    preamble: lib.preamble,
  };
}

export const bibReader: BibReader = {
  read,
  readFile: (path, text) => read(path, text, { start: 0, end: text.length }),
};
