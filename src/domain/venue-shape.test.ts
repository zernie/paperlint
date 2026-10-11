/**
 * The venue-shape counter on page texts as pdf.js gives them (one string per page, a line break
 * after every line), the quartiles, and the judgement of a paper against a venue's measured papers.
 * The IEEE and ACM page shapes below are the ones pdf.js returns for IEEEtran and acmart builds:
 * «Abstract—» run into the first line, or «ABSTRACT» on a line of its own; «TABLE I» above its
 * caption; «Fig. 1.» and «Figure 1:» at the start of a caption line.
 */
import { describe, expect, it } from "vitest";
import {
  distributionOf,
  judgeShape,
  shapeOf,
  SHAPE_MEASURES,
  type Shape,
  type VenueShape,
} from "./venue-shape.ts";

const IEEE_PAGES: readonly string[] = [
  [
    "A Study of Things",
    "Anonymous Authors",
    "Abstract—We measure things in three ecosystems and find",
    "that most of them are rare.",
    "Index Terms—things, measurement",
    "I. I NTRODUCTION",
    "Things matter to developers.",
    "Fig. 1. The pipeline we built.",
    "TABLE I",
    "C OUNTS OF THINGS",
  ].join("\n") + "\n",
  [
    "Fig. 2. Results over time.",
    "As Fig. 1. shows, the pipeline is simple.",
    "Table I lists the counts; Table II the rest.",
    "TABLE II",
    "M ORE COUNTS",
    "R EFERENCES",
    "[1] A. Author, “A paper,” in Proc. X, 2020.",
    "[2] B. Author, “Another,” 2021.",
    "[12] C. Author, “Last,” 2022.",
  ].join("\n") + "\n",
];

const ACM_PAGES: readonly string[] = [
  [
    "Things in the Wild",
    "ABSTRACT",
    "Short abstract of five words.",
    "CCS CONCEPTS",
    "• Software and its engineering",
    "1 INTRODUCTION",
    "Figure 1: An overview.",
    "Table 1: The counts.",
  ].join("\n") + "\n",
  ["REFERENCES", "[1] One. 2020.", "[2] Two. 2021."].join("\n") + "\n",
];

describe("shapeOf — what a finished PDF's text measures", () => {
  it("an IEEEtran paper: words before the references, distinct captions, the abstract, the last entry", () => {
    expect(shapeOf(IEEE_PAGES)).toEqual({
      // Every token with a letter before «R EFERENCES»: 41 on page 1, 25 on page 2 (counted by hand).
      body_words: 66,
      figures: 2,
      tables: 2,
      abstract_words: 14,
      references: 12,
    });
  });

  it("an acmart paper: «ABSTRACT» on its own line, ended by «CCS CONCEPTS»", () => {
    expect(shapeOf(ACM_PAGES)).toEqual({
      body_words: 23,
      figures: 1,
      tables: 1,
      abstract_words: 5,
      references: 2,
    });
  });

  it("no references heading, no abstract heading: those measures are null, never zero", () => {
    expect(shapeOf(["A note\nFigure 1: x\nSome text here.\n"])).toEqual({
      body_words: null,
      figures: 1,
      tables: 0,
      abstract_words: null,
      references: null,
    });
  });

  it("an abstract with no line ending it on the first two pages is null: the counter cannot tell where it stops", () => {
    expect(
      shapeOf(["Abstract—text\nmore text\n", "still more\n", "Index Terms—x\n"])
        .abstract_words,
    ).toBeNull();
  });

  it("a title that starts with «Abstract…» is not the abstract heading", () => {
    expect(
      shapeOf(["Abstracting Away the Pain\nNo heading here.\n"]).abstract_words,
    ).toBeNull();
  });

  it("a references heading with nothing after it: the body ends there, no entry is counted", () => {
    const s = shapeOf(["Body words.\nReferences\n"]);
    expect([s.body_words, s.references]).toEqual([2, null]);
  });

  it("an author-year bibliography has no numbered entry: references is null, the body still ends at the heading", () => {
    const s = shapeOf(["Body words here.\nReferences\nDoe, J. 2020. A.\n"]);
    expect([s.body_words, s.references]).toEqual([3, null]);
  });

  it("a «References» line inside the body is passed over for the heading followed by [1]", () => {
    const s = shapeOf([
      "Body.\nReferences\nare discussed below.\nMore body.\nReferences\n[1] A.\n",
    ]);
    // Body. References are discussed below. More body. — seven tokens with a letter.
    expect(s.body_words).toBe(7);
  });
});

