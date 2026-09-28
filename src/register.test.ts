/**
 * `tex/register` on real parses: the body's share of sentences under eight words, and its sentences
 * opening with And, So, But, Nor, Or or Yet per 1000 words — each reported once, for the whole body,
 * when it runs above what accepted papers show. Both halves of each measure, the floor under which a
 * rate means nothing, and the options.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import {
  judgeRegister,
  measureRegister,
  MIN_WORDS,
  registerRule,
} from "./register.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** Fourteen words. */
const LONG =
  "The rule reads the body of the paper and counts every sentence it holds.";
/** Three words. */
const SHORT = "It holds here.";
/** Thirteen words, opening with a conjunction. */
const CONJ = "But the rule reads the body of the paper and counts each one.";

/** A body of `long` long sentences, `short` short ones and `conj` conjunction starts, in paragraphs. */
const body = (long: number, short: number, conj: number): string =>
  [
    ...Array.from({ length: long }, () => LONG),
    ...Array.from({ length: short }, () => SHORT),
    ...Array.from({ length: conj }, () => CONJ),
  ]
    .map((s, i) => (i % 10 === 9 ? `${s}\n\n` : `${s} `))
    .join("");

const measured = (src: string) =>
  measureRegister(latexReader.bodyProse(doc(src)));

describe("measureRegister — what the body is counted as", () => {
  it("sentences, words, the short ones and the ones opening with a conjunction", () => {
    expect(measured(`${LONG} ${SHORT} ${CONJ} Yet it holds.`)).toMatchObject({
      sentences: 4,
      words: 14 + 3 + 13 + 3,
      short: 2,
      conjunctionStarts: 2,
    });
  });

  it("a citation, a reference and math each read as a word: «as shown in Table 3» is not short", () => {
    expect(
      measured(
        "We show a sample in Table~\\ref{t}. It follows~\\cite{k} with $n$ runs.",
      ),
    ).toMatchObject({ sentences: 2, words: 7 + 6, short: 2 });
    expect(
      measured("We show one small sample of it in Table~\\ref{t}."),
    ).toMatchObject({ short: 0 });
  });

  it("🔴 a conjunction opens a sentence only as its first word and capitalised: a list item's «and», «Android», «Oracle» do not", () => {
    expect(
      measured(
        "And it holds. Android ships it. Oracle runs it. Some sentences, and more.\n\\begin{itemize}\n\\item and the rest.\n\\end{itemize}",
      ),
    ).toMatchObject({ conjunctionStarts: 1 });
  });

  it("a sentence with no word in it — a stray mark, a lone full stop — is not a sentence", () => {
    expect(measured("\\cite{k}. . It holds here.")).toMatchObject({
      sentences: 1,
      words: 3,
    });
    expect(measured(". !")).toMatchObject({ sentences: 0, words: 0 });
  });

  it("the examples are the first three of each kind, as the reader sees them", () => {
    const m = measured(`${SHORT} Yes. ${CONJ} Right. Fine. So it goes.`);
    expect(m.shortExamples).toEqual(["It holds here.", "Yes.", "Right."]);
    expect(m.conjunctionExamples).toEqual([
      "But the rule reads the body of the paper and counts each one.",
      "So it goes.",
    ]);
  });
});

describe("judgeRegister — a finding for each measure above its limit", () => {
  const judged = (src: string, options = {}) =>
    judgeRegister(measured(src), options).map((f) => f.messageId);

  it("a body like an accepted paper's is silent", () => {
    expect(judged(body(200, 10, 1))).toEqual([]);
  });

  it("🔴 short sentences above 12% of the body are reported, once", () => {
    // 200 long, 30 short: 13.0%.
    expect(judged(body(200, 30, 0))).toEqual(["shortSentences"]);
  });

  it("at the limit is not above it", () => {
    // 24 short of 200 sentences: exactly 12%.
    expect(judged(body(176, 24, 0))).toEqual([]);
  });

  it("🔴 conjunction starts above 0.8 per 1000 words are reported, once", () => {
    // 200 × 14 + 3 × 13 = 2 839 words, 3 starts: 1.06 per 1000.
    expect(judged(body(200, 0, 3))).toEqual(["conjunctionStarts"]);
  });

  it("both, when both run high", () => {
    expect(judged(body(200, 40, 4))).toEqual([
      "shortSentences",
      "conjunctionStarts",
    ]);
  });

  it("🔴 under the floor of words a rate means nothing, and nothing is reported", () => {
    const tiny = `${SHORT} ${SHORT} But it holds.`;
    expect(measured(tiny).words).toBeLessThan(MIN_WORDS);
    expect(judged(tiny)).toEqual([]);
  });

  it("the limits are options: raised, the same body is silent; lowered, it reports", () => {
    expect(
      judged(body(200, 40, 4), {
        shortSentencePercent: 20,
        conjunctionStartsPer1000: 2,
      }),
    ).toEqual([]);
    expect(judged(body(200, 10, 1), { shortSentencePercent: 4 })).toEqual([
      "shortSentences",
    ]);
  });

  it("the finding carries the rate, the count, the limit and the examples", () => {
    const [f] = judgeRegister(measured(body(200, 0, 3)), {});
    expect(f?.data).toMatchObject({
      count: 3,
      rate: "1.06",
      limit: 0.8,
      examples: `«${CONJ}», «${CONJ}», «${CONJ}»`,
    });
  });
});

describe("the rule — reported at the start of the body, options read from the config", () => {
  interface Seen {
    readonly line: number;
    readonly messageId: string;
  }
  const run = (src: string, options?: readonly unknown[]): Seen[] => {
    const seen: Seen[] = [];
    registerRule({ files: memoryFiles({}), latex: latexReader })
      .create({
        filename: "/p/paper.tex",
        ...(options === undefined ? {} : { options }),
        sourceCode: {
          text: src,
          getLocFromIndex: (i) => {
            const line = src.slice(0, i).split("\n").length;
            return { line, column: i - src.lastIndexOf("\n", i - 1) };
          },
        },
        report: (d) => {
          seen.push({
            line: d.loc.start.line,
            messageId: "messageId" in d ? d.messageId : d.message,
          });
        },
      })
      .root?.();
    return seen;
  };

  it("🔴 one finding, where the body's first sentence starts", () => {
    expect(run(doc(body(200, 40, 0)))).toEqual([
      { line: 3, messageId: "shortSentences" },
    ]);
  });

  it("an option in the config changes the limit", () => {
    expect(run(doc(body(200, 40, 0)), [{ shortSentencePercent: 30 }])).toEqual(
      [],
    );
  });

  it("a body read without a document environment is reported at the top", () => {
    expect(run(body(200, 40, 0))).toEqual([
      { line: 1, messageId: "shortSentences" },
    ]);
  });
});
