/**
 * THE READABILITY CEILINGS — three counts a reader feels on the page before reading a word, each a
 * rule of the `tex` plugin over the body's prose:
 *
 *   tex/max-paragraph-words    warn  a paragraph runs past `max` words (150): a wall of text
 *   tex/max-paragraph-numbers  warn  a paragraph carries more than `max` numbers (8): a table in prose
 *   tex/max-sentence-words     warn  a sentence runs past `max` words (55)
 *
 * ── WHY THREE RULES ──────────────────────────────────────────────────────────────
 * One requirement per rule (`eslint-rules/CLAUDE.md`): a results section may need its numbers and
 * still owe the reader short paragraphs, so each ceiling is switched off, or moved, alone. The names
 * and the `max` option follow ESLint's own `max-lines`, `max-len`, `max-statements`.
 *
 * ── WHERE THE NUMBERS COME FROM ──────────────────────────────────────────────────
 * The defaults are the wall the grade-paper-writing skill names (writing-craft.md, «The wall-of-text
 * check»), measured with these counters on the accepted papers in `fixtures/accepted-papers/`: on the
 * five two-column IEEE ones they sit at the pooled 95th percentile of paragraph length and the 99th of
 * numbers per paragraph and of sentence length. A venue whose layout fits more or fewer words on a
 * line sets its own `max` in its preset's `rules`; the measurement is on each rule's page.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`): paragraphs, list items and
 * footnotes, each a passage; never a heading, a caption, a float, a table, code, a math environment
 * or the bibliography. Words and sentences are those `tex/register` counts (src/domain/register.ts):
 * a citation, a cross-reference or inline math is one word. A number is the lexeme
 * `tex/claim-provenance` reads as one, in the running text — not in math.
 */
import type { Passage } from "./domain/tex-document.ts";
import { runText, spanIn } from "./domain/tex-document.ts";
import {
  bodySentences,
  wordsOf,
  type BodySentence,
} from "./domain/register.ts";
import { runOf } from "./domain/sentences.ts";
import { NUMBER } from "./claim-provenance.ts";
import { startOf } from "./register.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

export type ReadabilityRuleName =
  "max-paragraph-words" | "max-paragraph-numbers" | "max-sentence-words";

/** Each rule's ceiling when the config sets none: the largest count that does not fire. */
export const DEFAULT_MAX: Readonly<Record<ReadabilityRuleName, number>> = {
  "max-paragraph-words": 150,
  "max-paragraph-numbers": 8,
  "max-sentence-words": 55,
};

/** How many words of a paragraph or a sentence a message quotes. */
const HEAD_WORDS = 8;

/** The first words of a text, as a message quotes them. */
const headOf = (text: string): string =>
  `${text.split(/\s+/u).slice(0, HEAD_WORDS).join(" ")}…`;

/** A paragraph's sentences and its text as the reader sees it, or null when it holds no word. */
const read = (
  p: Passage,
): {
  readonly sentences: readonly BodySentence[];
  readonly text: string;
} | null => {
  const sentences = bodySentences([p]);
  return sentences.length === 0
    ? null
    : { sentences, text: sentences.map((s) => s.text).join(" ") };
};

/** Every paragraph over `max` words, at its start. */
export const judgeParagraphWords = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  passages.flatMap((p) => {
    const r = read(p);
    const words = r === null ? 0 : wordsOf(r.sentences);
    return r === null || words <= max
      ? []
      : [
          {
            messageId: "paragraph",
            data: { words, max, head: headOf(r.text) },
            at: startOf(p),
          },
        ];
  });

/** Every paragraph holding more than `max` numbers in its running text, at its start. */
export const judgeParagraphNumbers = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  passages.flatMap((p) => {
    const r = read(p);
    const count = [...runText(runOf(p)).matchAll(NUMBER)].length;
    return r === null || count <= max
      ? []
      : [
          {
            messageId: "numbers",
            data: { count, max, head: headOf(r.text) },
            at: startOf(p),
          },
        ];
  });

