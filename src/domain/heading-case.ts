/**
 * HEADING CASE — what a venue's capitalization style asks of the words of the paper's title and of
 * its headings, decided on the text the LaTeX adapter hands over (`TitledHeading`), never on the
 * source.
 *
 * ── A STYLE IS NAMED AFTER THE TEXT THAT DEFINES IT ──────────────────────────────
 * Venues name the authority precisely and the scope loosely: «headline-style capitalization
 * (according to the Chicago Manual of Style …)» for «the title and all headings». Headline variants
 * disagree on real words — Chicago lowercases `With`, `Between` and `From` «regardless of length»,
 * APA title case and IEEE's manual capitalize them — so there is no style called just «headline»:
 * one word would let a preset apply Chicago where a venue asks APA. A new variant is a new member of
 * `CaseStyle`, added with the venue text that defines it and its own word table.
 *
 * ── CHICAGO-HEADLINE, THE PUBLISHER'S WORDS ──────────────────────────────────────
 * Conference Publishing Consulting's quote of the Chicago Manual of Style 8.157–8.159 (the text is
 * quoted on the rule's page): capitalize the first and the last word, the first word after a colon,
 * and every major word (nouns, pronouns, verbs, adjectives, adverbs); lowercase articles,
 * prepositions «regardless of length», the conjunctions and, but, for, or, nor, and «to» and «as»; in
 * a hyphenated compound always capitalize the first element and lowercase the others when they are
 * an article, a preposition or a conjunction, or when the first is a prefix that cannot stand by
 * itself.
 *
 * ── SILENCE IS THE DEFAULT ───────────────────────────────────────────────────────
 * A finding here is an error at a venue that rejects on it, and a wrong one costs more than a miss.
 * So every word gets one of four classes, and only two of them can be wrong:
 *
 *   lower   what the publisher lists, and prepositions that are nothing else: lowercase between the
 *           first and the last word, capitalized at either end and after a colon
 *   major   every word not in a list — nouns, verbs, adjectives, adverbs, pronouns: capitalized
 *   either  a word that is a preposition in one sentence and a particle, an adverb or a subordinating
 *           conjunction in another (`up`, `down`, `over`, `out`, `off`, `on`, `in`, `through`, `if`,
 *           `while`, `that`…): capitalized at the ends and after a colon, whatever it is; anywhere
 *           else not read, in either case, and never fixed
 *   name    the particle of a surname (`von`, `de`): never read
 *
 * What the rule cannot tell from a word is not read at all: a word with a capital inside (`LLM`,
 * `GitHub`, `iOS`), a single letter, anything with a digit, a dot, a slash or an accent in it, a
 * piece followed by a full stop before the title ends (`al.`, `etc.`, `vs.`), the abbreviations
 * `et al etc cf eg ie approx viz`, a word whose capital is not one letter (a ligature, `ﬁ`), and
 * everything `OPAQUE` in the title (math, code, citations). A word right beside such a thing is
 * not known to be first or last, so a minor word there is left as it is.
 *
 * A title comes in parts — a subtitle after a colon, a question mark, a dash or a line break
 * (`LINE_BREAK`). The first word of a part is a start: a minor word there is not asked either way.
 * The last word of a part is capitalized by Chicago and may be a particle (_What Is It Good For:_),
 * so a minor word there is not asked either way either.
 */
import {
  LINE_BREAK,
  runText,
  type HeadingLevel,
  type Span,
  type TitledCommand,
  type TitledHeading,
} from "./tex-document.ts";

/**
 * A capitalization style, named after the text that defines it. Add a member only with a venue's
 * quote and a word table of its own.
 *
 *   chicago-headline  Conference Publishing's quote of the Chicago Manual of Style 8.157–8.159
 *   sentence          the first word capitalized; nothing else judged, never fixed (proper nouns)
 *   any               this scope is unconstrained
 */
export type CaseStyle = "chicago-headline" | "sentence" | "any";

/** Every style, in the order a message lists them. */
export const CASE_STYLES: readonly CaseStyle[] = [
  "chicago-headline",
  "sentence",
  "any",
];

