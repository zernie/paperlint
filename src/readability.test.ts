/**
 * The three readability ceilings on real parses: words per paragraph, numbers per paragraph, words
 * per sentence. Each half of each ceiling is built so that ONLY that ceiling can trip: every case
 * runs all three judges and compares the whole set of findings, so a paragraph that trips the
 * sentence ceiling instead of the paragraph ceiling turns the case red.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import {
  DEFAULT_MAX,
  judgeParagraphNumbers,
  judgeParagraphWords,
  judgeSentenceWords,
  maxOf,
  readabilityRules,
  type ReadabilityRuleName,
} from "./readability.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** Ten words, no digit: a paragraph of these trips no ceiling but its length. */
const TEN = "The rule reads the body and counts what it holds.";

/** A paragraph of `n` ten-word sentences: `10 n` words, every sentence ten words. */
const paragraph = (n: number): string =>
  Array.from({ length: n }, () => TEN).join(" ");

/** One sentence of `n` words, no digit. */
const sentence = (n: number): string =>
  `${Array.from({ length: n - 1 }, (_, i) => (i === 0 ? "The" : "word")).join(" ")} ends.`;

/** A short paragraph holding `n` numbers, in sentences of seven words. */
const numbers = (n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `The second run took ${String(i + 3)} seconds.`,
  ).join(" ");

/** What each judge finds in `body`, with the default ceilings: the whole value, per rule. */
const found = (body: string) => {
  const passages = latexReader.bodyProse(doc(body));
  return {
    words: judgeParagraphWords(
      passages,
      DEFAULT_MAX["max-paragraph-words"],
    ).map((f) => f.data),
    numbers: judgeParagraphNumbers(
      passages,
      DEFAULT_MAX["max-paragraph-numbers"],
    ).map((f) => f.data),
    sentences: judgeSentenceWords(
      passages,
      DEFAULT_MAX["max-sentence-words"],
    ).map((f) => f.data),
  };
};

const NONE = { words: [], numbers: [], sentences: [] };

describe("the default ceilings", () => {
  it("are the wall the readability skill names: 150 words, 8 numbers, 55 words a sentence", () => {
    // Guards: the defaults are the calibrated values on the rules' pages, not drifted ones.
    expect(DEFAULT_MAX).toEqual({
      "max-paragraph-words": 150,
      "max-paragraph-numbers": 8,
      "max-sentence-words": 55,
    });
  });
});

describe("tex/max-paragraph-words — a paragraph over the ceiling, and only that", () => {
  it("🔴 160 words of ten-word sentences: the paragraph ceiling fires, the sentence ceiling does not", () => {
    // Guards: the case that was a false green once — a long single sentence tripped the sentence
    // ceiling, never the paragraph one. Here every sentence is ten words.
    expect(found(paragraph(16))).toEqual({
      ...NONE,
      words: [
        {
          words: 160,
          max: 150,
          head: "The rule reads the body and counts what…",
        },
      ],
    });
  });

  it("140 and 150 words: silent", () => {
    // Guards: the ceiling is inclusive — 150 is allowed, as the consumer's hook allowed it.
    expect(found(paragraph(14))).toEqual(NONE);
    expect(found(paragraph(15))).toEqual(NONE);
  });

  it("two paragraphs of 100 words: each is judged alone, not the body", () => {
    // Guards: a paragraph break ends the count.
    expect(found(`${paragraph(10)}\n\n${paragraph(10)}`)).toEqual(NONE);
  });

  it("captions, floats, code, math environments and the bibliography are not prose", () => {
    const long = paragraph(20);
    // Guards: what the consumer's hook called NOT_PROSE stays out of every count.
    expect(
      found(
        [
          `\\begin{figure}\\caption{${long}}\\end{figure}`,
          `\\begin{table}\\begin{tabular}{l}${long}\\end{tabular}\\end{table}`,
          `\\begin{verbatim}\n${long}\n\\end{verbatim}`,
          `\\begin{lstlisting}\n${long}\n\\end{lstlisting}`,
          "Short text.",
          `\\begin{thebibliography}{1}\\bibitem{a} ${long}\\end{thebibliography}`,
        ].join("\n\n"),
      ),
    ).toEqual(NONE);
  });
});

