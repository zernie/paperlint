/** The text a reader sees, each character with the source offset it came from. */
import { hasAtLeast, sortBy } from "remeda";
import type { Segment, TextRun } from "../../domain/tex-document.ts";
import { isUnrendered } from "./hidden.ts";
import {
  isList,
  stringText,
  visited,
  type Argument,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

/** A node's rendered text and where it starts, or null when it is not text (it ends a run). */
function segmentOf(n: Node | Argument): Segment | null {
  const at = n.position?.start.offset;
  if (at === undefined) return null;
  if (n.type === "whitespace" || n.type === "parbreak")
    return { text: " ", at };
  if (n.type !== "string") return null;
  return { text: stringText(n.content), at };
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
 * sees (`isUnrendered`): comments, math, code, the bibliography, keys and URLs. A macro definition's
 * body is read where it is written.
 */
export const renderedRuns = (t: ParsedTex): readonly TextRun[] =>
  sortBy(
    visited(t.root, isUnrendered).filter(isList).flatMap(runsOf),
    (r) => r.segments[0].at,
  );