/** Every heading level, in the order of the outline. */
export const HEADING_LEVELS: readonly HeadingLevel[] = [
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
];

/**
 * What a venue asks, in the two scopes venues speak in: the paper's title, and every heading — with
 * a level the venue names on its own as an exception.
 */
export interface HeadingCaseOptions {
  /** `\title{…}`, and its optional short title `\title[short]{long}`. */
  readonly title: CaseStyle;
  /** Every heading command, starred or not, short title included. */
  readonly headings: CaseStyle;
  /** A level whose style differs from `headings`. */
  readonly levels?: Readonly<Partial<Record<HeadingLevel, CaseStyle>>>;
}

/** The style a title is judged by: the title's own, or its level's, else every heading's. */
export function styleFor(
  options: HeadingCaseOptions,
  command: TitledCommand,
): CaseStyle {
  switch (command.kind) {
    case "title":
      return options.title;
    case "heading":
      return options.levels?.[command.level] ?? options.headings;
  }
}

/** An edit that makes a finding go away: replace `span` of the source with `text`. */
export interface CaseFix {
  readonly span: Span;
  readonly text: string;
}

/** One word that is not in the case the style asks. `fix` is null where the edit is not certain. */
export interface CaseFinding {
  readonly messageId: "capitalize" | "lowercase" | "sentenceFirst";
  readonly data: Readonly<Record<string, string>>;
  readonly at: Span;
  readonly fix: CaseFix | null;
}

type Kind = "lower" | "major" | "either" | "name";

const kinds = (
  kind: Kind,
  words: string,
): readonly (readonly [string, Kind])[] =>
  words.split(" ").map((w) => [w, kind] as const);

/**
 * The words that are not «major». Articles, the conjunctions the publisher names, «to» and «as»,
 * and prepositions that are used as nothing else in a title. A word on the `either` list may be
 * an adverb or a particle («break through», «scale up») and is never read mid-title.
 */
const KINDS: ReadonlyMap<string, Kind> = new Map([
  ...kinds("lower", "the a an and but for or nor to as"),
  ...kinds(
    "lower",
    "of at by from into onto upon via per with within without during among amongst against between across throughout toward towards amid despite versus beneath beside",
  ),
  ...kinds(
    "either",
    "up down over out off on in through under around about above below along after before behind near past inside outside beyond like than since until till vs",
  ),
  ...kinds(
    "either",
    "if because while when where whether although though whereas unless once so yet that how",
  ),
  ...kinds(
    "either",
    "using following including regarding concerning given excluding considering besides",
  ),
  ...kinds("name", "von van de der den da di du del della la le el"),
  // Abbreviations a title borrows from running text: never words of it, in any place.
  ...kinds("name", "et al etc cf eg ie approx viz"),
]);

/**
 * Prefixes that cannot stand by themselves: after one, the second element of a compound is not
 * read (`Multi-turn` and `Multi-Turn` both pass). Not `self`, `cross`, `meta`, `over`, `under`,
 * `mini`, `micro`, `super`, `mid`, `counter`, `pro`: each stands alone, or is not certain to.
 */
export const BOUND_PREFIXES: ReadonlySet<string> = new Set([
  "anti",
  "co",
  "de",
  "inter",
  "intra",
  "multi",
  "non",
  "post",
  "pre",
  "pseudo",
  "quasi",
  "re",
  "semi",
  "sub",
  "trans",
  "ultra",
  "un",
]);

type Want = "upper" | "lower" | "any";

/** Where a word stands in its title: what is certain, and what only cannot be ruled out. */
interface Place {
  readonly first: boolean;
  readonly last: boolean;
  readonly afterColon: boolean;
  /** No word before it, but something unread may stand there. */
  readonly mayBeFirst: boolean;
  readonly mayBeLast: boolean;
  /** After a dash, a line break, a question mark, a full stop: a new start, capitalized or not. */
  readonly afterBreak: boolean;
  /**
   * Before a colon, a question or exclamation mark, a dash or a line break: the last word of a part
   * of the title. Chicago capitalizes it, and a minor word there may be a particle (_Good For_) or a
   * preposition, so it is not asked either way.
   */
  readonly beforeBreak: boolean;
  /** Right beside something the rule does not read: not known to be first or last of anything. */
  readonly besideOpaque: boolean;
}

