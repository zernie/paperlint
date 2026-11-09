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

/** What the walk keeps: the lists closed so far, and the one still open (empty when none is). */
interface Walk {
  readonly done: readonly (readonly Reference[])[];
  readonly current: readonly Reference[];
}

/** The walk with its open list closed. */
const closed = (w: Walk): Walk => ({
  done: w.current.length > 0 ? [...w.done, w.current] : w.done,
  current: [],
});

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
  const end = passage.pieces.reduce<Walk>(
    (w, p) => {
      if (p.kind === "text") return joins(p.segment.text) ? w : closed(w);
      const m = p.kind === "owner" ? macros.get(p.span.start) : undefined;
      return p.kind === "owner" && m !== undefined
        ? { ...w, current: [...w.current, ...referencesOf(m, p.span)] }
        : closed(w);
    },
    { done: [], current: [] },
  );
  return closed(end).done;
}

/** Every reference list of the body's prose with at least two references, in document order. */
export function refListsOf(t: ParsedTex): readonly RefList[] {
  const macros = macrosByStart(t);
  return bodyProse(t)
    .flatMap((p) => listsIn(p, macros))
    .filter((l) => l.length >= 2);
}