describe("tex/max-paragraph-numbers — numbers in one paragraph, and only that", () => {
  it("🔴 nine numbers in a 54-word paragraph of seven-word sentences: only the number ceiling fires", () => {
    expect(found(numbers(9))).toEqual({
      ...NONE,
      numbers: [
        {
          count: 9,
          max: 8,
          head: "The second run took 3 seconds. The second…",
        },
      ],
    });
  });

  it("eight numbers: silent", () => {
    expect(found(numbers(8))).toEqual(NONE);
  });

  it("numbers set in math, and numbers in cross-references, are not counted", () => {
    // Guards: a reader sees `\ref` as a place, and math is not running text.
    expect(
      found(
        Array.from(
          { length: 10 },
          (_, i) =>
            `The run took $${String(i + 3)}$ seconds (Table~\\ref{t${String(i)}}).`,
        ).join(" "),
      ),
    ).toEqual(NONE);
  });
});

describe("tex/max-sentence-words — one long sentence, and only that", () => {
  it("🔴 a 60-word sentence in a 60-word paragraph: only the sentence ceiling fires", () => {
    expect(found(sentence(60))).toEqual({
      ...NONE,
      sentences: [
        { words: 60, max: 55, head: "The word word word word word word word…" },
      ],
    });
  });

  it("a 55-word sentence: silent", () => {
    expect(found(sentence(55))).toEqual(NONE);
  });

  it("every long sentence of a paragraph is reported where it stands", () => {
    const passages = latexReader.bodyProse(
      doc(`${sentence(56)} ${TEN} ${sentence(57)}`),
    );
    // Guards: two findings, each spanning its own sentence in the source.
    const src = doc(`${sentence(56)} ${TEN} ${sentence(57)}`);
    expect(
      judgeSentenceWords(passages, 55).map((f) =>
        f.at === null ? null : src.slice(f.at.start, f.at.end),
      ),
    ).toEqual([sentence(56), sentence(57)]);
  });
});

describe("maxOf — the ceiling a config sets", () => {
  it("the option when it is set, the default otherwise", () => {
    // Guards: ESLint has validated the option; anything else falls back to the default.
    expect(maxOf("max-paragraph-words", [{ max: 120 }])).toBe(120);
    expect(maxOf("max-paragraph-words", [])).toBe(150);
    expect(maxOf("max-sentence-words", undefined)).toBe(55);
    expect(maxOf("max-paragraph-numbers", ["warn"])).toBe(8);
  });
});

const files = memoryFiles({ "/p/paper.tex": "" });
const rules = readabilityRules({
  files,
  latex: latexReader,
  codec: sourcesCodec,
});

/** What a rule reports on `body`, with `options`: line and message data. */
const reported = (
  name: ReadabilityRuleName,
  body: string,
  options: readonly unknown[] = [],
  withRaw = true,
) => {
  const src = doc(body);
  const out: unknown[] = [];
  const visitor = rules[name].create({
    filename: "/p/paper.tex",
    options,
    sourceCode: {
      text: src,
      ...(withRaw ? { raw: src } : {}),
      getLocFromIndex: (i) => ({
        line: src.slice(0, i).split("\n").length,
        column: 0,
      }),
    },
    report: (d) => out.push(d),
  });
  visitor.root?.();
  return out;
};

describe("the rules, through their create()", () => {
  it("each reports at the paragraph or sentence, with its message id", () => {
    // Guards: the three rules are wired to their own judge and message.
    expect(reported("max-paragraph-words", paragraph(16))).toEqual([
      {
        loc: {
          start: { line: 3, column: 0 },
          end: { line: 3, column: 0 },
        },
        messageId: "paragraph",
        data: {
          words: 160,
          max: 150,
          head: "The rule reads the body and counts what…",
        },
      },
    ]);
    expect(reported("max-paragraph-numbers", numbers(9))).toMatchObject([
      { messageId: "numbers" },
    ]);
    expect(reported("max-sentence-words", sentence(60))).toMatchObject([
      { messageId: "sentence" },
    ]);
  });

  it("a source without a raw text is read from its text", () => {
    // Guards: ESLint's source code may carry no `raw`; the rule falls back to `text`.
    expect(
      reported("max-paragraph-words", paragraph(16), [], false),
    ).toHaveLength(1);
  });

  it("an option moves the ceiling: 140 words fire under max 120", () => {
    expect(
      reported("max-paragraph-words", paragraph(14), [{ max: 120 }]).length,
    ).toBe(1);
    expect(reported("max-paragraph-words", paragraph(14)).length).toBe(0);
  });
});
