/**
 * THE PARAGRAPH CEILING — `tex/max-paragraph-words`, a rule of the `tex` plugin over the body's
 * prose: a paragraph runs past `max` words (default 150).
 *
 * ── OFF BY DEFAULT ───────────────────────────────────────────────────────────────
 * No call for papers states a paragraph limit, so no venue is a source for the number. The rule is
 * registered and silent until a project turns it on in its `rules`, as `tex/heading-case` is. The
 * name and the `max` option follow ESLint's own `max-lines`, `max-len`, `max-statements`.
 *
 * ── WHERE 150 COMES FROM ─────────────────────────────────────────────────────────
 * The wall writing-craft.md names («The wall-of-text check»), measured
 * with this rule's counter on the accepted papers in `fixtures/real-papers/accepted/`: it sits at the
 * pooled 95th percentile of paragraph length of the five two-column IEEE ones (154). The measurement
 * is on the rule's page. A paragraph is at most `max` words; 150 is allowed.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`): paragraphs, list items and
 * footnotes, each a passage; never a heading, a caption, a float, a table, code, a math environment
 * or the bibliography. Words are those `tex/register` counts (src/domain/register.ts): a citation, a
 * cross-reference or inline math is one word. Numbers are the digits of that prose and the
 * registered numbers the parser counted in it (`Passage.registeredNumbers`); inline math is a mark,
 * so nothing inside it is a number.
 */
import type { Caption, Passage } from "./domain/tex-document.ts";
import { runText, spanIn } from "./domain/tex-document.ts";
import { runOf } from "./domain/sentences.ts";
import { NUMBER } from "./claim-provenance.ts";
import {
  bodySentences,
  wordsOf,
  type BodySentence,
} from "./domain/register.ts";
import { fieldOf } from "./domain/record.ts";
import { startOf } from "./register.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

/** The ceiling when the config sets none: the largest paragraph that does not fire. */
export const DEFAULT_MAX_PARAGRAPH_WORDS = 150;

/** The numbers ceiling when the config sets none: a ninth number fires. */
export const DEFAULT_MAX_PARAGRAPH_NUMBERS = 8;

/** The sentence ceiling when the config sets none: a 56th word fires. */
export const DEFAULT_MAX_SENTENCE_WORDS = 55;

/** The caption ceiling when the config sets none: a 101st word fires. */
export const DEFAULT_MAX_CAPTION_WORDS = 100;

/** The caption-sentence ceiling when the config sets none: a 41st word fires. */
export const DEFAULT_MAX_CAPTION_SENTENCE_WORDS = 40;

/** How many words of a paragraph a message quotes. */
const HEAD_WORDS = 8;

/** The first words of a text, as a message quotes them. */
const headOf = (text: string): string =>
  `${text.split(" ").slice(0, HEAD_WORDS).join(" ")}…`;

/** Every paragraph over `max` words, at its start. */
export const judgeParagraphWords = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  passages.flatMap((p) => {
    const sentences = bodySentences([p]);
    const words = wordsOf(sentences);
    return words <= max
      ? []
      : [
          {
            messageId: "paragraph",
            data: {
              words,
              max,
              head: headOf(sentences.map((s) => s.text).join(" ")),
            },
            at: startOf(p),
          },
        ];
  });

/** The ceiling the config sets, or the default: ESLint has validated the option against the schema. */
export function maxOf(
  options: readonly unknown[] | undefined,
  fallback: number = DEFAULT_MAX_PARAGRAPH_WORDS,
): number {
  return optionOf(options, "max", fallback);
}

/**
 * The numbers of a paragraph: digits in its prose, and the registered numbers (`\num…` macros) the
 * parser found in that prose. Math, comments and a footnote's own prose add nothing to it.
 */
export const numbersIn = (p: Passage): number =>
  [...runText(runOf(p)).matchAll(NUMBER)].length + p.registeredNumbers;

/** Every paragraph with more than `max` numbers, at its start. */
export const judgeParagraphNumbers = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  passages.flatMap((p) => {
    const numbers = numbersIn(p);
    return numbers <= max
      ? []
      : [
          {
            messageId: "numbers",
            data: {
              numbers,
              max,
              head: headOf(
                bodySentences([p])
                  .map((s) => s.text)
                  .join(" "),
              ),
            },
            at: startOf(p),
          },
        ];
  });

/** Every sentence over `max` words, at its start. */
export const judgeSentenceWords = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  bodySentences(passages)
    .filter((s) => s.words > max)
    .map((s) => ({
      messageId: "sentence",
      data: { words: s.words, max, head: headOf(s.text) },
      at: spanIn(s.run, s.from, s.from + 1),
    }));

/**
 * Every caption over `max` words, at its `\caption`, and every caption sentence over `maxSentence`
 * words, at its start. Words and sentences are the body's: a formula or a citation is one word.
 */
export const judgeCaptionWords = (
  captions: readonly Caption[],
  max: number,
  maxSentence: number,
): readonly Located[] =>
  captions.flatMap((c) => {
    const ss = bodySentences(c.passages);
    return [...captionOver(c, ss, max), ...sentencesOver(ss, maxSentence)];
  });

/** The caption itself, when its words run past `max`. */
function captionOver(
  c: Caption,
  ss: readonly BodySentence[],
  max: number,
): readonly Located[] {
  const words = wordsOf(ss);
  if (words <= max) return [];
  const head = headOf(ss.map((s) => s.text).join(" "));
  return [{ messageId: "caption", data: { words, max, head }, at: c.span }];
}

