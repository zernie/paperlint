/**
 * The captions of a LaTeX source (`captionProse`) on real parses: the mandatory argument of
 * `\caption`, whatever optional argument, star or space precedes it, read as prose the way the body
 * is, and none that a reader of the PDF never sees.
 */
import { describe, expect, it } from "vitest";
import { bodySentences, wordsOf } from "../../domain/register.ts";
import { captionProse, parseLatex } from "./index.ts";

describe("captionProse — each caption a reader sees, as prose with its place", () => {
  /** Each caption as its source text, its words and its sentences' words. */
  const shape = (src: string) =>
    captionProse(parseLatex(src)).map((c) => {
      const ss = bodySentences(c.passages);
      return {
        source: src.slice(c.span.start, c.span.end),
        words: wordsOf(ss),
        sentences: ss.map((s) => s.words),
      };
    });

  it("🔴 the \\caption with its argument, its words counted as the body's are: a formula or a citation is one word", () => {
    expect(
      shape(
        "\\begin{figure}\\caption{\\textbf{Big.} Cut by 65\\% of $20\\%$ \\cite{a}. Two more.}\\label{f}\\end{figure}",
      ),
    ).toEqual([
      {
        source:
          "\\caption{\\textbf{Big.} Cut by 65\\% of $20\\%$ \\cite{a}. Two more.}",
        words: 9,
        // «Big.» ends a sentence: a label is read as the reader reads it.
        sentences: [1, 6, 2],
      },
    ]);
  });

  it("🔴 with an optional argument, a star or a space before the brace; in order; one with no words left out", () => {
    expect(
      shape(
        "\\caption[Short]{With option.} \\caption*{Starred.} \\caption {Spaced.}\\caption{}\\caption{\\centering} \\caption",
      ).map((c) => c.words),
    ).toEqual([2, 1, 1]);
  });

  it("🔴 not one that is commented out, in verbatim, or in a macro's definition", () => {
    const src = [
      "% \\caption{Commented.}",
      "\\begin{verbatim}\\caption{Quoted.}\\end{verbatim}",
      "\\newcommand{\\fig}{\\caption{Defined.}}",
      "\\caption{Real one.}",
    ].join("\n");
    expect(shape(src).map((c) => c.source)).toEqual(["\\caption{Real one.}"]);
  });
});
