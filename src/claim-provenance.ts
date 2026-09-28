/**
 * `tex/claim-provenance` — a sentence of the body that states a number says whose the number is.
 *
 *   warn  a sentence with a number and none of: a citation or a link, the authors (we, our, us), a
 *        place in the paper (`\ref` and its kin, "Section 3", "Table 2", "Appendix B", "§4"), or the
 *        sample it counts ("n = 134", "48 runs", "of 1,836 repositories")
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────
 * A reviewer who cannot tell a property of the world from a cited finding from the authors' own
 * measurement writes exactly that, and it costs the paper its soundness score. Standard academic
 * prose carries the owner by default ("we found", "[12] report"); prose pushed toward a punchy
 * register drops it first. The owner is a fact about the sentence, so a rule can ask for it.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`): the parse tree of `paper.tex`,
 * never a search of its source. Citations, links and cross-references arrive as marks, math as math.
 * The only text matched here is the rendered prose of one sentence — one lexeme at a time: a number,
 * a pronoun, a word such as "Table" followed by its number, a count followed by what it counts.
 *
 * ── WHAT IT CANNOT KNOW ──────────────────────────────────────────────────────────
 * Whether an owner is the RIGHT one (a citation that does not say the number, a "we" in a sentence
 * about someone else), what a custom macro prints, or which numbers are names ("Claude 3"). A year
 * alone (1900–2099) is read as a date, and a digit glued to a letter or a hyphen ("GPT-4", "10k") as
 * part of a name. Warn, never error: it asks the question; the author answers it.
 */
