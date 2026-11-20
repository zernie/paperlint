/**
 * The sentences of body prose — one splitter, so every rule that counts or judges sentences cuts
 * them the same way (`tex/claim-provenance` judges each; `tex/register` counts them).
 *
 * A passage becomes one text: its prose as itself, and each mark (a citation, a cross-reference) or
 * math as one character no prose contains, where it stands. `Intl.Segmenter` cuts that text, and the
 * break it withholds before a sentence that opens in lowercase is put back; a break after an
 * abbreviation is undone, and marks set right after a full stop belong to the sentence the full stop
 * ends — unless a lowercase word follows them, which makes them the next sentence's subject.
 */
import { sortBy, unique } from "remeda";
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

/**
 * A full stop, the closing quotes after it and the spaces after those, when the next letter is
 * lowercase. Rule SB8 of UAX #29 withholds the break there, so `Intl.Segmenter` runs `16 GB. fp16
 * is …` into one sentence (#543); so it does when a mark, or a macro the reader leaves out, opens the
 * next sentence (`\citet{x} shows`). Between the spaces and that letter stands only what SB8 skips:
 * marks, math, digits, punctuation that ends no sentence. A bracket right after the full stop keeps
 * it inside the sentence (`(Disp.) is`).
 */
const LOWERCASE_OPENING = /\.['"’”]*\s+(?=[^\p{L}.!?]*\p{Ll})/gu;

/**
 * A full stop that ends no sentence before a lowercase word: a dotted abbreviation (`i.i.d.`,
 * `w.r.t.`, `Ph.D.`), an initial (`Y.`, the `P.` of `C.-P.`), an ellipsis, the short name of a
 * numbered thing (`Art. 5(c)`, `Eqn. 3`, `eq. 2`, `see refs. 4`), a company's (`Co.`, `Inc.`) or a
 * common truncation (`etc.`, `avg.`, `dim.`), or an inline enumerator (`cases: 1. the`, `and 2. the`,
 * `(1. parse`). Before a capital each of these may end a sentence, so the
 * segmenter's own breaks after them stay. Matched against the text up to and including the full
 * stop, at most `WINDOW` characters of it.
 */
const ABBREVIATION_BEFORE_LOWERCASE =
  /(?:\p{L}\.\p{L}{1,3}|(?:^|[^\p{L}])(?:\p{Lu}|Appx|Art|Def|Thm|Lem|Prop|Alg|Ch|Vol|pp|Refs?|Eqns?|eqn|eqs?|refs?|Co|Inc|Ltd|Corp|etc|avg|func|dim)|(?:^|[:;,(]\s*|\b(?:and|or)\s+)\d{1,2}|\.\.)\.$/u;

/** Enough text before a full stop to hold the longest abbreviation above and the character before it. */
const WINDOW = 8;

/**
 * Marks, and the spaces among them, that open a segment: a `\cite` or a footnote set after the full
 * stop — not when a lowercase word follows them, which makes them the subject of the sentence they open.
 */
const LEADING_MARKS = new RegExp(
  `^[\\s${CITATION}${REFERENCE}]*[${CITATION}${REFERENCE}](?![^\\p{L}.!?]*\\p{Ll})`,
  "u",
);

/** `[from, to)` of a text. */
export type Range = readonly [number, number];

/** Where `Intl.Segmenter` starts a sentence, and where it withheld a start before a lowercase word. */
const startsOf = (text: string): readonly number[] => {
  const segmented = [...SEGMENTER.segment(text)].map((s) => s.index);
  const withheld = [...text.matchAll(LOWERCASE_OPENING)].flatMap((m) =>
    ABBREVIATION_BEFORE_LOWERCASE.test(
      text.slice(Math.max(0, m.index + 1 - WINDOW), m.index + 1),
    )
      ? []
      : [m.index + m[0].length],
  );
  return sortBy(unique([...segmented, ...withheld]), (at) => at);
};

/**
 * The sentences of `text`, as `[from, to)` ranges. A break the segmenter withheld before a lowercase
 * word is put back, a break after an abbreviation is undone, and marks standing right after a full
 * stop belong to the sentence the full stop ends.
 */
export function sentences(text: string): readonly Range[] {
  const starts = startsOf(text);
  return starts.reduce<readonly Range[]>((acc, start, i) => {
    const end = starts[i + 1] ?? text.length;
    const prev = acc.at(-1);
    if (prev === undefined) return [[start, end]];
    const before = acc.slice(0, -1);
    if (ABBREVIATION.test(text.slice(...prev)))
      return [...before, [prev[0], end]];
    const split =
      start + (LEADING_MARKS.exec(text.slice(start, end))?.[0].length ?? 0);
    return split < end
      ? [...before, [prev[0], split], [split, end]]
      : [...before, [prev[0], end]];
  }, []);
}
