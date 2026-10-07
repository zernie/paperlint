/**
 * A paper as one text: `paper.tex` with every `\input`, `\include` and `\subfile` replaced by the
 * file it names — what TeX itself does — and a map from every character of that text back to the
 * file and offset it came from. The rules read the whole paper; a finding still points at its file.
 *
 * ── WHY SPLICE THE TEXT ──────────────────────────────────────────────────────────
 * `\input` is textual inclusion: TeX reads the named file where the macro stands. Replacing the
 * macro by the file's text gives the parser exactly what TeX reads, so every question the reader
 * answers about one file (the class, the outline, the rendered text, the body's passages) is
 * answered about the paper, unchanged. A subfile is a document of its own; only its body is spliced.
 *
 * ── THE END OF AN INCLUDED FILE'S LAST LINE ─────────────────────────────────────
 * TeX ends every line it reads with its end-of-line character, the last line of a file included:
 * `a\input{f}b` with `f` holding `foo` and no final newline typesets "afoo b" (measured, TeX Live
 * 2026), not "afoob". The splice does the same: an included file whose text does not end in a newline
 * gets one, mapped to the end of that file; an empty file read no line and gets nothing. The main file
 * is the caller's text and is left as given.
 *
 * ── WHAT IS NOT DONE ─────────────────────────────────────────────────────────────
 * No macro is expanded, so a path built from a macro (`\input{\dir/intro}`) is read as written. A
 * file that cannot be found is left out and named in `missing`; a file that includes itself,
 * directly or through others, is spliced once.
 */
import { extname, normalize } from "node:path";
import type { Span } from "./tex-document.ts";

/** One `\input`, `\include` or `\subfile` in a source: the path as written and where the macro stands. */
export interface Include {
  readonly macro: "input" | "include" | "subfile";
  readonly target: string;
  readonly span: Span;
}

/** What assembling needs from the LaTeX reader and from the disk, relative to the paper directory. */
export interface AssembleDeps {
  /** The includes of a source, in source order. */
  readonly includes: (src: string) => readonly Include[];
  /** The span of a source's `document` environment body, or null when it has none. */
  readonly documentBody: (src: string) => Span | null;
  /** A file's text by its path relative to the paper directory, or null when there is none. */
  readonly read: (path: string) => string | null;
}

/** A stretch of the assembled text copied from one file: `[start, end)` here is `from…` there. */
export interface Segment {
  readonly start: number;
  readonly end: number;
  readonly file: string;
  /** The whole text of `file`, so a place in it can be told as a line and a column. */
  readonly source: string;
  readonly from: number;
  /** Where, in the main file, the outermost include that brought this text in stands. */
  readonly via: Span | null;
}

/** An include whose file was not found, where it stands. */
export interface MissingInclude {
  readonly file: string;
  readonly target: string;
  readonly span: Span;
  /** Where it stands in the main file (the include itself, or the one that brought its file in). */
  readonly via: Span;
}

/** The paper as one text, the map back to its files, and the includes that were not found. */
export interface PaperSource {
  readonly main: string;
  readonly text: string;
  readonly segments: readonly Segment[];
  readonly missing: readonly MissingInclude[];
}

/** The paths TeX tries for a target: `name.tex`, then `name` — or the name alone if it has one. */
const candidates = (target: string): readonly string[] => {
  const t = normalize(target.trim());
  return extname(t) === "" ? [`${t}.tex`, t] : [t];
};

/** The first candidate path that exists, with its text. */
function found(
  target: string,
  read: AssembleDeps["read"],
): { readonly path: string; readonly text: string } | null {
  const hits = candidates(target).flatMap((path) => {
    const text = read(path);
    return text === null ? [] : [{ path, text }];
  });
  return hits[0] ?? null;
}

/** An assembled piece of text: the text, its segments from 0, and the includes not found. */
interface Piece {
  readonly text: string;
  readonly segments: readonly Segment[];
  readonly missing: readonly MissingInclude[];
}

/** `segments` moved by `by` characters. */
const shifted = (
  segments: readonly Segment[],
  by: number,
): readonly Segment[] =>
  segments.map((s) => ({ ...s, start: s.start + by, end: s.end + by }));

/** `[from, to)` of `file`'s text, copied as it is, brought in via `via`. */
interface Stretch {
  readonly file: string;
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly via: Span | null;
}

