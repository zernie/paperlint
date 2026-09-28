/** The values a LaTeX source is read into: a run's text and the span of a range inside it. */
import { describe, expect, it } from "vitest";
import {
  collapse,
  documentClassLine,
  missingOptions,
  runText,
  spanIn,
  venueClass,
  type TextRun,
} from "./tex-document.ts";

// "ab" at 10, then " " at 20 (one character standing for a longer whitespace), then "cd" at 30.
const RUN: TextRun = {
  segments: [
    { text: "ab", at: 10 },
    { text: " ", at: 20 },
    { text: "cd", at: 30 },
  ],
};

describe("a text run", () => {
  it("its text is its segments' text, in order", () => {
    expect(runText(RUN)).toBe("ab cd");
  });

  it("spanIn: from the first character's offset to past the last's, across segments", () => {
    expect(spanIn(RUN, 0, 2)).toEqual({ start: 10, end: 12 });
    expect(spanIn(RUN, 1, 4)).toEqual({ start: 11, end: 31 });
    expect(spanIn(RUN, 3, 5)).toEqual({ start: 30, end: 32 });
  });

  it("🔴 spanIn: an empty range, or one reaching outside the run, has no span — never {0, 0}", () => {
    expect(spanIn(RUN, 2, 2)).toBe(null);
    expect(spanIn(RUN, -1, 2)).toBe(null);
    expect(spanIn(RUN, 3, 9)).toBe(null);
    expect(spanIn(RUN, 9, 10)).toBe(null);
  });
});

describe("a document class", () => {
  it("documentClassLine writes it back; with no options, no brackets", () => {
    expect(
      documentClassLine({
        cls: "IEEEtran",
        options: ["conference", "compsoc"],
      }),
    ).toBe("\\documentclass[conference,compsoc]{IEEEtran}");
    expect(documentClassLine({ cls: "article", options: [] })).toBe(
      "\\documentclass{article}",
    );
  });

  it("missingOptions: every option of the wanted class the paper lacks, in the wanted order", () => {
    expect(
      missingOptions(
        { cls: "x", options: ["b"] },
        { cls: "x", options: ["a", "b", "c"] },
      ),
    ).toEqual(["a", "c"]);
  });

  it("venueClass: another class is replaced; the same class gains the missing options, or is kept", () => {
    const want = { cls: "IEEEtran", options: ["conference", "compsoc"] };
    expect(venueClass({ cls: "article", options: ["11pt"] }, want)).toEqual({
      kind: "replace",
      by: want,
    });
    expect(
      venueClass({ cls: "IEEEtran", options: ["review", "conference"] }, want),
    ).toEqual({ kind: "add", options: ["compsoc"] });
    expect(
      venueClass({ cls: "IEEEtran", options: ["compsoc", "conference"] }, want),
    ).toEqual({ kind: "keep" });
  });

  it("collapse: every run of whitespace, newlines included, and trims", () => {
    expect(collapse("  LLM   Usage\n Statement ")).toBe("LLM Usage Statement");
  });
});
