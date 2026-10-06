/**
 * The entries of a BibTeX text, found the way bibtex 0.99 finds them — measured, not remembered
 * (fixtures/paper-sources/v5-percent-entry, and the probes recorded in the tests):
 *
 *   - outside an entry everything is junk until the next `@`; there is NO comment character, so
 *     `% @misc{dead2020,…}` is an entry bibtex reads, and its `%` is reported as such (`percent`);
 *   - `@type{key, …}` and `@type(key, …)` end at the matching brace or parenthesis; an `@` inside
 *     an entry is text;
 *   - `@string` and `@preamble` are commands, not entries; `@comment` is skipped as a WORD, so its
 *     braces are junk and an entry written inside them is read;
 *   - an entry that is never closed is not read.
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
      /** `}` or `)`, and how many braces are open inside. */
      readonly close: string;
      readonly depth: number;
      readonly record: boolean;
      readonly skipTo: number;
    };

interface Scan {
  readonly mode: Mode;
  readonly found: readonly Omit<BibEntry, "percent">[];
}

const JUNK: Mode = { kind: "junk", skipTo: 0 };

/** An `@` in junk: the entry it opens, or junk again when nothing an entry needs follows. */
function opened(text: string, at: number): Mode {
  const m = HEAD.exec(text.slice(at, at + HEAD_WINDOW));
  const [whole = "", raw = "", delim = "{", key = ""] = m ?? [];
  const type = raw.toLowerCase();
  if (m === null || type === "comment")
    return { kind: "junk", skipTo: at + 1 + raw.length };
  return {
    kind: "entry",
    at,
    type,
    key,
    close: delim === "{" ? "}" : ")",
    depth: 0,
    record: type !== "string" && type !== "preamble",
    // Past the opening delimiter, which the scan must not count as a brace of the entry's own.
    skipTo: at + whole.length - key.length,
  };
}

/** One delimiter inside an entry: deeper, shallower, or the close that ends it. */
function inEntry(
  e: Extract<Mode, { kind: "entry" }>,
  c: string,
  i: number,
): Scan {
  const none: Scan["found"] = [];
  if (c === "{") return { mode: { ...e, depth: e.depth + 1 }, found: none };
  if (c === "}" && e.depth > 0)
    return { mode: { ...e, depth: e.depth - 1 }, found: none };
  if (c !== e.close || e.depth > 0) return { mode: e, found: none };
  const span = { start: e.at, end: i + 1 };
  return {
    mode: { kind: "junk", skipTo: i + 1 },
    found: e.record ? [{ type: e.type, key: e.key, span }] : none,
  };
}

/** The `%` run alone before `at` on its line, inside `body` — or null. */
function percentBefore(text: string, at: number, body: Span): Span | null {
  const lineStart = Math.max(text.lastIndexOf("\n", at - 1) + 1, body.start);
  const m = /^([ \t]*)(%[% \t]*?)[ \t]*$/.exec(text.slice(lineStart, at));
  if (m === null) return null;
  const [, lead = "", run = ""] = m;
  const start = lineStart + lead.length;
  return { start, end: start + run.length };
}

/** The entries of `text` within `body`, in order. */
export function bibEntries(text: string, body: Span): readonly BibEntry[] {
  const marks = [...text.slice(body.start, body.end).matchAll(/[@{}()]/g)];
  const { found } = marks.reduce<Scan>(
    (s, m) => {
      const i = body.start + m.index;
      if (i < s.mode.skipTo) return s;
      const step: Scan =
        s.mode.kind === "junk"
          ? { mode: m[0] === "@" ? opened(text, i) : s.mode, found: [] }
          : inEntry(s.mode, m[0], i);
      return { mode: step.mode, found: [...s.found, ...step.found] };
    },
    { mode: JUNK, found: [] },
  );
  return found.map((e) => ({
    ...e,
    percent: percentBefore(text, e.span.start, body),
  }));
}

/** A whole `.bib` file as a `BibText`. */
export const bibFileText = (path: AbsolutePath, text: string): BibText => {
  const body = { start: 0, end: text.length };
  return { path, text, body, entries: bibEntries(text, body) };
};
