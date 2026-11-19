/**
 * A TERM USED BEFORE ITS DEFINITION, OR DEFINED TWICE — what `tex/term-before-definition` and
 * `tex/term-defined-twice` judge. Pure: the body's emphasised phrases and sentences in, findings out.
 *
 * ── THE CONVENTION IT READS ──────────────────────────────────────────────────────
 * A paper that sets a new word in italics where it explains it («a file that one reading flags and
 * the other passes is a \emph{witness}») has marked the definition in its markup. From that phrase
 * on, the reader knows the word. A definition is a phrase set with one of the `commands` (default
 * `emph`) that:
 *
 *   - stands in the body, outside the abstract (a summary read on its own: neither a definition
 *     nor a use there counts);
 *   - is 1 to `maxWords` words (default 4) — a longer phrase is stress, not a term;
 *   - holds no digit (an italic number is a result) and does not end on a stop or a comma;
 *   - holds a word outside FUNCTION_WORDS («\emph{not}», «\emph{only}» stress a word, name nothing).
 *
 * A run-in heading (`\emph{Scope.} …`) is no definition: the reader never gives it (`bodyEmphasis`).
 *
 * ── WHAT A USE IS ────────────────────────────────────────────────────────────────
 * The term in a body sentence: whole words, case ignored (a term written in capitals, «CI», keeps
 * its case), any spacing between its words, its last word as written, `+s`, `+es`, `y→ies`, or —
 * when it ends in `s` — without it. Not a use: one in the abstract, and one in a sentence that
 * holds a definition of the term («a file, which we call a \emph{witness}» defines once).
 * No lemmatizer: «witnesses» is not «witness».
 */
import { groupBy, isNonNull, isTruthy, sortBy, values } from "remeda";
import type { BodySentence } from "./register.ts";
import type { Emphasis, Span } from "./tex-document.ts";
import { spanIn } from "./tex-document.ts";

/** What the rules read a definition as: the commands that mark one, and its longest phrase. */
export interface TermOptions {
  readonly commands: readonly [string, ...string[]];
  readonly maxWords: number;
}

export const DEFAULT_TERM_OPTIONS: TermOptions = {
  commands: ["emph"],
  maxWords: 4,
};

/** The commands the parser reports an emphasised phrase under: the values `commands` may hold. */
export const EMPHASIS_COMMANDS: readonly string[] = [
  "emph",
  "textit",
  "textsl",
  "textbf",
  "underline",
  "uline",
  "em",
  "itshape",
  "it",
  "slshape",
  "bfseries",
  "bf",
];

/**
 * Words that name nothing on their own: articles, conjunctions, negation, quantifiers, modals,
 * pronouns, prepositions, auxiliaries. A closed list from grammar, not tuned to a corpus: a phrase
 * of these alone is stress, not a term.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "not",
  "no",
  "only",
  "all",
  "any",
  "some",
  "each",
  "every",
  "both",
  "either",
  "neither",
  "more",
  "most",
  "less",
  "least",
  "much",
  "many",
  "few",
  "must",
  "may",
  "might",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "do",
  "does",
  "did",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "has",
  "have",
  "had",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "we",
  "our",
  "they",
  "their",
  "before",
  "after",
  "always",
  "never",
  "also",
  "very",
  "too",
  "just",
  "even",
  "still",
  "then",
  "there",
  "here",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "if",
  "than",
  "as",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "by",
  "with",
  "without",
  "into",
  "over",
  "under",
  "per",
  "via",
  "about",
]);

/** A phrase set as a definition: its term (the key two definitions share), as written, where. */
export interface Definition {
  readonly term: string;
  readonly text: string;
  readonly command: string;
  readonly span: Span;
}

const inside = (at: Span, area: Span | null): boolean =>
  area !== null && at.start >= area.start && at.start < area.end;

const overlaps = (a: Span, b: Span): boolean =>
  a.start < b.end && b.start < a.end;

/** A phrase written in capitals keeps its case; any other is compared lower-cased. */
const isCapitals = (text: string): boolean =>
  /\p{Lu}/u.test(text) && text === text.toUpperCase();

const termOf = (text: string): string =>
  isCapitals(text) ? text : text.toLowerCase();