/** Every sentence over `max` words, spanning it. */
export const judgeSentenceWords = (
  passages: readonly Passage[],
  max: number,
): readonly Located[] =>
  bodySentences(passages)
    .filter((s) => s.words > max)
    .map((s) => {
      const lead = s.raw.length - s.raw.trimStart().length;
      const to = s.from + s.raw.trimEnd().length;
      return {
        messageId: "sentence",
        data: { words: s.words, max, head: headOf(s.text) },
        at: spanIn(s.run, s.from + lead, to),
      };
    });

/** The ceiling the config sets, or the default: ESLint has validated the option against the schema. */
export function maxOf(
  name: ReadabilityRuleName,
  options: readonly unknown[] | undefined,
): number {
  const [o] = options ?? [];
  const v: unknown =
    typeof o === "object" && o !== null
      ? Object.fromEntries(Object.entries(o))["max"]
      : undefined;
  return typeof v === "number" ? v : DEFAULT_MAX[name];
}

/** What each rule judges with, says, and is described as. */
const RULES: Readonly<
  Record<
    ReadabilityRuleName,
    {
      readonly judge: (
        ps: readonly Passage[],
        max: number,
      ) => readonly Located[];
      readonly description: string;
      readonly messages: Readonly<Record<string, string>>;
    }
  >
> = {
  "max-paragraph-words": {
    judge: judgeParagraphWords,
    description:
      "a paragraph of the body stays at or under `max` words (150): past it, the page shows a wall of text",
    messages: {
      paragraph:
        "a paragraph of {{words}} words, over {{max}} — «{{head}}». On the page this is a wall a reader skims past. Split it where its topic turns; move a list of cases into a list, numbers into a table, detail into the appendix",
    },
  },
  "max-paragraph-numbers": {
    judge: judgeParagraphNumbers,
    description:
      "a paragraph of the body carries at most `max` numbers in its running text (8): past it, the paragraph is a table set as prose",
    messages: {
      numbers:
        "{{count}} numbers in one paragraph, over {{max}} — «{{head}}». A reader cannot hold them. Put them in a table and keep in the text the two or three the argument turns on",
    },
  },
  "max-sentence-words": {
    judge: judgeSentenceWords,
    description: "a sentence of the body stays at or under `max` words (55)",
    messages: {
      sentence:
        "a sentence of {{words}} words, over {{max}} — «{{head}}». Cut it where it changes subject or adds a second claim",
    },
  },
};

function rule(name: ReadabilityRuleName, deps: ProseDeps): TexRuleModule {
  const { judge, description, messages } = RULES[name];
  return {
    meta: {
      type: "suggestion",
      docs: { description, url: ruleDocsUrl(name) },
      schema: [
        {
          type: "object",
          properties: { max: { type: "integer", minimum: 0 } },
          additionalProperties: false,
        },
      ],
      messages,
    },
    create(context) {
      return {
        root() {
          const sc = context.sourceCode;
          const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
          const passages = deps.latex.bodyProse(paper.text);
          const found = judge(passages, maxOf(name, context.options));
          reportInPaper(context, messages, paper, found);
        },
      };
    },
  };
}

/** The three rules, as rules of the `tex` plugin, over the whole paper, its includes spliced. */
export function readabilityRules(
  deps: ProseDeps,
): Readonly<Record<ReadabilityRuleName, TexRuleModule>> {
  return {
    "max-paragraph-words": rule("max-paragraph-words", deps),
    "max-paragraph-numbers": rule("max-paragraph-numbers", deps),
    "max-sentence-words": rule("max-sentence-words", deps),
  };
}

/** The level each rule is on at in paperlint's own config, for every `paper.tex`. */
export const READABILITY_RULE_LEVELS: Readonly<
  Record<`tex/${ReadabilityRuleName}`, "warn">
> = {
  "tex/max-paragraph-words": "warn",
  "tex/max-paragraph-numbers": "warn",
  "tex/max-sentence-words": "warn",
};
