/**
 * The labels a pdflatex `.aux` defines, and what each prints where it is referenced.
 *
 * LaTeX writes one `\newlabel` line per label, a key and a group of fields. Captured from TeX Live
 * 2026 (test/fixtures/tex-output/ref-list-include/):
 *
 *   \newlabel{sec:check}{{\mbox  {II-A}}{2}{Check}{subsection.2.1}{}}
 *   \newlabel{sec:check@cref}{{[subsection][1][2]\mbox  {II-A}}{[1][2][]2}{}{}{}}
 *
 * The first field is what `\ref` prints; the fourth, the anchor, names the counter before its first
 * dot (the kernel writes it with or without hyperref; an older one wrote two fields only). cleveref
 * adds a `<key>@cref` line whose first field opens with the kind in brackets: the kind `\cref` prints,
 * read before the anchor's. `\include` writes its file's labels into an aux of its own, which the main
 * one names in an `\@input` line, followed here once per name.
 *
 * Line reading is legitimate here for the reason `src/latex-log.ts` gives: TeX writes one command per
 * line, and these commands always start one.
 */
import { collapse } from "../../domain/tex-document.ts";
import type { Labels, PrintedLabel } from "../../domain/cross-references.ts";

/** Where a walk over a `{…}{…}` string stands. */
interface Groups {
  readonly found: readonly string[];
  readonly current: string;
  readonly depth: number;
  readonly escaped: boolean;
  readonly done: boolean;
}

/** One character of a group walk. A brace after a backslash is a character, not a delimiter. */
function groupStep(g: Groups, ch: string): Groups {
  if (g.done) return g;
  const escaped = !g.escaped && ch === "\\";
  if (g.escaped || (ch !== "{" && ch !== "}"))
    return g.depth === 0
      ? { ...g, done: true }
      : { ...g, current: g.current + ch, escaped };
  if (ch === "{")
    return g.depth === 0
      ? { ...g, depth: 1, current: "" }
      : { ...g, depth: g.depth + 1, current: `${g.current}{` };
  return g.depth === 1
    ? { ...g, depth: 0, found: [...g.found, g.current] }
    : { ...g, depth: g.depth - 1, current: `${g.current}}` };
}

/** The balanced `{…}` groups that open `s`, in order, up to the first character outside one. */
export const groups = (s: string): readonly string[] =>
  Array.from(s).reduce(groupStep, {
    found: [],
    current: "",
    depth: 0,
    escaped: false,
    done: false,
  }).found;

/** A field as the reader sees it: `\mbox` and braces dropped, spaces collapsed (`\mbox  {II-A}` → `II-A`). */
const shown = (field: string): string =>
  collapse(
    field.replaceAll("\\mbox", "").replaceAll("{", "").replaceAll("}", ""),
  );

/** What one aux line says about a label: what it prints, or the kind cleveref gives it. */
type Line =
  | {
      readonly kind: "label";
      readonly key: string;
      readonly number: string;
      readonly counter: string | null;
    }
  | { readonly kind: "cref"; readonly key: string; readonly type: string };

const CREF = "@cref";
const NEWLABEL = "\\newlabel";
const INPUT = "\\@input";

/** The counter an anchor names: `subsection.2.1` → `subsection`; null for none. */
const counterOf = (anchor: string | undefined): string | null => {
  const counter = anchor?.split(".")[0] ?? "";
  return counter === "" ? null : counter;
};

/** A `\newlabel` line, read; null for any other line, or one too short to say anything. */
function newlabel(line: string): Line | null {
  if (!line.startsWith(`${NEWLABEL}{`)) return null;
  const [key, body] = groups(line.slice(NEWLABEL.length));
  if (key === undefined || body === undefined) return null;
  const fields = groups(body);
  const first = fields[0];
  if (first === undefined) return null;
  if (!key.endsWith(CREF))
    return {
      kind: "label",
      key,
      number: shown(first),
      counter: counterOf(fields[3]),
    };
  const close = first.indexOf("]");
  return first.startsWith("[") && close > 1
    ? {
        kind: "cref",
        key: key.slice(0, -CREF.length),
        type: first.slice(1, close),
      }
    : null;
}

/** What a walk over an aux tree has read: its lines in order, and the nested files it opened. */
interface Read {
  readonly lines: readonly Line[];
  readonly seen: readonly string[];
}

/** The lines of `aux`, a nested aux's read where its `\@input` stands, once per name. */
function readAux(
  aux: string,
  readInput: (name: string) => string | null,
  seen: readonly string[],
): Read {
  return aux.split("\n").reduce<Read>(
    (acc, raw) => {
      const line = raw.trim();
      const label = newlabel(line);
      if (label !== null) return { ...acc, lines: [...acc.lines, label] };
      const name = line.startsWith(`${INPUT}{`)
        ? groups(line.slice(INPUT.length))[0]
        : undefined;
      if (name === undefined || acc.seen.includes(name)) return acc;
      const text = readInput(name);
      const opened = [...acc.seen, name];
      if (text === null) return { ...acc, seen: opened };
      const nested = readAux(text, readInput, opened);
      return { lines: [...acc.lines, ...nested.lines], seen: nested.seen };
    },
    { lines: [], seen },
  );
}

/** Every label of an aux tree; a label defined twice prints what its last line says, as in TeX. */
export function parseLabels(
  aux: string,
  readInput: (name: string) => string | null,
): Labels {
  const { lines } = readAux(aux, readInput, []);
  const types = new Map(
    lines.flatMap((l) => (l.kind === "cref" ? [[l.key, l.type] as const] : [])),
  );
  return new Map(
    lines.flatMap((l): readonly (readonly [string, PrintedLabel])[] =>
      l.kind === "label"
        ? [[l.key, { number: l.number, kind: types.get(l.key) ?? l.counter }]]
        : [],
    ),
  );
}