/** Whether an emphasised phrase is a definition under `opts`, outside `abstract`. */
export function isDefinition(
  e: Emphasis,
  opts: TermOptions,
  abstract: Span | null,
): boolean {
  const words = e.text.split(" ").filter(isTruthy);
  return (
    opts.commands.includes(e.command) &&
    !inside(e.span, abstract) &&
    words.length <= opts.maxWords &&
    !/\p{N}/u.test(e.text) &&
    !/[.:;,!?]$/u.test(e.text) &&
    words.some((w) => !FUNCTION_WORDS.has(w.toLowerCase()))
  );
}

/** The body's definitions under `opts`, in document order. */
export const definitionsOf = (
  emphases: readonly Emphasis[],
  opts: TermOptions,
  abstract: Span | null,
): readonly Definition[] =>
  emphases
    .filter((e) => isDefinition(e, opts, abstract))
    .map((e) => ({
      term: termOf(e.text),
      text: e.text,
      command: e.command,
      span: e.span,
    }));

const escaped = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The forms a word is used in: as written, `+s`, `+es`, `y→ies`, and without a final `s`. */
function formsOf(word: string): readonly string[] {
  const e = escaped(word);
  const ies = /y$/iu.test(word) ? [`${escaped(word.slice(0, -1))}ies`] : [];
  const bare = /s$/iu.test(word) ? [escaped(word.slice(0, -1))] : [];
  return [`${e}es`, `${e}s`, ...ies, e, ...bare];
}

/** The pattern of a term's uses: whole words, any spacing between them, the last word's forms. */
export function usePattern(term: string): Readonly<RegExp> {
  const words = term.split(" ");
  const body = words
    .map((w, i) =>
      i === words.length - 1 ? `(?:${formsOf(w).join("|")})` : escaped(w),
    )
    .join("\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`,
    isCapitals(term) ? "gu" : "giu",
  );
}

/** A sentence with its span in the source; none when the parser gave it no place. */
const placed = (
  s: BodySentence,
): { readonly s: BodySentence; readonly span: Span } | null => {
  const span = spanIn(s.run, s.from, s.from + s.raw.length);
  return span === null ? null : { s, span };
};

/** Where the term is used in the body, in order: outside the abstract and every sentence defining it. */
export function usesOf(
  term: string,
  sentences: readonly BodySentence[],
  definitions: readonly Span[],
  abstract: Span | null,
): readonly Span[] {
  const pattern = usePattern(term);
  return sentences
    .map(placed)
    .filter(isNonNull)
    .filter(
      ({ span }) =>
        !inside(span, abstract) && !definitions.some((d) => overlaps(d, span)),
    )
    .flatMap(({ s }) =>
      [...s.raw.matchAll(pattern)].map((m) =>
        spanIn(s.run, s.from + m.index, s.from + m.index + m[0].length),
      ),
    )
    .filter(isNonNull);
}

/** A term used before its first definition: the first use, how many uses precede it, the definition. */
export interface UsedBefore {
  readonly term: string;
  readonly definition: Definition;
  readonly firstUse: Span;
  readonly count: number;
}

/** A term set as a definition again: the later definition, and the first. */
export interface DefinedAgain {
  readonly again: Definition;
  readonly first: Definition;
}

/** Each term's definitions, the first first: in document order. */
const byTerm = (
  defs: readonly Definition[],
): readonly (readonly [Definition, ...Definition[]])[] =>
  values(groupBy(defs, (d) => d.term));

/** Every term the body uses before its first definition, in the order of their definitions. */
export function usedBefore(
  defs: readonly Definition[],
  sentences: readonly BodySentence[],
  abstract: Span | null,
): readonly UsedBefore[] {
  return byTerm(defs).flatMap((ds) => {
    const [first] = ds;
    const earlier = usesOf(
      first.term,
      sentences,
      ds.map((d) => d.span),
      abstract,
    ).filter((u) => u.start < first.span.start);
    const [firstUse] = earlier;
    return firstUse === undefined
      ? []
      : [
          {
            term: first.text,
            definition: first,
            firstUse,
            count: earlier.length,
          },
        ];
  });
}

/** Every later definition of a term already defined, in document order. */
export const definedAgain = (
  defs: readonly Definition[],
): readonly DefinedAgain[] =>
  sortBy(
    byTerm(defs).flatMap((ds) =>
      ds.slice(1).map((again) => ({ again, first: ds[0] })),
    ),
    (d) => d.again.span.start,
  );
