/**
 * pdf/venue-shape's messages: what each finding names (the paper's number, the venue's five numbers,
 * where they came from), the options, and the loud cases — no shape, a measure the PDF does not let
 * the counter read, a measure too few venue papers carry.
 */
import { describe, expect, it } from "vitest";
import type { VenueShape } from "./domain/venue-shape.ts";
import {
  judgeVenueShape,
  shapeOptionsOf,
  VENUE_SHAPE_META,
} from "./venue-shape-rule.ts";

/** Eight papers: figures 3…10, body words 6…13 (a caption line is a word), everything else one value. */
const SHAPE: VenueShape = {
  source: "ExampleConf 2025 accepted papers",
  url: "https://example.org/accepted",
  measured: "2026-10-11",
  papers: Array.from({ length: 8 }, (_, i) => ({
    paper: `p${String(i)}`,
    url: `https://example.org/${String(i)}.pdf`,
    pages: 10,
    shape: {
      body_words: 6 + i,
      figures: 3 + i,
      tables: 0,
      abstract_words: 2,
      references: 1,
    },
  })),
};

/** A paper: «Abstract—a b», no table, one reference, `figures` captions; 3 + `figures` words before the references. */
const pages = (figures: number): readonly string[] => [
  `Abstract—a b\nKeywords\n${Array.from({ length: figures }, (_, i) => `Fig. ${String(i + 1)}. \n`).join("")}`,
  "References\n[1] A.\n",
];

describe("judgeVenueShape", () => {
  it("🟢 a paper inside every band: nothing", () => {
    expect(judgeVenueShape(pages(6), SHAPE, "ExampleConf", undefined)).toEqual(
      [],
    );
  });

  it("🔴 one figure, under the lower quartile: the venue's numbers, the source and a proposal", () => {
    const [f] = judgeVenueShape(pages(1), SHAPE, "ExampleConf", {
      measures: ["figures"],
    });
    expect(f).toEqual({
      messageId: "below",
      data: {
        what: "figures (numbered captions)",
        got: 1,
        venue: "ExampleConf",
        bound: "the lower quartile",
        fence: "4.8",
        caveat: "A quarter of accepted papers sit past each quartile",
        hint: "The venue's accepted papers show more of their results as figures; a table or a run of numbers that would read better as a plot is one place to look.",
        n: 8,
        min: "3",
        q1: "4.8",
        median: "6.5",
        q3: "8.3",
        max: "10",
        source: "ExampleConf 2025 accepted papers",
        measured: "2026-10-11",
      },
    });
  });

  it("🔴 an abstract over the factor names the factor, not a quartile", () => {
    const found = judgeVenueShape(
      ["Abstract—a b c d\nKeywords\n", "References\n[1] A.\n"],
      SHAPE,
      "ExampleConf",
      { measures: ["abstract_words"] },
    );
    expect(
      found.map((f) => [f.messageId, f.data["bound"], f.data["fence"]]),
    ).toEqual([["above", "1.5 × the median", "3"]]);
    const short = judgeVenueShape(
      ["Abstract—\nKeywords\n", "References\n[1] A.\n"],
      SHAPE,
      "ExampleConf",
      { measures: ["abstract_words"], abstractFactor: 2 },
    );
    expect(
      short.map((f) => [f.messageId, f.data["bound"], f.data["fence"]]),
    ).toEqual([["below", "the median ÷ 2", "1"]]);
  });
});

describe("judgeVenueShape — the other side, and the loud cases", () => {
  it("a figure count above the upper quartile is a finding too: the check is two-sided", () => {
    expect(
      judgeVenueShape(pages(12), SHAPE, "ExampleConf", {
        measures: ["figures"],
      }).map((f) => [f.messageId, f.data["bound"]]),
    ).toEqual([["above", "the upper quartile"]]);
  });

  it("a preset with no shape: one finding saying there is nothing to compare with", () => {
    expect(judgeVenueShape(pages(6), null, "ExampleConf", undefined)).toEqual([
      { messageId: "noShape", data: { venue: "ExampleConf" } },
    ]);
  });

  it("a PDF with no «References» line: body words and references are said to be unmeasured", () => {
    expect(
      judgeVenueShape(["Abstract—a b\nKeywords\n"], SHAPE, "ExampleConf", {
        measures: ["body_words", "references"],
      }),
    ).toEqual([
      {
        messageId: "unmeasured",
        data: {
          what: "words before the references",
          venue: "ExampleConf",
          why: "no line reads «References» or «Bibliography»",
        },
      },
      {
        messageId: "unmeasured",
        data: {
          what: "numbered references",
          venue: "ExampleConf",
          why: "no references heading, or no entry after it opening with a number in brackets — an author-year bibliography is not counted",
        },
      },
    ]);
  });

  it("a venue with too few papers: thin, naming how many", () => {
    expect(
      judgeVenueShape(
        pages(6),
        { ...SHAPE, papers: SHAPE.papers.slice(0, 3) },
        "ExampleConf",
        { measures: ["tables"] },
      ),
    ).toEqual([
      {
        messageId: "thin",
        data: {
          what: "tables (numbered captions)",
          venue: "ExampleConf",
          n: 3,
          min: 8,
        },
      },
    ]);
  });
});

describe("shapeOptionsOf", () => {
  it("no options: every measure, factor 1.5", () => {
    expect(shapeOptionsOf(undefined)).toEqual({
      measures: [
        "body_words",
        "figures",
        "tables",
        "abstract_words",
        "references",
      ],
      abstractFactor: 1.5,
    });
  });
  it("a subset, in the counter's order, and a factor", () => {
    expect(
      shapeOptionsOf({ measures: ["tables", "figures"], abstractFactor: 2 }),
    ).toEqual({ measures: ["figures", "tables"], abstractFactor: 2 });
  });
});

describe("VENUE_SHAPE_META", () => {
  it("every message a finding can name exists", () => {
    expect(Object.keys(VENUE_SHAPE_META.messages).toSorted()).toEqual([
      "above",
      "below",
      "noShape",
      "thin",
      "unmeasured",
    ]);
  });
});
