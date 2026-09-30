/**
 * THE REGISTER OF A PAPER'S BODY, COUNTED — the measures the register rules judge, and the band a
 * venue's accepted papers set for each. Pure: passages and emphasised phrases in, counts out.
 *
 * Three measures, each per 10,000 words of the body, each read off the same passages and cut into
 * the same sentences as every other rule over the body (`sentences.ts`):
 *
 *   contrast_frames    a claim set against a rejected alternative: «X, not Y», «not X but Y»,
 *                      «X rather than Y», «instead of Y», «as opposed to Y»
 *   claim_emphasis     a phrase in bold INSIDE a sentence that states something: six words or more,
 *                      or holding a number — not a label opening a paragraph or an item, and not a
 *                      term of a few words
 *   relation_markers   a word that names how a sentence relates to the one before: because,
 *                      therefore, however, in contrast, for example, that is …
 *
 * ── THE BAND IS THE ANCHORS', NOT A CONSTANT ────────────────────────────────────
 * A venue preset records its anchors — accepted papers of the venue (or its parent conference),
 * each with its word count and its count of every measure, as these counters give them. The band
 * of a measure is the anchors' range, widened at each end by two Poisson standard deviations of
 * the anchor standing there: a paper of that anchor's length and register would fall outside it
 * about one time in forty. An anchor with no occurrence is widened as if it had one. Below zero is
 * zero. So every number a message names comes from the preset's anchors, and changing an anchor
 * changes the band.
 */
import type { Emphasis, Passage, Span, TextRun } from "./tex-document.ts";
import { runText, spanIn } from "./tex-document.ts";
import { CITATION, MATH, REFERENCE, runOf, sentences } from "./sentences.ts";

/** The measures a venue's anchors set a band for. */
export type RegisterMeasureName =
  "contrast_frames" | "claim_emphasis" | "relation_markers";

export const REGISTER_MEASURES: readonly RegisterMeasureName[] = [
  "contrast_frames",
  "claim_emphasis",
  "relation_markers",
];

/** One accepted paper of the venue, as the counters measured it. */
export interface RegisterAnchor {
  /** What the preset calls it: a directory under `fixtures/accepted-papers/`, or a citation. */
  readonly paper: string;
  readonly words: number;
  readonly counts: Readonly<Record<RegisterMeasureName, number>>;
}

/** How far the band reaches past the anchors: this many Poisson standard deviations. */
export const NOISE_SDS = 2;

/** The words a rate is taken over. */
export const PER = 10_000;

/** A rate per `PER` words; 0 for a body with no words. */
export const rateOf = (count: number, words: number): number =>
  words === 0 ? 0 : (PER * count) / words;

/** A measure's band, and the anchors' own range it was widened from. */
export interface Band {
  readonly min: number;
  readonly max: number;
  readonly anchorMin: number;
  readonly anchorMax: number;
  readonly anchors: number;
}

/** One anchor's rate of a measure, and how far one standard deviation of its count reaches. */
const anchorRate = (a: RegisterAnchor, m: RegisterMeasureName) => {
  const count = a.counts[m];
  return {
    rate: rateOf(count, a.words),
    sd: rateOf(Math.sqrt(Math.max(count, 1)), a.words),
  };
};

/** The band the anchors set for a measure; null when there are no anchors. */
export function bandOf(
  anchors: readonly RegisterAnchor[],
  m: RegisterMeasureName,
): Band | null {
  const rates = anchors.map((a) => anchorRate(a, m));
  const low = rates.reduce<(typeof rates)[number] | null>(
    (lo, r) => (lo === null || r.rate < lo.rate ? r : lo),
    null,
  );
  const high = rates.reduce<(typeof rates)[number] | null>(
    (hi, r) => (hi === null || r.rate > hi.rate ? r : hi),
    null,
  );
  if (low === null || high === null) return null;
  return {
    min: Math.max(0, low.rate - NOISE_SDS * low.sd),
    max: high.rate + NOISE_SDS * high.sd,
    anchorMin: low.rate,
    anchorMax: high.rate,
    anchors: anchors.length,
  };
}

// ── sentences, as every register measure reads them ───────────────────────────────

/** The characters a mark or math stands as in a sentence's text. */
const MARK = new RegExp(`[${CITATION}${REFERENCE}${MATH}]`, "gu");

const WORDS = new Intl.Segmenter("en", { granularity: "word" });

/** A sentence of the body: its text as the reader sees it, its words, its first word, where it stands. */
export interface BodySentence {
  /** The text with marks and math left out and spaces collapsed, for a message. */
  readonly text: string;
  /** The text with each mark and math as one character, for matching. */
  readonly raw: string;
  /** Its word-like words, and one for each mark or math, as it reads on the page. */
  readonly words: number;
  readonly first: string;
  /** The run it was cut from, and where in that run's text it starts. */
  readonly run: TextRun;
  readonly from: number;
}

