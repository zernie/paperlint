import { describe, expect, it } from "vitest";
import {
  parseReviewerPoints,
  judgeReviewerPoints,
  type ReviewerPoint,
} from "./reviewer-points.ts";

const point = (over: Record<string, unknown> = {}) => ({
  id: "A1",
  reviewer: "A",
  quote: "The evaluation uses two repositories only.",
  ...over,
});

const parsed = (points: readonly unknown[]) =>
  parseReviewerPoints({ points }, "reviews/c1-response.yaml");

describe("parseReviewerPoints — the points file, refused at read when its shape is wrong", () => {
  it("reads points with and without an answer, each answer in its own shape", () => {
    expect(
      parsed([
        point({ answer: { kind: "changed", where: "Threats to Validity" } }),
        point({ id: "A2", answer: { kind: "argued", where: "Discussion" } }),
        point({
          id: "B1",
          reviewer: "B",
          answer: { kind: "declined", reason: "Out of scope for a workshop." },
        }),
        point({ id: "B2", reviewer: "B" }),
      ]),
    ).toEqual({
      ok: true,
      value: [
        {
          id: "A1",
          reviewer: "A",
          quote: "The evaluation uses two repositories only.",
          answer: { kind: "changed", where: "Threats to Validity" },
        },
        {
          id: "A2",
          reviewer: "A",
          quote: "The evaluation uses two repositories only.",
          answer: { kind: "argued", where: "Discussion" },
        },
        {
          id: "B1",
          reviewer: "B",
          quote: "The evaluation uses two repositories only.",
          answer: { kind: "declined", reason: "Out of scope for a workshop." },
        },
        {
          id: "B2",
          reviewer: "B",
          quote: "The evaluation uses two repositories only.",
          answer: null,
        },
      ],
    });
  });

  it.each<[string, unknown, string]>([
    [
      "not a mapping",
      [],
      "reviews/c1-response.yaml: not a mapping with `points`",
    ],
    [
      "no points",
      { points: [] },
      "reviews/c1-response.yaml: `points` is not a non-empty list — a reviewed rejection has at least one point to answer",
    ],
    [
      "an unknown top-level key",
      { points: [point()], notes: "x" },
      'reviews/c1-response.yaml: unknown key "notes" — the file\'s keys: points',
    ],
    [
      "a point without its quote",
      { points: [point({ quote: "" })] },
      'reviews/c1-response.yaml: points[0] needs "id", "reviewer" and "quote", each non-empty text (the quote verbatim from the review)',
    ],
    [
      "two points with one id",
      { points: [point(), point()] },
      'reviews/c1-response.yaml: points[1]: the id "A1" is points[0]\'s too — each point is answered once, by its id',
    ],
    [
      "an unknown key on a point",
      { points: [point({ status: "done" })] },
      'reviews/c1-response.yaml: points[0]: unknown key "status" — a point\'s keys: id, reviewer, quote, answer',
    ],
    [
      "an answer of no known kind",
      { points: [point({ answer: { kind: "fixed", where: "x" } })] },
      'reviews/c1-response.yaml: points[0] (A1): "answer.kind" is changed, argued or declined, got "fixed"',
    ],
    [
      "a changed answer without where",
      { points: [point({ answer: { kind: "changed" } })] },
      'reviews/c1-response.yaml: points[0] (A1): a changed answer says where: "where": the title of the \\section in paper.tex that answers it',
    ],
    [
      "a declined answer without reason",
      { points: [point({ answer: { kind: "declined" } })] },
      'reviews/c1-response.yaml: points[0] (A1): a declined answer says why: "reason": one sentence',
    ],
    [
      "a declined answer that also names a place",
      {
        points: [
          point({ answer: { kind: "declined", reason: "r", where: "x" } }),
        ],
      },
      'reviews/c1-response.yaml: points[0] (A1).answer: unknown key "where" — a declined answer\'s keys: kind, reason',
    ],
  ])("refuses %s, naming it", (_, doc, why) => {
    expect(parseReviewerPoints(doc, "reviews/c1-response.yaml")).toEqual({
      ok: false,
      error: why,
    });
  });
});

describe("judgeReviewerPoints — once a later cycle is open, every point is answered, in a place that exists", () => {
  const points: readonly ReviewerPoint[] = [
    {
      id: "A1",
      reviewer: "A",
      quote: "q",
      answer: { kind: "changed", where: "Threats  to Validity" },
    },
    {
      id: "A2",
      reviewer: "A",
      quote: "q",
      answer: { kind: "argued", where: "Gone" },
    },
    {
      id: "B1",
      reviewer: "B",
      quote: "q",
      answer: { kind: "declined", reason: "r" },
    },
    { id: "B2", reviewer: "B", quote: "q", answer: null },
  ];

  it("names each unanswered point and each place that is no section; a declined answer needs none", () => {
    expect(
      judgeReviewerPoints(points, ["Introduction", "Threats to Validity"]),
    ).toEqual([
      { kind: "nowhere", id: "A2", reviewer: "A", where: "Gone" },
      { kind: "unanswered", id: "B2", reviewer: "B" },
    ]);
  });

  it("is quiet when every point is answered where the paper has that section", () => {
    expect(
      judgeReviewerPoints(points.slice(0, 1), ["Threats to Validity"]),
    ).toEqual([]);
  });
});
