/**
 * `tex/register` — the body reads at the register of a paper, not of a post: sentences that open
 * with a coordinating conjunction stay as rare as they are in accepted papers.
 *
 *   warn  more than 0.8 sentences per 1000 words of the body open with And, So, But, Nor, Or or Yet
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────
 * Reviewers called our prose "too informal" and "a blogpost" twice. Measured against eleven accepted
 * papers, sentence-initial conjunctions set our drafts apart (accepted 0–0.58 per 1000 words). The
 * limit is an option; its default and the measurement behind it are on the rule's page.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The body's prose through the `LatexReader` port (`bodyProse`) — the parse tree of the whole paper,
 * includes spliced — cut into sentences by the same splitter `tex/claim-provenance` uses
 * (src/domain/sentences.ts). A citation, a cross-reference or math reads as one word, as it does on
 * the page. A body under 2 000 words is not judged: there one sentence decides the rate.
 */
import type { Passage, Span } from "./domain/tex-document.ts";
import { bodySentences, wordsOf } from "./domain/register.ts";
import { readPaper, reportInPaper, type ProseDeps } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

/** Under this many words in the body, a rate is not judged: one sentence would decide it. */
export const MIN_WORDS = 2000;

/** The limit when the config sets none, from the measurement on the rule's page. */
export const DEFAULT_LIMIT = 0.8;

/** The words that, opening a sentence, make it a conjunction start. Capitalised: only a first word. */
const CONJUNCTIONS: ReadonlySet<string> = new Set([
  "And",
  "So",
  "But",
  "Nor",
  "Or",
  "Yet",
]);

/** What the body measures. */
export interface RegisterMeasure {
  readonly words: number;
  readonly conjunctionStarts: number;
  /** The first three, as the reader sees them. */
  readonly examples: readonly string[];
  /** Where the body's first passage starts, for a finding about the whole body. */
  readonly at: Span | null;
}

/** Where a passage's first piece stands: where a finding about the whole body points. */
export function startOf(p: Passage): Span {
  const first = p.pieces[0];
  return first.kind === "text"
    ? {
        start: first.segment.at,
        end: first.segment.at + first.segment.text.length,
      }
    : first.span;
}

/** The body's words, and its sentences that open with a conjunction. */
export function measureRegister(passages: readonly Passage[]): RegisterMeasure {
  const all = bodySentences(passages);
  const conj = all.filter((s) => CONJUNCTIONS.has(s.first));
  const [first] = passages;
  return {
    words: wordsOf(all),
    conjunctionStarts: conj.length,
    examples: conj.slice(0, 3).map((s) => s.text),
    at: first === undefined ? null : startOf(first),
  };
}

/** One finding, at the start of the body, when the rate runs above `limit` per 1000 words. */
export function judgeRegister(
  m: RegisterMeasure,
  limit: number = DEFAULT_LIMIT,
): readonly Located[] {
  if (m.words < MIN_WORDS) return [];
  const rate = (1000 * m.conjunctionStarts) / m.words;
  if (rate <= limit) return [];
  const data = {
    count: m.conjunctionStarts,
    rate: rate.toFixed(2),
    limit,
    examples: m.examples.map((x) => `«${x}»`).join(", "),
  };
  return [{ messageId: "conjunctionStarts", data, at: m.at }];
}

/** The limit the config sets, or the default: ESLint has validated the option against the schema. */
function limitOf(options: readonly unknown[] | undefined): number {
  const [o] = options ?? [];
  const given: Readonly<Record<string, unknown>> =
    typeof o === "object" && o !== null
      ? Object.fromEntries(Object.entries(o))
      : {};
  const v = given["conjunctionStartsPer1000"];
  return typeof v === "number" ? v : DEFAULT_LIMIT;
}

const META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the body reads at a paper's register: few sentences open with And, So, But, Nor, Or or Yet",
    url: ruleDocsUrl("register"),
  },
  schema: [
    {
      type: "object",
      properties: {
        conjunctionStartsPer1000: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    conjunctionStarts:
      "{{count}} sentences open with And, So, But, Nor, Or or Yet — {{rate}} per 1000 words (first: {{examples}}). Accepted papers measured 0–0.58; this rule warns above {{limit}}. Join the sentence to the one before, or open with the connective a paper uses (However, Therefore, Moreover)",
  },
};

/** The rule, over the body's prose of the whole paper, its includes spliced (`readPaper`). */
export const registerRule = (deps: ProseDeps): TexRuleModule => ({
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
            limitOf(context.options),
          ),
        );
      },
    };
  },
});