/** The body's sentences that hold a word, in order. */
export function bodySentences(
  passages: readonly Passage[],
): readonly BodySentence[] {
  return passages.flatMap((p) => {
    const run = runOf(p);
    const text = runText(run);
    return sentences(text).flatMap(([from, to]) => {
      const raw = text.slice(from, to);
      const words = [...WORDS.segment(raw)].filter((w) => w.isWordLike);
      const [first] = words;
      if (first === undefined) return [];
      return [
        {
          text: raw.replace(MARK, "").replace(/\s+/gu, " ").trim(),
          raw,
          words: words.length + (raw.match(MARK)?.length ?? 0),
          first: first.segment,
          run,
          from,
        },
      ];
    });
  });
}

/** The body's words. */
export const wordsOf = (ss: readonly BodySentence[]): number =>
  ss.reduce((n, s) => n + s.words, 0);

// ── the measures ──────────────────────────────────────────────────────────────────

/** One occurrence of a measure: the words that make it, the sentence it stands in, where it is. */
export interface Occurrence {
  readonly match: string;
  readonly sentence: string;
  readonly at: Span | null;
}

/** The forms as one pattern: matched left to right, so one phrase is never two occurrences. */
const anyOf = (forms: readonly RegExp[]): Readonly<RegExp> =>
  new RegExp(forms.map((r) => `(?:${r.source})`).join("|"), "giu");

/**
 * «not» after a comma, a dash or a semicolon — «the word, not the operation», «— not authenticity» —
 * unless it opens a phrase that rejects nothing («not only», «not yet», «not already in the corpus»).
 */
const COMMA_NOT =
  /[,;—–]\s*(?:and\s+|but\s+)?not\s+(?!(?:only|least|yet|always|necessarily|all|even|just|merely|surprisingly|already|to)\b)/giu;

/** «not X but Y» inside one clause — no comma, colon or semicolon between — but not «not only … but also». */
const NOT_BUT = /\bnot\b(?!\s+only\b)[^.;:,]{1,60}?\bbut\b(?!\s+also\b)/giu;

/** Every form of a contrast frame, as one pattern over one sentence. */
const CONTRAST_FRAME = anyOf([
  COMMA_NOT,
  NOT_BUT,
  /\brather\s+than\b/u,
  /\binstead\s+of\b/u,
  /\bas\s+opposed\s+to\b/u,
]);

/**
 * Words that name the relation between a sentence and the one before it: cause, consequence,
 * contrast, concession, example, restatement. The list is the one the register diagnosis measured
 * (every marker whose meaning does not depend on context), not tuned to this corpus.
 */
const RELATION_MARKERS =
  /(?<![\p{L}])(?:therefore|thus|hence|consequently|as a result|because|since|this means|this implies|which explains|in turn|that is,|i\.e\.|in contrast|by contrast|however|nevertheless|nonetheless|whereas|in other words|for this reason|it follows|accordingly|specifically,|in particular,|for example|for instance|e\.g\.)(?![\p{L}])/giu;

/** Every match of `pattern` in every sentence, in order, with where it stands. */
function occurrences(
  ss: readonly BodySentence[],
  pattern: Readonly<RegExp>,
): readonly Occurrence[] {
  return ss.flatMap((s) =>
    [...s.raw.matchAll(pattern)].map((m) => ({
      match: m[0].replace(/^[,;—–]\s*/u, "").trim(),
      sentence: s.text,
      at: spanIn(s.run, s.from + m.index, s.from + m.index + m[0].length),
    })),
  );
}

/** The contrast frames of the body's sentences. */
export const contrastFrames = (
  ss: readonly BodySentence[],
): readonly Occurrence[] => occurrences(ss, CONTRAST_FRAME);

/** The relation markers of the body's sentences. */
export const relationMarkers = (
  ss: readonly BodySentence[],
): readonly Occurrence[] => occurrences(ss, RELATION_MARKERS);

/** A phrase this long or longer states something rather than names it. */
export const CLAIM_WORDS = 6;

const wordCount = (s: string): number =>
  [...WORDS.segment(s)].filter((w) => w.isWordLike).length;

/**
 * Whether an emphasised phrase is a claim set in bold: bold, inside its sentence (not a label that
 * opens a paragraph or an item), and either `CLAIM_WORDS` words long or holding a number.
 */
export const isClaimEmphasis = (e: Emphasis): boolean =>
  e.style === "bold" &&
  e.place === "inline" &&
  (wordCount(e.text) >= CLAIM_WORDS || /\p{N}/u.test(e.text));

/** The claims the body sets in bold. */
export const claimEmphasis = (es: readonly Emphasis[]): readonly Occurrence[] =>
  es.filter(isClaimEmphasis).map((e) => ({
    match: e.text,
    sentence: e.text,
    at: e.span,
  }));
