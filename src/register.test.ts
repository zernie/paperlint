/**
 * `tex/register` on real parses: sentences of the body opening with And, So, But, Nor, Or or Yet per
 * 1000 words, reported once for the whole body when the rate runs above what accepted papers show.
 * Both halves, what counts as a word and as a conjunction start, the floor under which a rate means
 * nothing, and the option.
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
const PLAIN =
  "The rule reads the body of the paper and counts every sentence it holds.";
/** Thirteen words, opening with a conjunction. */
const CONJ = "But the rule reads the body of the paper and counts each one.";

/** A body of `plain` plain sentences and `conj` conjunction starts, in paragraphs. */
const body = (plain: number, conj: number): string =>
  [
    ...Array.from({ length: plain }, () => PLAIN),
    ...Array.from({ length: conj }, () => CONJ),
  ]
    .map((s, i) => (i % 10 === 9 ? `${s}\n\n` : `${s} `))
    .join("");

const measured = (src: string) =>
  measureRegister(latexReader.bodyProse(doc(src)));

describe("measureRegister — what the body is counted as", () => {
  it("its words, and its sentences opening with a conjunction", () => {
    expect(measured(`${PLAIN} ${CONJ} Yet it holds.`)).toMatchObject({
      words: 14 + 13 + 3,
      conjunctionStarts: 2,
    });
  });

  it("a citation, a reference and math each read as a word", () => {
    expect(
      measured(
        "We show a sample in Table~\\ref{t}. It follows~\\cite{k} with $n$ runs.",
      ),
    ).toMatchObject({ words: 7 + 6 });
  });

  it("🔴 a conjunction opens a sentence only as its first word and capitalised: a list item's «and», «Android», «Oracle» do not", () => {
    expect(
      measured(
        "And it holds. Android ships it. Oracle runs it. Some sentences, and more.\n\\begin{itemize}\n\\item and the rest.\n\\end{itemize}",
      ),
    ).toMatchObject({ conjunctionStarts: 1 });
  });

  it("a sentence with no word in it — a stray mark, a lone full stop — adds nothing", () => {
    expect(measured("\\cite{k}. . It holds here.")).toMatchObject({
      words: 3,
    });
    expect(measured(". !")).toMatchObject({ words: 0 });
    expect(measureRegister([])).toMatchObject({ words: 0, at: null });
  });

  it("the examples are the first three, as the reader sees them", () => {
    expect(
      measured(`${CONJ} So it goes. Or not. And again. Yet more.`).examples,
    ).toEqual([
      "But the rule reads the body of the paper and counts each one.",
      "So it goes.",
      "Or not.",
    ]);
  });
});

describe("judgeRegister — one finding when the rate runs above the limit", () => {
  const judged = (src: string, limit?: number) =>
    judgeRegister(measured(src), limit).map((f) => f.messageId);

  it("a body like an accepted paper's is silent", () => {
    // 200 × 14 + 13 = 2 813 words, 1 start: 0.36 per 1000.
    expect(judged(body(200, 1))).toEqual([]);
  });

  it("🔴 conjunction starts above 0.8 per 1000 words are reported, once", () => {
    // 200 × 14 + 3 × 13 = 2 839 words, 3 starts: 1.06 per 1000.
    expect(judged(body(200, 3))).toEqual(["conjunctionStarts"]);
  });

  it("at the limit is not above it", () => {
    expect(judged(body(200, 3), 1000 * (3 / (200 * 14 + 3 * 13)))).toEqual([]);
  });

  it("🔴 under the floor of words a rate means nothing, and nothing is reported", () => {
    const tiny = "It holds here. But it holds.";
    expect(measured(tiny).words).toBeLessThan(MIN_WORDS);
    expect(judged(tiny)).toEqual([]);
  });

  it("the limit is an option: raised, the same body is silent; lowered, it reports", () => {
    expect(judged(body(200, 3), 2)).toEqual([]);
    expect(judged(body(200, 1), 0.2)).toEqual(["conjunctionStarts"]);
  });

  it("the finding carries the rate, the count, the limit and the examples", () => {
    const [f] = judgeRegister(measured(body(200, 3)));
    expect(f?.data).toMatchObject({
      count: 3,
      rate: "1.06",
      limit: 0.8,
      examples: `«${CONJ}», «${CONJ}», «${CONJ}»`,
    });
  });
});

describe("the rule — reported at the start of the body, the option read from the config", () => {
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
  const FOUND = { messageId: "conjunctionStarts" };

  it("🔴 one finding, where the body's first sentence starts", () => {
    expect(run(doc(body(200, 4)))).toEqual([{ line: 3, ...FOUND }]);
  });

  it("the option in the config changes the limit; an option object without it keeps the default", () => {
    expect(run(doc(body(200, 4)), [{ conjunctionStartsPer1000: 2 }])).toEqual(
      [],
    );
    expect(run(doc(body(200, 4)), [{}])).toEqual([{ line: 3, ...FOUND }]);
  });

  it("a body read without a document environment is reported at the top", () => {
    expect(run(body(200, 4))).toEqual([{ line: 1, ...FOUND }]);
  });
});
