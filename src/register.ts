/**
 * `tex/register` — the body reads at the register of a paper, not of a post: two rates over the
 * whole body, each reported once when it runs above what accepted papers show.
 *
 *   warn  more than 12% of the body's sentences run under eight words
 *   warn  more than 0.8 sentences per 1000 words open with And, So, But, Nor, Or or Yet
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────
 * Reviewers called our prose "too informal" and "a blogpost" twice. Measured against eleven accepted
 * papers, the two things that set our drafts apart were these: runs of short sentences, and
 * sentences that open with a coordinating conjunction. Mean sentence length did not separate the two
 * groups, so there is no floor on it. The limits are options; their defaults and the measurement
 * behind them are on the rule's page.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`) — the parse tree of the whole paper,
 * includes spliced — cut into sentences by the same splitter `tex/claim-provenance` uses
 * (src/domain/sentences.ts). A citation, a cross-reference or math reads as one word, as it does on
 * the page. A body under 2 000 words is not judged: there one sentence decides a rate.
 */
import { z } from "zod";
import { runText, type Passage, type Span } from "./domain/tex-document.ts";
import { runOf, sentences } from "./domain/sentences.ts";
import { readPaper, reportInPaper, type PaperDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

/** A sentence under this many words is short. The calibration counted it so; it is not an option. */
export const SHORT_WORDS = 8;

/** Under this many words in the body, no rate is judged. */
export const MIN_WORDS = 2000;

/** The words that, opening a sentence, make it a conjunction start. Capitalised: only a first word. */
const CONJUNCTIONS: ReadonlySet<string> = new Set([
  "And",
  "So",
  "But",
  "Nor",
  "Or",
  "Yet",
]);

/** The characters a mark or math stands as in a sentence's text (src/domain/sentences.ts). */
const MARK = /[-]/gu;

const WORDS = new Intl.Segmenter("en", { granularity: "word" });

/** A sentence as the rates see it: its text, its words, and its first word. */
interface Sentence {
  readonly text: string;
  readonly words: number;
  readonly first: string;
}

/** A sentence's words: the word-like ones, and one for each mark or math. Null when it has none of its own. */
function sentenceOf(text: string): Sentence | null {
  const words = [...WORDS.segment(text)].filter((w) => w.isWordLike);
  const [first] = words;
  if (first === undefined) return null;
  return {
    text: text.replace(MARK, "").replace(/\s+/gu, " ").trim(),
    words: words.length + (text.match(MARK)?.length ?? 0),
    first: first.segment,
  };
}

/** What the body measures. */
export interface RegisterMeasure {
  readonly sentences: number;
  readonly words: number;
  readonly short: number;
  readonly conjunctionStarts: number;
  /** The first three of each kind, as the reader sees them. */
  readonly shortExamples: readonly string[];
  readonly conjunctionExamples: readonly string[];
  /** Where the body's first passage starts, for a finding about the whole body. */
  readonly at: Span | null;
}

/** Where a passage's first piece stands. */
function startOf(p: Passage): Span {
  const first = p.pieces[0];
  return first.kind === "text"
    ? {
        start: first.segment.at,
        end: first.segment.at + first.segment.text.length,
      }
    : first.span;
}

/** The body's sentences, counted. */
export function measureRegister(passages: readonly Passage[]): RegisterMeasure {
  const all = passages.flatMap((p) => {
    const text = runText(runOf(p));
    return sentences(text).flatMap(([from, to]) => {
      const s = sentenceOf(text.slice(from, to));
      return s === null ? [] : [s];
    });
  });
  const short = all.filter((s) => s.words < SHORT_WORDS);
  const conj = all.filter((s) => CONJUNCTIONS.has(s.first));
  const [first] = passages;
  return {
    sentences: all.length,
    words: all.reduce((n, s) => n + s.words, 0),
    short: short.length,
    conjunctionStarts: conj.length,
    shortExamples: short.slice(0, 3).map((s) => s.text),
    conjunctionExamples: conj.slice(0, 3).map((s) => s.text),
    at: first === undefined ? null : startOf(first),
  };
}

/** The limits: each rate is reported when it runs above its limit. */
export interface RegisterLimits {
  readonly shortSentencePercent: number;
  readonly conjunctionStartsPer1000: number;
}

/** The defaults, from the measurement on the rule's page. */
export const DEFAULT_LIMITS: RegisterLimits = {
  shortSentencePercent: 12,
  conjunctionStartsPer1000: 0.8,
};

/** Examples as the message quotes them. */
const quoted = (xs: readonly string[]): string =>
  xs.map((x) => `«${x}»`).join(", ");

/** One finding for each rate above its limit, at the start of the body. */
export function judgeRegister(
  m: RegisterMeasure,
  limits: Partial<RegisterLimits>,
): readonly Located[] {
  if (m.words < MIN_WORDS) return [];
  const { shortSentencePercent, conjunctionStartsPer1000 } = {
    ...DEFAULT_LIMITS,
    ...limits,
  };
  const share = (100 * m.short) / m.sentences;
  const rate = (1000 * m.conjunctionStarts) / m.words;
  return [
    ...(share > shortSentencePercent
      ? [
          {
            messageId: "shortSentences",
            data: {
              share: share.toFixed(1),
              count: m.short,
              sentences: m.sentences,
              limit: shortSentencePercent,
              examples: quoted(m.shortExamples),
            },
            at: m.at,
          },
        ]
      : []),
    ...(rate > conjunctionStartsPer1000
      ? [
          {
            messageId: "conjunctionStarts",
            data: {
              count: m.conjunctionStarts,
              rate: rate.toFixed(2),
              limit: conjunctionStartsPer1000,
              examples: quoted(m.conjunctionExamples),
            },
            at: m.at,
          },
        ]
      : []),
  ];
}

/** The rule's options, as ESLint validated them against the schema. */
const Options = z
  .object({
    shortSentencePercent: z
      .number()
      .default(DEFAULT_LIMITS.shortSentencePercent),
    conjunctionStartsPer1000: z
      .number()
      .default(DEFAULT_LIMITS.conjunctionStartsPer1000),
  })
  .default(DEFAULT_LIMITS);

const META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the body reads at a paper's register: few sentences under eight words, few sentences opening with And, So or But",
    url: ruleDocsUrl("register"),
  },
  schema: [
    {
      type: "object",
      properties: {
        shortSentencePercent: { type: "number", minimum: 0, maximum: 100 },
        conjunctionStartsPer1000: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    shortSentences:
      "{{share}}% of the body's {{sentences}} sentences run under 8 words ({{count}}; first: {{examples}}). Accepted papers measured 2.2–10.9%; this rule warns above {{limit}}%. A run of short sentences reads as a post, not a paper — join the ones that carry one step of the same argument",
    conjunctionStarts:
      "{{count}} sentences open with And, So, But, Nor, Or or Yet — {{rate}} per 1000 words (first: {{examples}}). Accepted papers measured 0–0.58; this rule warns above {{limit}}. Join the sentence to the one before, or open with the connective a paper uses (However, Therefore, Moreover)",
  },
};

/** The rule, over the body's prose of the whole paper, its includes spliced (`readPaper`). */
export const registerRule = (deps: PaperDeps): TexRuleModule => ({
  meta: META,
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
        reportInPaper(
          context,
          META.messages,
          paper,
          judgeRegister(
            measureRegister(deps.latex.bodyProse(paper.text)),
            Options.parse(context.options?.[0]),
          ),
        );
      },
    };
  },
});