describe("distributionOf — the quartiles, by linear interpolation between order statistics", () => {
  it("four values", () => {
    expect(distributionOf([4, 1, 3, 2])).toEqual({
      n: 4,
      min: 1,
      q1: 1.75,
      median: 2.5,
      q3: 3.25,
      max: 4,
    });
  });
  it("one value is its own every quartile", () => {
    expect(distributionOf([7])).toEqual({
      n: 1,
      min: 7,
      q1: 7,
      median: 7,
      q3: 7,
      max: 7,
    });
  });
  it("no values: no distribution", () => {
    expect(distributionOf([])).toBeNull();
  });
});

/** Ten accepted papers: figures 2…11, tables 1…10, abstracts of 200 words, body 7000…7900. */
const venue = (patch: Partial<Shape> = {}, count = 10): VenueShape => ({
  source: "ExampleConf 2025 accepted papers",
  url: "https://example.org/accepted",
  measured: "2026-10-11",
  papers: Array.from({ length: count }, (_, i) => ({
    paper: `p${String(i)}`,
    url: `https://example.org/p${String(i)}.pdf`,
    pages: 12,
    shape: {
      body_words: 7000 + i * 100,
      figures: 2 + i,
      tables: 1 + i,
      abstract_words: 200,
      references: 40 + i,
      ...patch,
    },
  })),
});

const OPTIONS = { measures: SHAPE_MEASURES, abstractFactor: 1.5 };
/** The median paper of `venue()`. */
const MEDIAN: Shape = {
  body_words: 7450,
  figures: 6,
  tables: 5,
  abstract_words: 200,
  references: 44,
};

describe("judgeShape — a paper against its venue's measured papers", () => {
  it("🟢 the venue's median paper: nothing", () => {
    expect(judgeShape(MEDIAN, venue(), OPTIONS)).toEqual([]);
  });

  it("🟢 at the quartiles and at exactly 1.5× the median abstract: nothing — the fences are inclusive", () => {
    const s = {
      ...MEDIAN,
      figures: 4.25,
      body_words: 7675,
      abstract_words: 300,
    };
    expect(judgeShape(s, venue(), OPTIONS)).toEqual([]);
  });

  it("🔴 figures below the lower quartile, body above the upper, abstract over 1.5× the median", () => {
    const dist = (values: readonly number[]) => distributionOf(values);
    const s = { ...MEDIAN, figures: 2, body_words: 9100, abstract_words: 301 };
    expect(judgeShape(s, venue(), OPTIONS)).toEqual([
      {
        kind: "outside",
        measure: "body_words",
        side: "above",
        got: 9100,
        fence: 7675,
        bound: "quartile",
        dist: dist([
          7000, 7100, 7200, 7300, 7400, 7500, 7600, 7700, 7800, 7900,
        ]),
      },
      {
        kind: "outside",
        measure: "figures",
        side: "below",
        got: 2,
        fence: 4.25,
        bound: "quartile",
        dist: dist([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      },
      {
        kind: "outside",
        measure: "abstract_words",
        side: "above",
        got: 301,
        fence: 300,
        bound: "factor",
        dist: dist(Array.from({ length: 10 }, () => 200)),
      },
    ]);
  });
});

describe("judgeShape — the options, and what it cannot judge", () => {
  it("🔴 an abstract under the median ÷ the factor is reported too: the check has a floor", () => {
    const [f] = judgeShape({ ...MEDIAN, abstract_words: 100 }, venue(), {
      ...OPTIONS,
      abstractFactor: 1.5,
    });
    expect([f?.kind, f?.kind === "outside" && f.side]).toEqual([
      "outside",
      "below",
    ]);
  });

  it("only the measures the options name are judged", () => {
    expect(
      judgeShape({ ...MEDIAN, figures: 0 }, venue(), {
        ...OPTIONS,
        measures: ["body_words"],
      }),
    ).toEqual([]);
  });

  it("a measure the paper's PDF could not count is said, not skipped", () => {
    expect(
      judgeShape({ ...MEDIAN, abstract_words: null }, venue(), OPTIONS),
    ).toEqual([{ kind: "unmeasured", measure: "abstract_words" }]);
  });

  it("a measure fewer than eight venue papers carry is said, not judged", () => {
    expect(
      judgeShape(MEDIAN, venue({ references: null }), {
        ...OPTIONS,
        measures: ["references"],
      }),
    ).toEqual([{ kind: "thin", measure: "references", n: 0 }]);
    expect(
      judgeShape(MEDIAN, venue({}, 7), { ...OPTIONS, measures: ["figures"] }),
    ).toEqual([{ kind: "thin", measure: "figures", n: 7 }]);
  });
});
