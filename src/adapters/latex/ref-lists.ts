/**
 * The reference lists of a source's running prose — `Sections~\ref{a}, \ref{b} and~\ref{c}` — for the
 * rule that one list must not print the same number twice (#447).
 *
 * A list is two or more references (`\ref`, `\autoref`, `\cref`, `\Cref`; `\cref{a,b}` is two) in the
 * same passage with nothing between them but commas, "and", "or" and spaces (a tie is a space): a
 * full stop, a word, a citation or math ends it, so a list never crosses a sentence. It is read from
 * the prose reader's passages, so a reference in a caption, a float or a table is in none.
 */
import type { Passage, RefList, Reference } from "../../domain/tex-document.ts";
import {
  inPlace,
  isNode,
  mandatory,
  placeOf,
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";
import { bodyProse } from "./prose.ts";

/** The reference commands whose number a list can repeat; `\eqref`, `\pageref`, `\nameref` print other things. */
const LISTED: ReadonlySet<string> = new Set(["ref", "autoref", "cref", "Cref"]);

/** The words that may join the references of one list. */
const JOINERS: ReadonlySet<string> = new Set(["and", "or"]);

/** The reference commands of the source, by where each starts. */
const macrosByStart = (t: ParsedTex): ReadonlyMap<number, Macro> =>
  new Map(
    visited(t.root, () => false)
      .filter(isNode)
      .flatMap((n) =>
        n.type === "macro" && LISTED.has(n.content)
          ? inPlace(placeOf(n), (span) => [[span.start, n] as const])
          : [],
      ),
  );

/** What the walk keeps: the lists so far, and whether the last piece still lets the last list grow. */
interface Walk {
  readonly lists: readonly (readonly Reference[])[];
  readonly open: boolean;
}

/** Whether a stretch of text only joins references: commas, spaces, "and", "or". */
const joins = (text: string): boolean =>
  text
    .split(",")
    .join(" ")
    .split(" ")
    .every((w) => w === "" || JOINERS.has(w));

/** A reference command's keys, each as a reference at the command's span. */
const referencesOf = (
  m: Macro,
  span: { readonly start: number; readonly end: number },
): readonly Reference[] =>
  textOf(mandatory(m).at(0)?.content)
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "")
    .map((key) => ({ macro: m.content, key, span }));

/** One passage's lists. */
function listsIn(
  passage: Passage,
  macros: ReadonlyMap<number, Macro>,
): readonly (readonly Reference[])[] {
  return passage.pieces.reduce<Walk>(
    (w, p) => {
      if (p.kind === "text")
        return joins(p.segment.text) ? w : { ...w, open: false };
      if (p.kind !== "owner") return { ...w, open: false };
      const m = macros.get(p.span.start);
      if (m === undefined) return { ...w, open: false };
      const refs = referencesOf(m, p.span);
      const grown =
        w.open && w.lists.length > 0
          ? [...w.lists.slice(0, -1), [...(w.lists.at(-1) ?? []), ...refs]]
          : [...w.lists, refs];
      return { lists: grown, open: true };
    },
    { lists: [], open: false },
  ).lists;
}

/** Every reference list of the body's prose with at least two references, in document order. */
export function refListsOf(t: ParsedTex): readonly RefList[] {
  const macros = macrosByStart(t);
  return bodyProse(t)
    .flatMap((p) => listsIn(p, macros))
    .filter((l) => l.length >= 2);
}