import type { LatexReader } from "./ports/latex.ts";
import {
  runText,
  spanIn,
  type Passage,
  type ProsePiece,
  type Segment,
  type TextRun,
} from "./domain/tex-document.ts";
import {
  reportAll,
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

/** What stands in a sentence's text for a mark: characters no prose contains (private use). */
const CITATION = "";
const REFERENCE = "";
const MATH = "";

/** A piece as the text of its sentence sees it: text as itself, a mark or math as one character. */
function segmentOf(p: ProsePiece): Segment {
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
const runOf = (p: Passage): TextRun => {
  const [first, ...rest] = p.pieces;
  return { segments: [segmentOf(first), ...rest.map(segmentOf)] };
};

/** An abbreviation whose full stop does not end a sentence, at the end of a segment. */
const ABBREVIATION =
  /(?:^|[^\p{L}])(?:e\.g|i\.e|cf|vs|et al|Figs?|Secs?|Tab|Eqs?|No|App|approx|resp)\.\s*$/u;

const SEGMENTER = new Intl.Segmenter("en", { granularity: "sentence" });

/** Marks, and the spaces among them, that open a segment: a `\cite` or a footnote set after the full stop. */
const LEADING_MARKS = /^[\s\uE000\uE001]*[\uE000\uE001]/u;

type Range = readonly [number, number];

/**
 * The sentences of `text`, as `[from, to)` ranges. A break after an abbreviation is undone, and
 * marks standing right after a full stop belong to the sentence the full stop ends.
 */
function sentences(text: string): readonly Range[] {
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

/**
 * A number a reader sees: digits not glued to a letter, a hyphen or a point before them (a name, a
 * version, a decimal without its zero), with an optional decimal part and a `%` or `×` after them,
 * and no letter or digit after that.
 */
const NUMBER =
  /(?<![\p{L}\p{N}_.,-])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?%|×|x)?(?![\p{L}\p{N}])/gu;

/** A plain year, read as a date rather than a quantity. */
const YEAR = /^(?:19|20)\d\d$/u;

const FIRST_PERSON = /(?<!\p{L})(?:we|our|ours|us|ourselves)(?!\p{L})/giu;

/** A place in the paper named in words: "Section 4", "Table 2", "Fig. 3", "Appendix B", "§4". */
const PLACE =
  /(?<!\p{L})(?:Sections?|Sec\.|§|Tables?|Tab\.|Figures?|Figs?\.|Appendix|Appendices|App\.|Listings?|Algorithms?|Equations?|Eqs?\.|Chapters?)\s*(?:\d|[A-Z](?!\p{L}))/u;

/** "n = 134", in prose or in math. */
const SAMPLE_SIZE = /(?<![\p{L}\\])[nN]\s*=\s*\d/u;

/** A count followed by what it counts: "48 runs", "1,836 repositories", "48 independent runs". */
const COUNT =
  /(?<![\p{L}\p{N}.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?![.,]?\d)\s+(?:\p{Ll}+\s+)?\p{Ll}+s(?!\p{L})/u;

/** The first number in `s` that is a quantity, or undefined. */
const quantityIn = (s: string): string | undefined =>
  [...s.matchAll(NUMBER)].map((m) => m[0]).find((n) => !YEAR.test(n));

/** Whether a sentence says whose its number is. `maths` is the source of its math. */
const isOwned = (s: string, maths: readonly string[]): boolean =>
  s.includes(CITATION) ||
  s.includes(REFERENCE) ||
  [...s.matchAll(FIRST_PERSON)].some((m) => m[0] !== "US") ||
  PLACE.test(s) ||
  SAMPLE_SIZE.test(s) ||
  COUNT.test(s) ||
  maths.some((m) => SAMPLE_SIZE.test(m));

/** Each piece of a passage with the offset where it starts in the passage's text. */
const laidOut = (
  p: Passage,
): readonly { readonly from: number; readonly piece: ProsePiece }[] =>
  p.pieces.reduce<{
    readonly laid: readonly {
      readonly from: number;
      readonly piece: ProsePiece;
    }[];
    readonly next: number;
  }>(
    (acc, piece) => ({
      laid: [...acc.laid, { from: acc.next, piece }],
      next: acc.next + segmentOf(piece).text.length,
    }),
    { laid: [], next: 0 },
  ).laid;

/** The source of the math that starts inside `[from, to)` of the passage's text. */
const mathsIn = (
  laid: ReturnType<typeof laidOut>,
  from: number,
  to: number,
): readonly string[] =>
  laid.flatMap(({ from: at, piece }) =>
    piece.kind === "math" && at >= from && at < to ? [piece.tex] : [],
  );

/** Every unowned sentence of one passage that states a number, spanning its source. */
function judgePassage(p: Passage): readonly Located[] {
  const run = runOf(p);
  const text = runText(run);
  const laid = laidOut(p);
  return sentences(text).flatMap(([from, to]) => {
    const s = text.slice(from, to);
    const number = quantityIn(s);
    if (number === undefined || isOwned(s, mathsIn(laid, from, to))) return [];
    const lead = s.length - s.trimStart().length;
    const trail = s.length - s.trimEnd().length;
    return [
      {
        messageId: "noOwner",
        data: { number: number.replace(/\s/gu, "") },
        at: spanIn(run, from + lead, to - trail),
      },
    ];
  });
}

/** Every sentence of the body that states a number and does not say whose it is. */
export const judgeClaimProvenance = (
  passages: readonly Passage[],
): readonly Located[] => passages.flatMap(judgePassage);

const META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a sentence of the body that states a number says whose it is: a citation, the authors, a place in the paper, or the sample it counts",
    url: ruleDocsUrl("claim-provenance"),
  },
  schema: [],
  messages: {
    noOwner:
      "«{{number}}» — whose number is this? A reader cannot tell a cited finding from your own measurement from a general fact. Say it in the sentence: cite the work (\\cite), claim it (we measured, our census), point to where it is shown (\\ref, Section N, Table N), or name the sample it counts (n = 134, 48 runs)",
  },
};

/** The rule, over the body's prose as the LaTeX reader gives it. */
export const claimProvenanceRule = (latex: LatexReader): TexRuleModule => ({
  meta: META,
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        reportAll(
          context,
          judgeClaimProvenance(latex.bodyProse(sc.raw ?? sc.text)),
        );
      },
    };
  },
});