/** Each sentence of a caption over `max` words, at its start. */
const sentencesOver = (
  ss: readonly BodySentence[],
  max: number,
): readonly Located[] =>
  ss
    .filter((s) => s.words > max)
    .map((s) => ({
      messageId: "captionSentence",
      data: { words: s.words, max, head: headOf(s.text) },
      at: spanIn(s.run, s.from, s.from + 1),
    }));

const CAPTION_MESSAGES = {
  caption:
    "a caption of {{words}} words, over {{max}} — «{{head}}». A reader reads a caption in one pass with its figure; move the method into the body and keep what the figure shows.",
  captionSentence:
    "a caption sentence of {{words}} words, over {{max}} — «{{head}}». Cut it where a clause could stand alone.",
};

/** An integer option the config sets, or the default: ESLint has validated it against the schema. */
const optionOf = (
  options: readonly unknown[] | undefined,
  key: string,
  fallback: number,
): number => {
  const v = fieldOf(options?.[0], key);
  return typeof v === "number" ? v : fallback;
};

/**
 * `tex/max-caption-words`: a caption over `max` words (default 100), a caption sentence over
 * `maxSentence` (default 40). One rule with two options, as `max-len` has `comments`: both are a
 * caption too long, with the same reason to switch them off. Not on in any default config.
 */
const CAPTION_META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description: `a caption stays at or under \`max\` words (${String(DEFAULT_MAX_CAPTION_WORDS)}) and each of its sentences at or under \`maxSentence\` (${String(DEFAULT_MAX_CAPTION_SENTENCE_WORDS)}). Off until a project turns it on`,
    url: ruleDocsUrl("max-caption-words"),
  },
  schema: [
    {
      type: "object",
      properties: {
        max: { type: "integer", minimum: 0 },
        maxSentence: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
  ],
  messages: CAPTION_MESSAGES,
};

export const maxCaptionWordsRule = (deps: ProseDeps): TexRuleModule => ({
  meta: CAPTION_META,
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
        const o = context.options;
        const found = judgeCaptionWords(
          deps.latex.captions(paper.text),
          optionOf(o, "max", DEFAULT_MAX_CAPTION_WORDS),
          optionOf(o, "maxSentence", DEFAULT_MAX_CAPTION_SENTENCE_WORDS),
        );
        reportInPaper(context, CAPTION_MESSAGES, paper, found);
      },
    };
  },
});

const MESSAGES = {
  paragraph:
    "a paragraph of {{words}} words, over {{max}} — «{{head}}». On the page this is a wall a reader skims past. Split it where its topic turns; move a list of cases into a list, numbers into a table, detail into the appendix",
  numbers:
    "a paragraph with {{numbers}} numbers, over {{max}} — «{{head}}». This is a table written in prose; put the figures in a table or keep the ones the argument needs",
  sentence:
    "a sentence of {{words}} words, over {{max}} — «{{head}}». A reader loses its subject before its verb; cut it where a clause could stand alone",
};

/** What distinguishes one ceiling rule from another. */
interface Ceiling {
  readonly name: Parameters<typeof ruleDocsUrl>[0];
  readonly what: string;
  readonly fallback: number;
  readonly judge: (
    passages: readonly Passage[],
    max: number,
  ) => readonly Located[];
}

const CEILING_SCHEMA = [
  {
    type: "object",
    properties: { max: { type: "integer", minimum: 0 } },
    additionalProperties: false,
  },
];

/** A ceiling rule of the `tex` plugin over the body's prose; off until a project turns it on. */
const ceilingRule = (c: Ceiling, deps: ProseDeps): TexRuleModule => ({
  meta: {
    type: "suggestion",
    docs: {
      description: `${c.what} (${String(c.fallback)}). Off until a project turns it on`,
      url: ruleDocsUrl(c.name),
    },
    schema: CEILING_SCHEMA,
    messages: MESSAGES,
  },
  create(context) {
    return {
      root() {
        const sc = context.sourceCode;
        const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
        const max = maxOf(context.options, c.fallback);
        const found = c.judge(deps.latex.bodyProse(paper.text), max);
        reportInPaper(context, MESSAGES, paper, found);
      },
    };
  },
});

/** `tex/max-paragraph-words`, over the whole paper, its includes spliced. Not on in any default config. */
export const maxParagraphWordsRule = (deps: ProseDeps): TexRuleModule =>
  ceilingRule(
    {
      name: "max-paragraph-words",
      what: "a paragraph of the body stays at or under `max` words: past it, the page shows a wall of text",
      fallback: DEFAULT_MAX_PARAGRAPH_WORDS,
      judge: judgeParagraphWords,
    },
    deps,
  );

/** `tex/max-paragraph-numbers`. Not on in any default config. */
export const maxParagraphNumbersRule = (deps: ProseDeps): TexRuleModule =>
  ceilingRule(
    {
      name: "max-paragraph-numbers",
      what: "a paragraph of the body holds at most `max` numbers: past it, it reads as a table written in prose",
      fallback: DEFAULT_MAX_PARAGRAPH_NUMBERS,
      judge: judgeParagraphNumbers,
    },
    deps,
  );

/** `tex/max-sentence-words`. Not on in any default config. */
export const maxSentenceWordsRule = (deps: ProseDeps): TexRuleModule =>
  ceilingRule(
    {
      name: "max-sentence-words",
      what: "a sentence of the body stays at or under `max` words",
      fallback: DEFAULT_MAX_SENTENCE_WORDS,
      judge: judgeSentenceWords,
    },
    deps,
  );
