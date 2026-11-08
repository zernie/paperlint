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
 * The wall the grade-paper-writing skill names (writing-craft.md, «The wall-of-text check»), measured
 * with this rule's counter on the accepted papers in `fixtures/accepted-papers/`: it sits at the
 * pooled 95th percentile of paragraph length of the five two-column IEEE ones (154). The measurement
 * is on the rule's page. A paragraph is at most `max` words; 150 is allowed.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`): paragraphs, list items and
 * footnotes, each a passage; never a heading, a caption, a float, a table, code, a math environment
 * or the bibliography. Words are those `tex/register` counts (src/domain/register.ts): a citation, a
 * cross-reference or inline math is one word.
 */
import type { Passage, ProsePiece } from "./domain/tex-document.ts";
import { runText, spanIn } from "./domain/tex-document.ts";
import { runOf } from "./domain/sentences.ts";
import { NUMBER } from "./claim-provenance.ts";
import { bodySentences, wordsOf } from "./domain/register.ts";
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
  const v = fieldOf(options?.[0], "max");
  return typeof v === "number" ? v : fallback;
}

/** A place in the paper named in words and its number(s): "Section 4", "Sec. 3.2", "Tables 2 and 3", "§4". Not a quantity. */
const PLACE_NUMBER =
  /(?<!\p{L})(?:Sections?|Secs?\.|§§?|Tables?|Tabs?\.|Figures?|Figs?\.|Appendix|Appendices|Listings?|Algorithms?|Equations?|Eqs?\.|Chapters?)\s*\d+(?:\.\d+)*(?:\s*(?:,|and|or|--?)\s*\d+(?:\.\d+)*)*/gu;

/** A registered number: `\num`, `\numA`, `\numTotal`…, not TeX's `\number` or `\numberwithin`. */
const NUMBER_MACRO = /\\num(?!ber)[A-Za-z]*/gu;

const endPos = (p: ProsePiece): number =>
  p.kind === "text" ? p.segment.at + p.segment.text.length : p.span.end;

/** The numbers of a paragraph: digits in its prose (a place's number left out) and each `\num…` macro in its source. */
export function numbersIn(p: Passage, source: string): number {
  const text = runText(runOf(p)).replace(PLACE_NUMBER, " ");
  const from = startOf(p).start;
  const end = p.pieces.reduce((_, q) => endPos(q), from);
  return (
    [...text.matchAll(NUMBER)].length +
    [...source.slice(from, end).matchAll(NUMBER_MACRO)].length
  );
}

/** Every paragraph with more than `max` numbers, at its start. */
export const judgeParagraphNumbers = (
  passages: readonly Passage[],
  source: string,
  max: number,
): readonly Located[] =>
  passages.flatMap((p) => {
    const numbers = numbersIn(p, source);
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
    source: string,
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
        const found = c.judge(
          deps.latex.bodyProse(paper.text),
          paper.text,
          max,
        );
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
      judge: (passages, _source, max) => judgeParagraphWords(passages, max),
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
      judge: (passages, _source, max) => judgeSentenceWords(passages, max),
    },
    deps,
  );
