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
import type { Passage } from "./domain/tex-document.ts";
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
export function maxOf(options: readonly unknown[] | undefined): number {
  const v = fieldOf(options?.[0], "max");
  return typeof v === "number" ? v : DEFAULT_MAX_PARAGRAPH_WORDS;
}

const MESSAGES = {
  paragraph:
    "a paragraph of {{words}} words, over {{max}} — «{{head}}». On the page this is a wall a reader skims past. Split it where its topic turns; move a list of cases into a list, numbers into a table, detail into the appendix",
};

/** `tex/max-paragraph-words`, over the whole paper, its includes spliced. Not on in any default config. */
export function maxParagraphWordsRule(deps: ProseDeps): TexRuleModule {
  return {
    meta: {
      type: "suggestion",
      docs: {
        description: `a paragraph of the body stays at or under \`max\` words (${String(DEFAULT_MAX_PARAGRAPH_WORDS)}): past it, the page shows a wall of text. Off until a project turns it on`,
        url: ruleDocsUrl("max-paragraph-words"),
      },
      schema: [
        {
          type: "object",
          properties: { max: { type: "integer", minimum: 0 } },
          additionalProperties: false,
        },
      ],
      messages: MESSAGES,
    },
    create(context) {
      return {
        root() {
          const sc = context.sourceCode;
          const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
          const passages = deps.latex.bodyProse(paper.text);
          const found = judgeParagraphWords(passages, maxOf(context.options));
          reportInPaper(context, MESSAGES, paper, found);
        },
      };
    },
  };
}
