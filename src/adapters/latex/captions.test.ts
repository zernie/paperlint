/**
 * The captions of a LaTeX source (`captionsOf`) on real parses: the mandatory argument of `\caption`,
 * whatever optional argument, star or space precedes it, and none that a reader of the PDF never sees.
 */
import { describe, expect, it } from "vitest";
import { captionsOf, parseLatex } from "./index.ts";

const captions = (src: string): readonly string[] =>
  captionsOf(parseLatex(src));

describe("captionsOf", () => {
  it("the text of a caption: formatting kept as words, whitespace collapsed", () => {
    expect(
      captions(
        "\\begin{figure}\\caption{\\textbf{Big.}  Some   words.}\\end{figure}",
      ),
    ).toEqual(["Big. Some words."]);
  });

  it("with an optional argument, a star, or a space before the brace", () => {
    // Guards: a scan for `\caption{` read none of these.
    expect(
      captions(
        "\\caption[Short]{With option.} \\caption*{Starred.} \\caption {Spaced.}\n\\caption\n  {Next line.}",
      ),
    ).toEqual(["With option.", "Starred.", "Spaced.", "Next line."]);
  });

  it("in order, in the files' text as given; a caption with no words is left out", () => {
    expect(
      captions(
        "\\caption{One.}\\caption{}\\caption{\\centering}\\caption{Two.}",
      ),
    ).toEqual(["One.", "Two."]);
  });

  it("not one that is commented out, in verbatim, or in a macro's definition", () => {
    const src = [
      "% \\caption{Commented.}",
      "\\begin{verbatim}\\caption{Quoted.}\\end{verbatim}",
      "\\newcommand{\\fig}{\\caption{Defined.}}",
      "\\caption{Real.}",
    ].join("\n");
    expect(captions(src)).toEqual(["Real."]);
  });
});

describe("captionsOf — what a reader sees", () => {
  it("a formula counts as one word and an escaped character is itself", () => {
    // Guards: dropping them made a caption of 54 words one of 40 and let it pass.
    expect(
      captions(
        "\\caption{Cut by 65\\% of $20\\%$ and Welch $p$; \\textbf{bold} \\& more.}",
      ),
    ).toEqual(["Cut by 65% of math and Welch math; bold & more."]);
  });
});
