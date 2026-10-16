/**
 * WHAT THE PAPER SAYS OF ITS STUDIES' MODES — judged against the registry. A paragraph is linked to a
 * study by a comment on one of its lines, `% study: P1-S03` (several ids: `% study: P1-S03, P1-S04`):
 * invisible in the PDF, kept in the source, and the only link from a number in the text to the study
 * that produced it — paperlint had none before (docs/design/sealed-studies.md, "The paper side").
 *
 *   paper/study-mode-claim  (error) a linked paragraph calls its study pre-registered, decided before
 *                           its run, or blind, when the study is exploratory, declares no mode, or is
 *                           decided first but its history does not show the order; and a link to an
 *                           id the registry does not hold. An overclaim is the dangerous direction.
 *   paper/study-mode-stated (warn)  a linked paragraph states a number from an exploratory study and
 *                           never says "exploratory".
 *
 * A paragraph with no link is not judged: the rules cannot know which study its words are about. Pure.
 */
import { runOf } from "./sentences.ts";
import { runText, spanIn, type Passage, type Span } from "./tex-document.ts";

/** A `% study:` comment: the id it names, where the comment starts. */
export interface StudyMark {
  readonly id: string;
  readonly at: number;
}

/** What the registry, the plan and the history say of one study, as far as the text's claims go. */
export type StudyStanding =
  /** Decided before its run; `shown`: its history shows the decision first (or cannot be read). */
  | { readonly kind: "decided"; readonly shown: boolean }
  | { readonly kind: "blind" }
  | { readonly kind: "exploratory"; readonly reason: string }
  /** Registered, and its plan declares no mode. */
  | { readonly kind: "none" };

/** Why a claim overreaches. */
export type OverclaimWhy = "exploratory" | "no-mode" | "order-not-shown";

export type ClaimFinding =
  | {
      readonly problem: "unknown-study";
      readonly id: string;
      readonly at: number;
    }
  | {
      readonly problem: "overclaim";
      readonly id: string;
      readonly word: string;
      readonly why: OverclaimWhy;
      readonly at: Span | null;
    };

export interface LabelFinding {
  readonly problem: "unlabelled";
  readonly id: string;
  readonly number: string;
  readonly at: Span | null;
}

/** The words that claim a study was fixed before its outcomes were seen. */
const CLAIM =
  /(?<!\p{L})(?:pre-?regist(?:ered|ration)|decided\s+before|blind(?:ed)?)(?!\p{L})/giu;

/** The word that labels a result exploratory. */
const EXPLORATORY = /(?<!\p{L})exploratory(?!\p{L})/iu;

/**
 * A number a reader sees: digits not glued to a letter, a hyphen or a point, with an optional
 * decimal part and `%`; not a year. The same reading as `tex/claim-provenance`, without its owner test.
 */
const NUMBER =
  /(?<![\p{L}\p{N}_.,-])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?%)?(?![\p{L}\p{N}])/gu;
const YEAR = /^(?:19|20)\d\d$/u;

/** A linked paragraph: its passage, and the ids its marks name. */
interface Linked {
  readonly passage: Passage;
  readonly ids: readonly string[];
}

/** Where a passage's text starts and ends in the source. */
const extentOf = (p: Passage): Span => {
  const segments = runOf(p).segments;
  const last = segments.reduce((_, s) => s);
  return { start: segments[0].at, end: last.at + last.text.length };
};

/** The end of the last blank line before `at`, or 0. */
const blankBefore = (src: string, at: number): number =>
  [...src.slice(0, at).matchAll(/\n[ \t]*\n/gu)].reduce(
    (_, m) => m.index + m[0].length,
    0,
  );

/** Where the first blank line after `at` starts, or the end of `src`. */
const blankAfter = (src: string, at: number): number => {
  const i = src.slice(at).search(/\n[ \t]*\n/u);
  return i < 0 ? src.length : at + i;
};

