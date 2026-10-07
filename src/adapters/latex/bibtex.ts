/**
 * The entries of a BibTeX text, found the way bibtex 0.99 finds them — measured, not remembered
 * (fixtures/paper-sources/v5-percent-entry, and the probes recorded in the tests):
 *
 *   - outside an entry everything is junk until the next `@`; there is NO comment character, so
 *     `% @misc{dead2020,…}` is an entry bibtex reads, and its `%` is reported as such (`percent`);
 *   - `@type{key, …}` and `@type(key, …)` end at the matching brace or parenthesis; an `@` inside
 *     an entry is text;
 *   - a `"` at brace depth 0 opens or closes a quoted value; inside it `@` and `)` are text, braces
 *     still nest, and a `"` inside braces is a character (`note = "x {"} y"`); a quote left open
 *     runs to the end of the file. A `}` at depth 0 ends the entry even inside quotes or in a
 *     `(…)` entry — bibtex reports unbalanced braces and skips the rest of the entry;
 *   - `@string` and `@preamble` are commands, not entries (`commands`); `@comment` is skipped as a WORD, so its
 *     braces are junk and an entry written inside them is read (the word is named, `comments`, so a
 *     parser that would skip the braces can be shown what bibtex reads);
 *   - an entry left open — never closed, or a field whose brace is never closed — is read with what
 *     it has, and the next `@` at brace depth 0 starts the next entry; an `@` inside a field, at any
 *     depth above 0, is text, even at the start of a line;
 *   - an `@` right after a comma, where bibtex expects a field name, is an error that bibtex skips
 *     together with the entry it would start, reading on from the next `@`.
 *
 * Measured and NOT modelled: an entry bibtex reaches by recovering at such an `@` is dropped when
 * nothing follows it in the file (design doc §9). This reader keeps it — one entry too many,
 * never one too few.
 *
 * Only where entries are, their type and key: the fields are read by the consumers that need them
 * (`@retorquere/bibtex-parser` in extract-ref-facts, bib-authors' own reader).
 */
import type { BibEntry, BibText } from "../../domain/paper-sources.ts";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Span } from "../../domain/tex-document.ts";

