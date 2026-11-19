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
  judgeCaptionWords,
  judgeParagraphNumbers,
  judgeParagraphWords,
  judgeSentenceWords,
  maxCaptionWordsRule,
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
  return judgeParagraphNumbers(latexReader.bodyProse(src), 8).map(
    (f) => f.data,
  );
};

describe("tex/max-paragraph-numbers", () => {
  it("🔴 nine numbers fire, eight stay quiet; citations and references are not numbers, a hand-typed place is", () => {
    const eight =
      "We ran 1 and 2.5 and 30\\% and 4,000 and \\numA{} and \\numTotal and 7 and 8.";
    expect(numbersFound(eight)).toEqual([]);
    expect(numbersFound(`${eight} Then 9.`)).toEqual([
      { numbers: 9, max: 8, head: "We ran 1 and 2.5 and 30% and…" },
    ]);
    // Guards: a citation key and a reference are not quantities.
    expect(
      numbersFound(`${eight} See \\cite{k2024} and \\ref{sec:1}.`),
    ).toEqual([]);
    // A place typed by hand is a number like any other; written with \\ref it is not.
    expect(numbersFound(`${eight} See Section 3.2.`)).toEqual([
      { numbers: 9, max: 8, head: "We ran 1 and 2.5 and 30% and…" },
    ]);
    expect(numbersFound(`${eight} See Section \\ref{sec:x}.`)).toEqual([]);
  });

  /** Eight numbers a reader sees, none of them a `\num…` macro. */
  const EIGHT = "We ran 1 and 2 and 3 and 4 and 5 and 6 and 7 and 8 times.";

  it("🔴 a `\\num…` macro in the paragraph's prose counts: the ninth fires", () => {
    expect(numbersFound(`${EIGHT} Then \\numFoo{} more.`)).toEqual([
      { numbers: 9, max: 8, head: "We ran 1 and 2 and 3 and…" },
    ]);
  });

  it("🔴 a `\\num…` macro inside inline math is math, not prose: not counted", () => {
    // Guards: the source between the paragraph's first and last piece holds the macro.
    expect(numbersFound(`${EIGHT} Then $\\num{9}$ more.`)).toEqual([]);
  });

  it("🔴 a `\\num…` macro on a commented-out line is not counted", () => {
    // Guards: a comment changes nothing on the page, so it cannot add a number.
    expect(numbersFound(`${EIGHT}\n% \\numFoo\nThen more.`)).toEqual([]);
  });

  it("🔴 a `\\num…` macro in a footnote counts for the footnote, not for the paragraph it hangs from", () => {
    // Guards: a footnote is a passage of its own; its numbers are its own.
    expect(
      numbersFound(`${EIGHT}\\footnote{See \\numFoo{}.} Then more.`),
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

  it("🔴 a sentence that opens in lowercase is its own (#543): the 82-word «sentence» of arXiv 2611.09573v1 is two", () => {
    // The source as the paper has it (sections/02_models_and_data.tex): `16\,GB. fp16 …`. The
    // segmenter withholds a break before a lowercase word; read as one sentence it is 82 words.
    const body = [
      "We did not pursue these formats: they need",
      "calibration and low-precision implementations of every operation, and in",
      "tests with Aurora they were either slower than bf16 or did not fit in",
      "16\\,GB. fp16 and bf16 are the",
      "reduced-precision formats that most users of these models can apply",
      "directly: they need no calibration, and fast fp16 arithmetic is",
      "available on NVIDIA GPUs from 2017 on, bf16 arithmetic from 2020 on",
      "\\citep{nvidia2017volta, nvidia2020ampere}, and both on current consumer and",
      "data-centre models.",
    ].join("\n");
    expect(sFound(body)).toEqual([]);
    expect(
      judgeSentenceWords(latexReader.bodyProse(doc(body)), 40).map(
        (f) => f.data,
      ),
    ).toEqual([
      {
        words: 48,
        max: 40,
        head: "fp16 and bf16 are the reduced-precision formats that…",
      },
    ]);
  });

  it("🔴 a `\\citet` that opens a sentence after a full stop starts it, and counts as its word", () => {
    const w = (n: number) => Array.from({ length: n }, () => "w").join(" ");
    expect(
      sFound(`${w(29)} quantised. \\citet{b} applied ${w(26)} end.`),
    ).toEqual([]);
    expect(
      sFound(`${w(29)} quantised. \\citet{b} applied ${w(53)} end.`),
    ).toEqual([
      { words: 56, max: 55, head: "applied w w w w w w w…" },
    ]);
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

/** `n` words as one run. */
const captionWords = (n: number): string =>
  Array.from({ length: n }, () => "word").join(" ");
/** A sentence of `n` words: capitalised, so the splitter ends the one before it. */
const sentence = (n: number): string => `Word ${captionWords(n - 1)}.`;
/** A paper whose one figure has `caption`. */
const fig = (caption: string): string =>
  doc(`Text.\n\\begin{figure}\\caption{${caption}}\\end{figure}`);

describe("tex/max-caption-words — a caption, or a caption sentence, over its ceiling", () => {
  const found = (caption: string, max = 100, maxSentence = 40) => {
    const src = fig(caption);
    return judgeCaptionWords(latexReader.captions(src), max, maxSentence).map(
      (f) => ({
        ...f,
        at: f.at && src.slice(f.at.start, f.at.start + 9),
      }),
    );
  };

  it("🔴 a caption of 101 words fires at its \\caption; one of 100 does not", () => {
    const four = [25, 25, 25, 26].map(sentence).join(" ");
    expect(found(four)).toEqual([
      {
        messageId: "caption",
        data: {
          words: 101,
          max: 100,
          head: "Word word word word word word word word…",
        },
        at: "\\caption{",
      },
    ]);
    expect(found([25, 25, 25, 25].map(sentence).join(" "))).toEqual([]);
  });

  it("🔴 a caption sentence of 41 words fires at its start; one of 40 does not", () => {
    expect(found(`${captionWords(41)}.`)).toEqual([
      {
        messageId: "captionSentence",
        data: {
          words: 41,
          max: 40,
          head: "word word word word word word word word…",
        },
        at: "word word",
      },
    ]);
    expect(found(`${captionWords(40)}.`)).toEqual([]);
  });

  it("🔴 a caption commented out or in verbatim is not measured", () => {
    const src = doc(
      `% \\caption{${captionWords(120)}.}\n\\begin{verbatim}\\caption{${captionWords(120)}.}\\end{verbatim}`,
    );
    expect(judgeCaptionWords(latexReader.captions(src), 100, 40)).toEqual([]);
  });
});

describe("tex/max-caption-words, through create()", () => {
  it("the options move both ceilings", () => {
    const rule = maxCaptionWordsRule({
      files: memoryFiles({ "/p/paper.tex": "" }),
      latex: latexReader,
      codec: sourcesCodec,
    });
    const ids = (options: readonly unknown[]) => {
      const src = fig(`${captionWords(30)}.`);
      const out: string[] = [];
      rule
        .create({
          filename: "/p/paper.tex",
          options,
          sourceCode: {
            text: src,
            getLocFromIndex: () => ({ line: 1, column: 0 }),
          },
          report: (d) => out.push("messageId" in d ? d.messageId : d.message),
        })
        .root?.();
      return out;
    };
    expect(ids([])).toEqual([]);
    expect(ids([{ max: 20, maxSentence: 25 }])).toEqual([
      "caption",
      "captionSentence",
    ]);
  });
});