/**
 * The paragraph each passage stands in: from the blank line before it to the blank line after it, so
 * a comment on its own line inside the paragraph counts — but never into a neighbouring passage.
 */
const regions = (
  src: string,
  passages: readonly Passage[],
): readonly {
  readonly passage: Passage;
  readonly from: number;
  readonly to: number;
}[] =>
  passages.map((passage, i) => {
    const e = extentOf(passage);
    const prev = passages[i - 1];
    const next = passages[i + 1];
    return {
      passage,
      from: Math.max(
        prev === undefined ? 0 : extentOf(prev).end,
        blankBefore(src, e.start),
      ),
      to: Math.min(
        next === undefined ? src.length : extentOf(next).start,
        blankAfter(src, e.end),
      ),
    };
  });

/** Each passage a mark stands in, with the ids its marks name; a mark in no passage links nothing. */
export const linked = (
  src: string,
  passages: readonly Passage[],
  marks: readonly StudyMark[],
): readonly Linked[] =>
  regions(src, passages).flatMap(({ passage, from, to }) => {
    const ids = [
      ...new Set(
        marks.filter((m) => m.at >= from && m.at < to).map((m) => m.id),
      ),
    ];
    return ids.length === 0 ? [] : [{ passage, ids }];
  });

/** Why a claim about a study of this standing overreaches; null when it does not. */
const overreach = (s: StudyStanding): OverclaimWhy | null => {
  switch (s.kind) {
    case "exploratory":
      return "exploratory";
    case "none":
      return "no-mode";
    case "decided":
      return s.shown ? null : "order-not-shown";
    case "blind":
      return null;
  }
};

/** Every claim word of a linked paragraph about a study it overreaches for, at the word. */
const overclaimsIn = (
  l: Linked,
  standings: ReadonlyMap<string, StudyStanding>,
): readonly ClaimFinding[] => {
  const run = runOf(l.passage);
  const words = [...runText(run).matchAll(CLAIM)];
  return l.ids.flatMap((id) => {
    const s = standings.get(id);
    const why = s === undefined ? null : overreach(s);
    return why === null
      ? []
      : words.map((w) => ({
          problem: "overclaim",
          id,
          word: w[0],
          why,
          at: spanIn(run, w.index, w.index + w[0].length),
        }));
  });
};

/** Every overclaim, and every link to a study the registry does not hold. */
export const judgeClaims = (
  src: string,
  passages: readonly Passage[],
  marks: readonly StudyMark[],
  standings: ReadonlyMap<string, StudyStanding>,
): readonly ClaimFinding[] => [
  ...marks
    .filter((m) => !standings.has(m.id))
    .map((m): ClaimFinding => ({
      problem: "unknown-study",
      id: m.id,
      at: m.at,
    })),
  ...linked(src, passages, marks).flatMap((l) => overclaimsIn(l, standings)),
];

/** The first number of `text` that is a quantity, with where it stands; null when none. */
const firstNumber = (
  text: string,
): { readonly n: string; readonly at: number } | null => {
  const m = [...text.matchAll(NUMBER)].find((x) => !YEAR.test(x[0]));
  return m === undefined ? null : { n: m[0], at: m.index };
};

/** Every linked paragraph that states a number from an exploratory study without saying "exploratory". */
export const judgeLabels = (
  src: string,
  passages: readonly Passage[],
  marks: readonly StudyMark[],
  standings: ReadonlyMap<string, StudyStanding>,
): readonly LabelFinding[] =>
  linked(src, passages, marks).flatMap((l) => {
    const run = runOf(l.passage);
    const text = runText(run);
    const num = firstNumber(text);
    if (num === null || EXPLORATORY.test(text)) return [];
    return l.ids
      .filter((id) => standings.get(id)?.kind === "exploratory")
      .map((id) => ({
        problem: "unlabelled",
        id,
        number: num.n.replace(/\s/gu, ""),
        at: spanIn(run, num.at, num.at + num.n.length),
      }));
  });
