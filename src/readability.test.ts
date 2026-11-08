/**
 * `tex/max-paragraph-words` on real parses. Each half is built so that ONLY the paragraph length can
 * trip it: every sentence of a planted paragraph is ten words, so a long sentence is never the cause.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import {
  DEFAULT_MAX_PARAGRAPH_WORDS,
  judgeParagraphNumbers,
  judgeParagraphWords,
  judgeSentenceWords,
  maxOf,
  maxParagraphNumbersRule,
  maxParagraphWordsRule,
  maxSentenceWordsRule,
} from "./readability.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** Ten words: a paragraph of these trips nothing but its length. */
const TEN = "The rule reads the body and counts what it holds.";

/** A paragraph of exactly `words` words: ten-word sentences, then one shorter. */
const paragraph = (words: number): string =>
  [
    ...Array.from({ length: Math.floor(words / 10) }, () => TEN),
    ...(words % 10 === 0
      ? []
      : [
          `${Array.from({ length: (words % 10) - 1 }, () => "word").join(" ")} end.`,
        ]),
  ].join(" ");

/** What the judge finds in `body` at the default ceiling: the whole value. */
const found = (body: string) =>
  judgeParagraphWords(
    latexReader.bodyProse(doc(body)),
    DEFAULT_MAX_PARAGRAPH_WORDS,
  ).map((f) => f.data);

describe("tex/max-paragraph-words — a paragraph over the ceiling, and only that", () => {
  it("🔴 151 words: fires, with the count, the ceiling and the paragraph's first words", () => {
    // Guards: the case that was a false green once — a long single sentence tripped a sentence
    // ceiling and never the paragraph one. Here every sentence is at most ten words.
    expect(found(paragraph(151))).toEqual([
      {
        words: 151,
        max: 150,
        head: "The rule reads the body and counts what…",
      },
    ]);
  });

  it("150 words and a short paragraph: silent", () => {
    // Guards: the ceiling is inclusive — 150 is allowed.
    expect(found(paragraph(150))).toEqual([]);
    expect(found(paragraph(30))).toEqual([]);
  });

  it("two paragraphs of 100 words: each is judged alone, not the body", () => {
    // Guards: a paragraph break ends the count.
    expect(found(`${paragraph(100)}\n\n${paragraph(100)}`)).toEqual([]);
  });

  it("captions, floats, code, math environments and the bibliography are not prose", () => {
    const long = paragraph(200);
    // Guards: none of these is a paragraph a reader meets as a wall.
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
    ).toEqual([]);
  });
});

describe("maxOf — the ceiling a config sets", () => {
  it("the option when it is set, the default otherwise", () => {
    // Guards: ESLint has validated the option; anything else falls back to the default.
    expect(maxOf([{ max: 120 }])).toBe(120);
    expect(maxOf([])).toBe(150);
    expect(maxOf(undefined)).toBe(150);
    expect(maxOf(["warn"])).toBe(150);
  });
});

describe("the rule, through its create()", () => {
  const rule = maxParagraphWordsRule({
    files: memoryFiles({ "/p/paper.tex": "" }),
    latex: latexReader,
    codec: sourcesCodec,
  });

  /** What the rule reports on `body`, with `options`. */
  const reported = (
    body: string,
    options: readonly unknown[] = [],
    withRaw = true,
  ) => {
    const src = doc(body);
    const out: unknown[] = [];
    const visitor = rule.create({
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

  it("reports at the paragraph's first line, with its message id", () => {
    expect(reported(paragraph(160))).toEqual([
      {
        loc: { start: { line: 3, column: 0 }, end: { line: 3, column: 0 } },
        messageId: "paragraph",
        data: {
          words: 160,
          max: 150,
          head: "The rule reads the body and counts what…",
        },
      },
    ]);
  });

  it("a source without a raw text is read from its text", () => {
    // Guards: ESLint's source code may carry no `raw`; the rule falls back to `text`.
    expect(reported(paragraph(160), [], false)).toHaveLength(1);
  });

  it("an option moves the ceiling: 140 words fire under max 120, not under the default", () => {
    expect(reported(paragraph(140), [{ max: 120 }])).toHaveLength(1);
    expect(reported(paragraph(140))).toHaveLength(0);
  });
});

/** What the numbers judge finds in `body` at the default ceiling. */
const numbersFound = (body: string) => {
  const src = doc(body);
  return judgeParagraphNumbers(latexReader.bodyProse(src), src, 8).map(
    (f) => f.data,
  );
};

describe("tex/max-paragraph-numbers", () => {
  it("🔴 nine numbers fire, eight stay quiet; places, citations and references are not numbers", () => {
    const eight =
      "We ran 1 and 2.5 and 30\\% and 4,000 and \\numA{} and \\numTotal and 7 and 8.";
    expect(numbersFound(eight)).toEqual([]);
    expect(numbersFound(`${eight} Then 9.`)).toEqual([
      { numbers: 9, max: 8, head: "We ran 1 and 2.5 and 30% and…" },
    ]);
    // Guards: a place's number, a citation key and a reference are not quantities.
    expect(
      numbersFound(
        `${eight} See Section~3.2, Figs. 3 and 4, \\cite{k2024} and \\ref{sec:1}.`,
      ),
    ).toEqual([]);
  });
});

describe("tex/max-sentence-words", () => {
  const sentence = (n: number) =>
    `${Array.from({ length: n - 1 }, () => "word").join(" ")} end.`;
  const sFound = (body: string) =>
    judgeSentenceWords(latexReader.bodyProse(doc(body)), 55).map((f) => f.data);

  it("🔴 56 words fire, 55 stay quiet; e.g., et al., Fig. and decimals do not end a sentence", () => {
    expect(sFound(sentence(55))).toEqual([]);
    expect(sFound(sentence(56))).toEqual([
      { words: 56, max: 55, head: "word word word word word word word word…" },
    ]);
    // Guards: 30 + 30 words joined by abbreviations and a decimal is ONE sentence of 57 words.
    const w = (n: number) => Array.from({ length: n }, () => "w").join(" ");
    expect(
      sFound(
        `${w(10)} e.g. ${w(10)} et al. ${w(10)} Fig. 3 ${w(10)} 2.5 ${w(10)} end.`,
      ),
    ).toHaveLength(1);
  });
});

describe("the new rules, through create()", () => {
  const deps = {
    files: memoryFiles({ "/p/paper.tex": "" }),
    latex: latexReader,
    codec: sourcesCodec,
  };
  const run = (rule: ReturnType<typeof maxSentenceWordsRule>, body: string) => {
    const src = doc(body);
    const out: unknown[] = [];
    rule
      .create({
        filename: "/p/paper.tex",
        options: [],
        sourceCode: {
          text: src,
          getLocFromIndex: () => ({ line: 3, column: 0 }),
        },
        report: (d) => out.push(d),
      })
      .root?.();
    return out;
  };
  it("report with their message ids", () => {
    const long = Array.from({ length: 60 }, () => "word").join(" ");
    expect(run(maxSentenceWordsRule(deps), `${long}.`)).toHaveLength(1);
    expect(
      run(maxParagraphNumbersRule(deps), "1 2 3 4 5 6 7 8 9."),
    ).toHaveLength(1);
    expect(run(maxParagraphWordsRule(deps), "Short.")).toHaveLength(0);
  });
});