/** A stretch as a piece: its text, and one segment mapping it back. */
const copied = ({ file, text, from, to, via }: Stretch): Piece => ({
  text: text.slice(from, to),
  segments:
    to > from
      ? [{ start: 0, end: to - from, file, source: text, from, via }]
      : [],
  missing: [],
});

/** Nothing: an include left out. */
const NOTHING: Piece = { text: "", segments: [], missing: [] };

/** Pieces joined in order. */
const joined = (pieces: readonly Piece[]): Piece =>
  pieces.reduce<Piece>(
    (acc, p) => ({
      text: acc.text + p.text,
      segments: [...acc.segments, ...shifted(p.segments, acc.text.length)],
      missing: [...acc.missing, ...p.missing],
    }),
    NOTHING,
  );

/**
 * `[from, to)` of `file`, its includes spliced. `stack` is the chain of files being spliced, so a
 * file that includes itself is not entered again; `via` is where the chain began in the main file.
 */
/** What splicing carries down the chain of files. */
interface Context {
  readonly deps: AssembleDeps;
  readonly stack: readonly string[];
  readonly via: Span | null;
}

function spliced(file: string, text: string, range: Span, ctx: Context): Piece {
  const incs = ctx.deps
    .includes(text)
    .filter((i) => i.span.start >= range.start && i.span.end <= range.end);
  const at = (from: number, to: number): Piece =>
    copied({ file, text, from, to, via: ctx.via });
  const { pieces, cursor } = incs.reduce<{
    readonly pieces: readonly Piece[];
    readonly cursor: number;
  }>(
    (acc, inc) => ({
      pieces: [
        ...acc.pieces,
        at(acc.cursor, inc.span.start),
        included(file, inc, ctx),
      ],
      cursor: inc.span.end,
    }),
    { pieces: [], cursor: range.start },
  );
  return joined([...pieces, at(cursor, range.end)]);
}

/** TeX's end of line after the last line of `file`, standing where its text ends: one newline. */
const endOfLine = (file: string, text: string, via: Span | null): Piece => ({
  text: "\n",
  segments: [{ start: 0, end: 1, file, source: text, from: text.length, via }],
  missing: [],
});

/** One include: the file it names, spliced, or — when not found — nothing, and a report. */
function included(file: string, inc: Include, ctx: Context): Piece {
  const via = ctx.via ?? inc.span;
  const hit = found(inc.target, ctx.deps.read);
  if (hit === null)
    return {
      ...NOTHING,
      missing: [{ file, target: inc.target, span: inc.span, via }],
    };
  if (ctx.stack.includes(hit.path)) return NOTHING;
  const body = inc.macro === "subfile" ? ctx.deps.documentBody(hit.text) : null;
  const range = body ?? { start: 0, end: hit.text.length };
  const piece = spliced(hit.path, hit.text, range, {
    deps: ctx.deps,
    stack: [...ctx.stack, hit.path],
    via,
  });
  // The last line of the file is read to its end; a subfile's body ends inside its last line.
  const endsLine =
    range.end === hit.text.length &&
    hit.text !== "" &&
    !hit.text.endsWith("\n");
  return endsLine ? joined([piece, endOfLine(hit.path, hit.text, via)]) : piece;
}

/** The paper whose main file is `main` (a path relative to the paper directory) with `text`. */
export function assemblePaper(
  main: string,
  text: string,
  deps: AssembleDeps,
): PaperSource {
  const p = spliced(
    main,
    text,
    { start: 0, end: text.length },
    { deps, stack: [main], via: null },
  );
  return {
    main,
    text: p.text,
    segments: p.segments,
    missing: p.missing,
  };
}

/** Where a span of the assembled text stands: in which file, at which offsets, and via which include. */
export interface Origin {
  readonly file: string;
  /** The whole text of `file`. */
  readonly source: string;
  readonly span: Span;
  readonly via: Span | null;
}

/**
 * The origin of `span` of the assembled text: the file of its first character. A span that runs
 * past that file's stretch is cut at its end — a sentence cannot point into two files.
 */
export function originOf(p: PaperSource, span: Span): Origin | null {
  // The character at `start`; an empty span at the very end belongs to the last stretch.
  const seg =
    p.segments.find((s) => span.start >= s.start && span.start < s.end) ??
    p.segments.find((s) => span.start === s.end);
  if (seg === undefined) return null;
  const end = Math.min(span.end, seg.end);
  return {
    file: seg.file,
    source: seg.source,
    span: {
      start: seg.from + span.start - seg.start,
      end: seg.from + end - seg.start,
    },
    via: seg.via,
  };
}
