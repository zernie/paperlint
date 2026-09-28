/**
 * The sentences of body prose — one splitter, so every rule that counts or judges sentences cuts
 * them the same way (`tex/claim-provenance` judges each; `tex/register` counts them).
 *
 * A passage becomes one text: its prose as itself, and each mark (a citation, a cross-reference) or
 * math as one character no prose contains, where it stands. `Intl.Segmenter` cuts that text; a break
 * after an abbreviation is undone, and marks set right after a full stop belong to the sentence the
 * full stop ends.
 */
import type { Passage, ProsePiece, Segment, TextRun } from "./tex-document.ts";

/** What stands in a sentence's text for a mark: characters no prose contains (private use). */
export const CITATION = "";
export const REFERENCE = "";
export const MATH = "";

/** A piece as the text of its sentence sees it: text as itself, a mark or math as one character. */
export function segmentOf(p: ProsePiece): Segment {
  switch (p.kind) {
    case "text":
      return p.segment;
    case "owner":
      return {
        text: p.owner === "citation" ? CITATION : REFERENCE,
        at: p.span.start,
      };
    case "math":
      return { text: MATH, at: p.span.start };
  }
}

/** A passage as one run of text, each mark a character where it stands. */
export const runOf = (p: Passage): TextRun => {
  const [first, ...rest] = p.pieces;
  return { segments: [segmentOf(first), ...rest.map(segmentOf)] };
};

/** An abbreviation whose full stop does not end a sentence, at the end of a segment. */
const ABBREVIATION =
  /(?:^|[^\p{L}])(?:e\.g|i\.e|cf|vs|et al|Figs?|Secs?|Tab|Eqs?|No|App|approx|resp)\.\s*$/u;

const SEGMENTER = new Intl.Segmenter("en", { granularity: "sentence" });

/** Marks, and the spaces among them, that open a segment: a `\cite` or a footnote set after the full stop. */
const LEADING_MARKS = /^[\s]*[]/u;

/** `[from, to)` of a text. */
export type Range = readonly [number, number];

/**
 * The sentences of `text`, as `[from, to)` ranges. A break after an abbreviation is undone, and
 * marks standing right after a full stop belong to the sentence the full stop ends.
 */
export function sentences(text: string): readonly Range[] {
  return [...SEGMENTER.segment(text)].reduce<readonly Range[]>((acc, s) => {
    const prev = acc.at(-1);
    const end = s.index + s.segment.length;
    if (prev === undefined) return [[s.index, end]];
    const before = acc.slice(0, -1);
    if (ABBREVIATION.test(text.slice(...prev)))
      return [...before, [prev[0], end]];
    const split = s.index + (LEADING_MARKS.exec(s.segment)?.[0].length ?? 0);
    return split < end
      ? [...before, [prev[0], split], [split, end]]
      : [...before, [prev[0], end]];
  }, []);
}