/** A word the rule reads: its elements (a compound has several) and where its letters stand in the title. */
interface Word {
  readonly elements: readonly [string, ...string[]];
  readonly from: number;
  readonly to: number;
}

type Token =
  | { readonly kind: "word"; readonly word: Word; readonly trail: string }
  | { readonly kind: "opaque"; readonly trail: string }
  | { readonly kind: "break" };

const isNonEmpty = <T>(a: readonly T[]): a is readonly [T, ...T[]] =>
  a.length > 0;

/**
 * A piece of the title: up to a space, a dash or a line break. A lone hyphen is a piece; two or more
 * are a dash. A dash and a line break each break the title into parts.
 */
const PIECES = new RegExp(
  `(?:[^\\s—–${LINE_BREAK}-]|-(?!-))+|-{2,}|[—–${LINE_BREAK}]`,
  "gu",
);
const BREAK = new RegExp(`^(?:-+|[—–${LINE_BREAK}])$`, "u");
const LEADING = /^[("'“‘`[{¿¡]+/u;
const TRAILING = /[.,;:!?)"'”’\]}»]+$/u;
const READABLE = /^\p{L}[\p{L}'’]*(?:-\p{L}[\p{L}'’]*)*$/u;

/**
 * An element whose capital is not one letter (a ligature: `ﬁ` → `FI`): capitalizing it would
 * rewrite the word, so it is not read.
 */
const hasPlainCapital = (el: string): boolean =>
  el.charAt(0).toUpperCase().length === 1;

/**
 * One piece → what it is: a break, a word the rule reads, or something it does not. A piece followed
 * by a full stop that does not end the title is an abbreviation (`al.`, `etc.`, `vs.`), not a word.
 */
function tokenOf(piece: string, index: number, final: boolean): Token {
  if (BREAK.test(piece)) return { kind: "break" };
  const unopened = piece.replace(LEADING, "");
  const core = unopened.replace(TRAILING, "");
  const trail = unopened.slice(core.length);
  const elements = core.split("-");
  const abbreviated = trail.startsWith(".") && !final;
  if (
    !READABLE.test(core) ||
    !isNonEmpty(elements) ||
    abbreviated ||
    !elements.every(hasPlainCapital)
  )
    return { kind: "opaque", trail };
  const from = index + piece.length - unopened.length;
  return {
    kind: "word",
    word: { elements, from, to: from + core.length },
    trail,
  };
}

const tokensOf = (text: string): readonly Token[] => {
  const pieces = [...text.matchAll(PIECES)];
  return pieces.map((m, k) => tokenOf(m[0], m.index, k === pieces.length - 1));
};

const isWord = (t: Token): boolean => t.kind === "word";
const trailOf = (t: Token | undefined): string =>
  t === undefined || t.kind === "break" ? "" : t.trail;

function placeOf(tokens: readonly Token[], i: number): Place {
  const prev = tokens[i - 1];
  const next = tokens[i + 1];
  return {
    first: i === 0,
    last: i === tokens.length - 1,
    afterColon: trailOf(prev).includes(":"),
    mayBeFirst: !tokens.slice(0, i).some(isWord),
    mayBeLast: !tokens.slice(i + 1).some(isWord),
    afterBreak: prev?.kind === "break" || /[.?!]/u.test(trailOf(prev)),
    beforeBreak: next?.kind === "break" || /[:?!]/u.test(trailOf(tokens[i])),
    besideOpaque: prev?.kind === "opaque" || next?.kind === "opaque",
  };
}

const kindOf = (element: string): Kind =>
  KINDS.get(element.toLowerCase()) ?? "major";

/** A word with a capital anywhere but its first letter (`LLM`, `GitHub`, `iOS`): a name, not read. */
const isMixed = (el: string): boolean =>
  el.slice(1) !== el.slice(1).toLowerCase();

/**
 * A single letter other than a lowercase article: a symbol, not a word. A capital «A» in the middle
 * of a title is a label (_Module A_, _Appendix A_, _Vitamin A_), never an article set wrong.
 */
const isSymbol = (el: string): boolean => el.length === 1 && el !== "a";

const capitalized = (el: string): string =>
  el.charAt(0).toUpperCase() + el.slice(1);

/** A word of the `lower` class: capitalized at either end and after a colon, else lowercase unless unsure. */
function wantOfMinor(edge: boolean, p: Place): Want {
  if (edge) return "upper";
  const unsure =
    p.mayBeFirst ||
    p.mayBeLast ||
    p.afterBreak ||
    p.beforeBreak ||
    p.besideOpaque;
  return unsure ? "any" : "lower";
}

/** What chicago-headline asks of a whole word standing alone. */
function wantOfWord(el: string, p: Place): Want {
  if (isSymbol(el)) return "any";
  const edge = p.first || p.last || p.afterColon;
  switch (kindOf(el)) {
    case "name":
      return "any";
    case "major":
      return "upper";
    case "either":
      return edge ? "upper" : "any";
    case "lower":
      return wantOfMinor(edge, p);
  }
}

/** What chicago-headline asks of the `k`-th element (k > 0) of a compound whose first element is `first`. */
function wantOfLater(el: string, k: number, first: string): Want {
  switch (kindOf(el)) {
    case "lower":
      return "lower";
    case "major":
      return k === 1 && BOUND_PREFIXES.has(first.toLowerCase())
        ? "any"
        : "upper";
    case "either":
    case "name":
      return "any";
  }
}

/** An element as `want` asks, or as it is when it is a name or the want is open. */
function applied(el: string, want: Want): string {
  if (want === "any" || isMixed(el)) return el;
  return want === "upper" ? capitalized(el) : el.toLowerCase();
}

/** One element of a word: as written, what chicago-headline asks of it, and the element that results. */
interface Judged {
  readonly k: number;
  readonly want: Want;
  readonly got: string;
  readonly expected: string;
}

/**
 * What chicago-headline asks of each element of a word. A compound with a single-letter element
 * (`k-means`, `e-mail`) is not read; otherwise the first element is capitalized always and the rest
 * follow `wantOfLater`.
 */
function judgedElements(word: Word, p: Place): readonly Judged[] {
  const [first] = word.elements;
  const wantOf = (el: string, k: number): Want => {
    if (word.elements.length === 1) return wantOfWord(el, p);
    if (word.elements.some(isSymbol)) return "any";
    return k === 0 ? "upper" : wantOfLater(el, k, first);
  };
  return word.elements.map((got, k) => {
    const want = wantOf(got, k);
    return { k, want, got, expected: applied(got, want) };
  });
}

/** What a message calls the thing a word stands in. */
function nounOf(c: TitledCommand): string {
  switch (c.kind) {
    case "title":
      return "title";
    case "heading":
      return "heading";
  }
}

/** Why an element is wanted the way it is, as the message says it. */
function whyOf(j: Judged, p: Place, h: TitledHeading): string {
  if (j.want === "lower")
    return "an article, preposition or conjunction is lowercase";
  if (j.k > 0)
    return "the elements of a hyphenated compound are capitalized unless one is an article, a preposition or a conjunction, or follows a prefix such as «non-»";
  if (p.first) return `the first word of a ${nounOf(h.command)} is capitalized`;
  if (p.last) return `the last word of a ${nounOf(h.command)} is capitalized`;
  if (p.afterColon) return "the first word after a colon is capitalized";
  return "nouns, pronouns, verbs, adjectives and adverbs are capitalized";
}

/** The letters of a word, as the title says them. */
const wordText = (h: TitledHeading, w: Word): string =>
  runText(h.title).slice(w.from, w.to);

/**
 * Where the letters `[from, to)` of a title stand in the source: from its first character to past its
 * last. Total, no null: the title's characters are the source's, each at its own offset.
 */
function spanOf(h: TitledHeading, from: number, to: number): Span {
  const offsets = h.title.segments
    .flatMap((s) => s.text.split("").map((_, k) => s.at + k))
    .slice(from, to);
  return { start: Math.min(...offsets), end: Math.max(...offsets) + 1 };
}

/** The fix for a word, only where the source holds exactly the letters read, side by side. */
function fixOf(
  h: TitledHeading,
  w: Word,
  expected: string,
  source: string,
): CaseFix | null {
  const span = spanOf(h, w.from, w.to);
  const contiguous = span.end - span.start === w.to - w.from;
  if (!contiguous || source.slice(span.start, span.end) !== wordText(h, w))
    return null;
  return { span, text: expected };
}

/** The macro a title is the argument of. */
function macroOf(c: TitledCommand): string {
  switch (c.kind) {
    case "title":
      return "title";
    case "heading":
      return c.level;
  }
}

/** `\section` for a title, `\section[…]` for the optional short one: how a message names the heading. */
const whereOf = (h: TitledHeading): string =>
  h.argument === "short"
    ? `\\${macroOf(h.command)}[…]`
    : `\\${macroOf(h.command)}`;

/** One word against chicago-headline: nothing, or a finding with the fix where it is certain. */
function judgeHeadlineWord(
  h: TitledHeading,
  word: Word,
  p: Place,
  source: string,
): readonly CaseFinding[] {
  const [changed] = judgedElements(word, p).filter((j) => j.expected !== j.got);
  if (changed === undefined) return [];
  const expected = judgedElements(word, p)
    .map((j) => j.expected)
    .join("-");
  return [
    {
      messageId: changed.want === "upper" ? "capitalize" : "lowercase",
      data: {
        word: wordText(h, word),
        expected,
        why: whyOf(changed, p, h),
        where: whereOf(h),
      },
      at: spanOf(h, word.from, word.to),
      fix: fixOf(h, word, expected, source),
    },
  ];
}

/** Sentence: the first word of a title is capitalized, and nothing else is read. */
function judgeSentenceWord(
  h: TitledHeading,
  word: Word,
  p: Place,
): readonly CaseFinding[] {
  const [first] = word.elements;
  const got = wordText(h, word);
  const readable =
    kindOf(first) !== "name" && !isSymbol(first) && !isMixed(first);
  const expected = p.first && readable ? capitalized(got) : got;
  if (expected === got) return [];
  return [
    {
      messageId: "sentenceFirst",
      data: { word: got, expected, where: whereOf(h) },
      at: spanOf(h, word.from, word.to),
      fix: null,
    },
  ];
}

/** The findings of one title, each word judged where it stands by `judge`. */
function judgeWords(
  h: TitledHeading,
  judge: (word: Word, p: Place) => readonly CaseFinding[],
): readonly CaseFinding[] {
  const tokens = tokensOf(runText(h.title));
  return tokens.flatMap((t, i) =>
    t.kind === "word" ? judge(t.word, placeOf(tokens, i)) : [],
  );
}

/** The findings of one title under the style its scope asks. */
function judgeTitle(
  h: TitledHeading,
  style: CaseStyle,
  source: string,
): readonly CaseFinding[] {
  switch (style) {
    case "any":
      return [];
    case "chicago-headline":
      return judgeWords(h, (w, p) => judgeHeadlineWord(h, w, p, source));
    case "sentence":
      return judgeWords(h, (w, p) => judgeSentenceWord(h, w, p));
  }
}

/**
 * The paper's title and every heading, each against the style its scope asks (`styleFor`), in
 * document order. `source` is the text the titles were read from: a fix is offered only where it
 * holds the very letters the judge read.
 */
export function judgeHeadingCase(
  headings: readonly TitledHeading[],
  options: HeadingCaseOptions,
  source: string,
): readonly CaseFinding[] {
  return headings.flatMap((h) =>
    judgeTitle(h, styleFor(options, h.command), source),
  );
}