/** `@`, an entry type, the delimiter that opens it, and the key after it. */
const HEAD = /^@\s*([^\s{}(),=#%"]+)\s*([{(])\s*([^,\s})]*)/;
/** How far past an `@` its head is looked for: a type, a delimiter and a key are short. */
const HEAD_WINDOW = 512;

/** Where the scan stands: in junk, or inside an entry opened at `open`. */
type Mode =
  | { readonly kind: "junk"; readonly skipTo: number }
  | {
      readonly kind: "entry";
      readonly at: number;
      readonly type: string;
      readonly key: string;
      /** `}` or `)`, how many braces are open inside, and whether a quoted value is open. */
      readonly close: string;
      readonly depth: number;
      readonly quoted: boolean;
      readonly skipTo: number;
    };

interface Scan {
  readonly mode: Mode;
  readonly found: readonly Omit<BibEntry, "percent">[];
  /** The `@comment` words bibtex skips. */
  readonly comments: readonly Span[];
}

const JUNK: Mode = { kind: "junk", skipTo: 0 };
const NONE: Scan["found"] = [];

/** An `@` in junk: the entry it opens, or junk again when nothing an entry needs follows. */
function opened(text: string, at: number): Omit<Scan, "found"> {
  const m = HEAD.exec(text.slice(at, at + HEAD_WINDOW));
  const [whole = "", raw = "", delim = "{", key = ""] = m ?? [];
  const type = raw.toLowerCase();
  const word = { start: at, end: at + whole.indexOf(raw) + raw.length };
  if (m === null)
    return { mode: { kind: "junk", skipTo: at + 1 }, comments: [] };
  if (type === "comment")
    return { mode: { kind: "junk", skipTo: word.end }, comments: [word] };
  return {
    mode: {
      kind: "entry",
      at,
      type,
      key,
      close: delim === "{" ? "}" : ")",
      depth: 0,
      quoted: false,
      // Past the opening delimiter, which the scan must not count as a brace of the entry's own.
      skipTo: at + whole.length - key.length,
    },
    comments: [],
  };
}

type Entry = Extract<Mode, { kind: "entry" }>;

/** The entry or command as read so far, ending at `end`. */
const recorded = (e: Entry, end: number): Scan["found"] => [
  { type: e.type, key: e.key, span: { start: e.at, end } },
];

/** `@string` and `@preamble` are commands bibtex runs, not entries. */
const isCommand = (e: Omit<BibEntry, "percent">): boolean =>
  e.type === "string" || e.type === "preamble";

/** The last character before `i` that is not white space. */
const before = (text: string, i: number): string =>
  text.slice(0, i).trimEnd().slice(-1);

/**
 * An `@` at depth 0 inside an open entry: bibtex reports the entry, keeps what it read, and starts
 * the next one there — unless it was expecting a field name (after a comma), when the `@` and what it
 * starts are skipped.
 */
function resync(text: string, e: Entry, i: number): Scan {
  const found = recorded(e, i);
  if (before(text, i) === ",")
    return { mode: { kind: "junk", skipTo: i + 1 }, found, comments: [] };
  return { ...opened(text, i), found };
}

/** A quote, or a brace that nests: the entry with it, or null for a mark that is none of them. */
function nested(e: Entry, c: string): Entry | null {
  if (c === '"') return e.depth === 0 ? { ...e, quoted: !e.quoted } : e;
  if (c === "{") return { ...e, depth: e.depth + 1 };
  return c === "}" && e.depth > 0 ? { ...e, depth: e.depth - 1 } : null;
}

/** One mark inside an entry: a quote or a brace, an `@`, or a close that ends it. */
function inEntry(text: string, e: Entry, c: string, i: number): Scan {
  const same = (mode: Mode): Scan => ({ mode, found: NONE, comments: [] });
  const inner = nested(e, c);
  if (inner !== null) return same(inner);
  const outside = e.depth === 0 && !e.quoted;
  if (c === "@") return outside ? resync(text, e, i) : same(e);
  // A `}` at depth 0 ends the entry, its own close or not; a `)` only when it is the close.
  if (c !== "}" && (c !== e.close || !outside)) return same(e);
  return {
    mode: { kind: "junk", skipTo: i + 1 },
    found: recorded(e, i + 1),
    comments: [],
  };
}

/**
 * The `%` before `at` on its line, and everything from it to the `@` — what LaTeX hides and bibtex
 * reads past (`% @misc{…}`, `% see @misc{…}`) — or null when the line has no `%` before the entry.
 */
function percentBefore(text: string, at: number, body: Span): Span | null {
  const lineStart = Math.max(text.lastIndexOf("\n", at - 1) + 1, body.start);
  const pct = text.indexOf("%", lineStart);
  return pct < 0 || pct >= at ? null : { start: pct, end: at };
}

/** What a scan of `text` within `body` found: the entries in order, and the `@comment` words. */
function scanned(text: string, body: Span): Omit<Scan, "mode"> {
  const marks = [...text.slice(body.start, body.end).matchAll(/[@{}()"]/g)];
  const end = marks.reduce<Scan>(
    (s, m) => {
      const i = body.start + m.index;
      if (i < s.mode.skipTo) return s;
      const step =
        s.mode.kind === "junk"
          ? m[0] === "@"
            ? { ...opened(text, i), found: NONE }
            : { mode: s.mode, found: NONE, comments: [] }
          : inEntry(text, s.mode, m[0], i);
      return {
        mode: step.mode,
        found: [...s.found, ...step.found],
        comments: [...s.comments, ...step.comments],
      };
    },
    { mode: JUNK, found: [], comments: [] },
  );
  // An entry still open at the end of the text is read with what it has.
  const last = end.mode.kind === "entry" ? recorded(end.mode, body.end) : NONE;
  return { found: [...end.found, ...last], comments: end.comments };
}

/** A database's bytes, `body` of `text` in the file at `path`, as bibtex reads them. */
export function bibText(path: AbsolutePath, text: string, body: Span): BibText {
  const { found, comments } = scanned(text, body);
  // A `%` counts only after the entry or command before it on the same line: `title={50%}} @misc{…}`
  // is no comment.
  const entries = found
    .map((e, i) => ({
      ...e,
      percent: percentBefore(text, e.span.start, {
        start: Math.max(body.start, found[i - 1]?.span.end ?? body.start),
        end: body.end,
      }),
    }))
    .filter((e) => !isCommand(e));
  const commands = found.filter(isCommand).map((e) => e.span);
  return { path, text, body, entries, commands, comments };
}

/** A whole `.bib` file as a `BibText`. */
export const bibFileText = (path: AbsolutePath, text: string): BibText =>
  bibText(path, text, { start: 0, end: text.length });
