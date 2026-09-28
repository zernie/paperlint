/** The text a reader sees, each character with the source offset it came from. */
import { hasAtLeast, sortBy } from "remeda";
import type { Segment, TextRun } from "../../domain/tex-document.ts";
import { isList, isNode, visited, type Node, type Argument } from "./nodes.ts";
import { KEY_SIGNATURES, type ParsedTex } from "./parse.ts";

/** Environments whose body is not text a reader sees as prose: code and the bibliography. */
const HIDDEN_ENVS: ReadonlySet<string> = new Set([
  "thebibliography",
  "verbatim",
  "Verbatim",
  "lstlisting",
  "minted",
  "comment",
]);

/** Node types a reader does not see as prose: comments, code, math. */
const HIDDEN_TYPES: ReadonlySet<Node["type"]> = new Set<Node["type"]>([
  "comment",
  "verbatim",
  "verb",
  "inlinemath",
  "displaymath",
  "mathenv",
]);

const KEY_MACROS: ReadonlySet<string> = new Set(Object.keys(KEY_SIGNATURES));

const isHidden = (n: Node): boolean =>
  HIDDEN_TYPES.has(n.type) ||
  (n.type === "environment" && HIDDEN_ENVS.has(n.env)) ||
  (n.type === "macro" && KEY_MACROS.has(n.content));

/** A node's rendered text and where it starts, or null when it is not text (it ends a run). */
function segmentOf(n: Node | Argument): Segment | null {
  const at = n.position?.start.offset;
  if (at === undefined) return null;
  if (n.type === "whitespace" || n.type === "parbreak")
    return { text: " ", at };
  if (n.type !== "string") return null;
  // A tie (`~`) is a space the reader sees.
  return { text: n.content === "~" ? " " : n.content, at };
}

/** One node list → its runs: stretches of sibling text, split wherever anything else stands. */
function runsOf(list: readonly (Node | Argument)[]): readonly TextRun[] {
  const { done, current } = list.reduce<{
    readonly done: readonly (readonly Segment[])[];
    readonly current: readonly Segment[];
  }>(
    (acc, n) => {
      const seg = segmentOf(n);
      return seg === null
        ? { done: [...acc.done, acc.current], current: [] }
        : { done: acc.done, current: [...acc.current, seg] };
    },
    { done: [], current: [] },
  );
  return [...done, current].flatMap((g) =>
    hasAtLeast(g, 1) &&
    g
      .map((x) => x.text)
      .join("")
      .trim() !== ""
      ? [{ segments: g }]
      : [],
  );
}

/**
 * Runs of rendered text, in document order: stretches of sibling strings and spaces. Everything
 * else ends a run and is entered — a group's text, a macro's arguments — except what a reader never
 * sees: comments, math, code, the bibliography, and the arguments of `KEY_SIGNATURES`' macros.
 */
export const renderedRuns = (t: ParsedTex): readonly TextRun[] =>
  sortBy(
    visited(t.root, (n) => isNode(n) && isHidden(n))
      .filter(isList)
      .flatMap(runsOf),
    (r) => r.segments[0].at,
  );
