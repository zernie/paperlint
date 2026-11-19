/**
 * The one sentence splitter, on plain text: where `Intl.Segmenter` cuts, the break it withholds
 * before a lowercase start (#543), and the full stops that end no sentence.
 */
import { describe, expect, it } from "vitest";
import { CITATION, MATH, REFERENCE, sentences } from "./sentences.ts";

/** The sentences of `text`, as text. */
const cut = (text: string): readonly string[] =>
  sentences(text).map(([from, to]) => text.slice(from, to));

describe("sentences — a sentence that opens in lowercase (#543)", () => {
  it("🔴 a typed lowercase name opens a sentence of its own", () => {
    expect(
      cut(
        "First sentence has four. fp16 and bf16 are formats. Next one here.",
      ),
    ).toEqual([
      "First sentence has four. ",
      "fp16 and bf16 are formats. ",
      "Next one here.",
    ]);
  });

  it("🔴 a number before the full stop changes nothing: `16 GB. fp16 …` is two sentences", () => {
    expect(cut("It did not fit in 16 GB. fp16 is the format.")).toEqual([
      "It did not fit in 16 GB. ",
      "fp16 is the format.",
    ]);
  });

  it("🔴 a citation or reference that opens the sentence is its subject, and stays with it", () => {
    expect(
      cut(`Weights are quantised. ${CITATION} applied it. ${REFERENCE} lists all.`),
    ).toEqual([
      "Weights are quantised. ",
      `${CITATION} applied it. `,
      `${REFERENCE} lists all.`,
    ]);
  });

  it("🔴 what a macro left out leaves a lowercase start, and the break is still there", () => {
    expect(cut("We test that evidence.  makes it explicit.")).toEqual([
      "We test that evidence.  ",
      "makes it explicit.",
    ]);
  });

  it("🔴 a sentence that opens with a digit and then lowercase words is its own: `69% of …`", () => {
    expect(cut("It is creation-control. 69% of the files differ.")).toEqual([
      "It is creation-control. ",
      "69% of the files differ.",
    ]);
  });

  it("🔴 math that opens a sentence goes with it", () => {
    expect(cut(`The bound is tight. ${MATH} is small here.`)).toEqual([
      "The bound is tight. ",
      `${MATH} is small here.`,
    ]);
  });
});

describe("sentences — a full stop before a lowercase word that ends nothing", () => {
  it.each([
    ["a listed abbreviation", "We use tools, e.g. linters and fuzzers."],
    ["a dotted abbreviation", "We draw i.i.d. samples from it."],
    ["a dotted abbreviation", "This is, a.k.a. the drift, a problem."],
    ["a dotted abbreviation", "It is minimal w.r.t. the order."],
    ["a dotted abbreviation in capitals", "Masters or Ph.D. students joined."],
    ["an initial", "Bai, Y. et al. report it."],
    ["an initial after a hyphenated one", "Hsieh, C.-P. et al. report it."],
    ["`etc.`", "Linters, fuzzers, etc. are tools."],
    ["a numbered thing's short name", "As in Eqn. 3 we see it."],
    ["a numbered thing's short name, lowercase", "The loss (eq. 2) is small."],
    ["a company's", "Chase & Co. and its affiliates."],
    ["a common truncation", "It took longer (avg. 3 steps more)."],
    ["a common truncation", "A small MLP (embedding dim. 64) is used."],
    ["a lowercase reference", "For flows see refs. 4 and 5 there."],
    ["an ellipsis", "We tried one, two... and then stopped."],
    ["a full stop inside brackets", "Displacement (Disp.) is the shift."],
    ["a decimal", "The rate is 2.5 per run."],
  ])("%s: %s", (_, text) => {
    expect(cut(text)).toEqual([text]);
  });

  it("before a capital, `etc.` and an initial end a sentence as before", () => {
    expect(cut("Linters, fuzzers, etc. The rest is manual.")).toEqual([
      "Linters, fuzzers, etc. ",
      "The rest is manual.",
    ]);
  });
});

describe("sentences — what the segmenter already did, unchanged", () => {
  it("a break after a listed abbreviation is undone", () => {
    expect(cut("As in Fig. 3, it holds. See Sec. Two for more.")).toEqual([
      "As in Fig. 3, it holds. ",
      "See Sec. Two for more.",
    ]);
  });

  it("a citation set right after the full stop belongs to the sentence it ends", () => {
    expect(cut(`It grew 900%. ${CITATION} Then it fell.`)).toEqual([
      `It grew 900%. ${CITATION}`,
      " Then it fell.",
    ]);
  });

  it("a question or an exclamation ends a sentence before a lowercase word, as the segmenter has it", () => {
    expect(cut("Does it hold? yes, always.")).toEqual([
      "Does it hold? ",
      "yes, always.",
    ]);
  });
});
