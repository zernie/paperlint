/**
 * The labels of a LaTeX source's running text (`labelsOf`) on real parses: what each takes its
 * number from in its paragraph, and the step of the counter whose number it records. The cases are
 * the ones #447 measured: a label after a bold run-in heading prints the enclosing section's number.
 */
import { describe, expect, it } from "vitest";
import type { PlacedLabel } from "../../domain/tex-document.ts";
import { labelsOf, parseLatex } from "./index.ts";

const labels = (src: string): readonly PlacedLabel[] =>
  labelsOf(parseLatex(src));

const doc = (body: string, cls = "\\documentclass{article}"): string =>
  `${cls}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** Where `needle` stands in `src`, as a span over it. */
const spanOf = (src: string, needle: string) => {
  const start = src.indexOf(needle);
  return { start, end: start + needle.length };
};

/** The step a heading takes: where the command starts, and what a message calls it. */
const step = (src: string, needle: string, what: string) => ({
  at: {
    kind: "at",
    span: {
      start: src.indexOf(needle),
      end: src.indexOf(needle) + needle.indexOf("{"),
    },
  },
  what,
});

describe("labelsOf: a bold phrase that opens the paragraph", () => {
  it("the paper that printed «Sections V-A, V-A and V-B»: the label after the bold heading is a run-in's", () => {
    const src = doc(
      [
        "\\section{Results}\\label{sec:results}",
        "\\subsection{Check}\\label{sec:check}",
        "We checked.",
        "",
        "\\textbf{Merged history.}\\label{sec:rq2} We also compared merged changes.",
      ].join("\n"),
    );
    // Guards: the label on the heading takes the heading's number; the one after the bold phrase
    // takes nothing of its own, and stands under the subsection whose number it prints.
    expect(labels(src)).toEqual([
      {
        key: "sec:results",
        span: spanOf(src, "\\label{sec:results}"),
        anchor: { kind: "numbered" },
        takes: step(src, "\\section{Results}", "\\section «Results»"),
      },
      {
        key: "sec:check",
        span: spanOf(src, "\\label{sec:check}"),
        anchor: { kind: "numbered" },
        takes: step(src, "\\subsection{Check}", "\\subsection «Check»"),
      },
      {
        key: "sec:rq2",
        span: spanOf(src, "\\label{sec:rq2}"),
        anchor: { kind: "run-in", title: "Merged history." },
        takes: step(src, "\\subsection{Check}", "\\subsection «Check»"),
      },
    ]);
  });

  it("a label inside the bold phrase, or later in its paragraph, is the run-in's too", () => {
    const src = doc(
      [
        "\\subsection{Check}",
        "\\textbf{RQ2.\\label{rq2}} Text.",
        "",
        "\\noindent\\textit{RQ3:} Text that runs on~\\cite{x} and \\label{rq3} on.",
      ].join("\n"),
    );
    expect(labels(src)).toEqual([
      {
        key: "rq2",
        span: spanOf(src, "\\label{rq2}"),
        anchor: { kind: "run-in", title: "RQ2." },
        takes: step(src, "\\subsection{Check}", "\\subsection «Check»"),
      },
      {
        key: "rq3",
        span: spanOf(src, "\\label{rq3}"),
        anchor: { kind: "run-in", title: "RQ3:" },
        takes: step(src, "\\subsection{Check}", "\\subsection «Check»"),
      },
    ]);
  });
});

describe("labelsOf: what the issue names clean", () => {
  it("quiet on what the issue names clean: a label before the run-in, a new paragraph, bold that is no heading, a counter stepped", () => {
    const src = doc(
      [
        "\\subsection{Check}\\label{a}",
        "\\textbf{RQ1.} Text.",
        "",
        "\\label{b}\\textbf{RQ2.} Text.",
        "",
        "More text \\label{c}.",
        "",
        "\\textbf{Note} that this \\label{d} holds.",
        "",
        "\\textbf{RQ4.} \\refstepcounter{rq}\\label{e} Text.",
        "",
        "Text \\textbf{inline.} \\label{f}",
      ].join("\n"),
    );
    // Guards: a run-in counts only when it opens the paragraph and comes before the label, and a
    // paragraph break ends it.
    expect(labels(src).map((l) => [l.key, l.anchor.kind])).toEqual([
      ["a", "numbered"],
      ["b", "none"],
      ["c", "none"],
      ["d", "none"],
      ["e", "numbered"],
      ["f", "none"],
    ]);
  });

  it("a label inside a float, a list or any environment is not one of the running text's", () => {
    const src = doc(
      [
        "\\textbf{RQ1.} Text.",
        "\\begin{figure}\\caption{A figure.}\\label{fig}\\end{figure}",
        "\\begin{itemize}\\item \\textbf{RQ2.}\\label{item}\\end{itemize}",
        "\\label{after}",
      ].join("\n"),
    );
    // Guards: after an environment the paragraph's run-in no longer decides what the label takes.
    expect(labels(src).map((l) => [l.key, l.anchor.kind])).toEqual([
      ["after", "none"],
    ]);
  });
});

describe("labelsOf: a heading that steps no counter", () => {
  it("a starred heading steps no counter: a label after it is a run-in's", () => {
    const src = doc("\\subsection{Check}\n\\subsection*{Merged}\\label{m}");
    expect(labels(src)).toEqual([
      {
        key: "m",
        span: spanOf(src, "\\label{m}"),
        anchor: { kind: "run-in", title: "Merged" },
        takes: step(src, "\\subsection{Check}", "\\subsection «Check»"),
      },
    ]);
  });
});

describe("labelsOf: how deep the class numbers", () => {
  it("\\paragraph is numbered as deep as the class or the source sets secnumdepth", () => {
    const after = (cls: string, preamble = ""): string | undefined =>
      labels(
        `${cls}\n${preamble}\n\\begin{document}\n\\subsection{Check}\n\\paragraph{P.}\\label{p}\n\\end{document}\n`,
      ).at(0)?.anchor.kind;
    // Guards: article and acmart number to \subsubsection (3), IEEEtran to \paragraph (4) except a
    // technote or a compsoc conference paper, and the source's own \setcounter wins.
    expect([
      after("\\documentclass{article}"),
      after("\\documentclass{IEEEtran}"),
      after("\\documentclass[conference]{IEEEtran}"),
      after("\\documentclass[technote]{IEEEtran}"),
      after("\\documentclass[conference,compsoc]{IEEEtran}"),
      after("\\documentclass[compsoc]{IEEEtran}"),
      after("\\documentclass[sigconf]{acmart}"),
      after("\\documentclass{article}", "\\setcounter{secnumdepth}{4}"),
      after("\\documentclass{IEEEtran}", "\\setcounter{secnumdepth}{3}"),
      after("\\documentclass{article}", "\\setcounter{page}{4}"),
    ]).toEqual([
      "run-in",
      "numbered",
      "numbered",
      "run-in",
      "run-in",
      "numbered",
      "run-in",
      "numbered",
      "run-in",
      "run-in",
    ]);
  });

  it("acmart's acmcp format numbers no heading: a label after \\section is a run-in's", () => {
    const src = doc(
      "\\section{Intro}\\label{i}",
      "\\documentclass[acmcp]{acmart}",
    );
    expect(labels(src).map((l) => [l.key, l.anchor, l.takes])).toEqual([
      ["i", { kind: "run-in", title: "Intro" }, null],
    ]);
  });
});

describe("labelsOf: other classes, and a depth that cannot be read", () => {
  it("llncs numbers to \\subsection: a label after \\subsubsection is a run-in's", () => {
    const src = doc(
      "\\subsection{Check}\n\\subsubsection{Deep}\\label{d}",
      "\\documentclass{llncs}",
    );
    expect(labels(src).map((l) => [l.key, l.anchor, l.takes])).toEqual([
      [
        "d",
        { kind: "run-in", title: "Deep" },
        step(src, "\\subsection{Check}", "\\subsection «Check»"),
      ],
    ]);
  });

  it("when the depth cannot be read, an unstarred heading counts as numbered", () => {
    const after = (src: string): string | undefined =>
      labels(src).at(0)?.anchor.kind;
    // Guards: no class line, two candidate classes, or a secnumdepth that is not a number — the
    // rule then judges only what is certain, the bold phrase and the starred heading.
    expect([
      after("\\paragraph{P.}\\label{p}"),
      after(
        "\\iftrue\\documentclass{article}\\else\\documentclass{llncs}\\fi\n\\begin{document}\\paragraph{P.}\\label{p}\\end{document}",
      ),
      after(
        doc(
          "\\paragraph{P.}\\label{p}",
          "\\documentclass{article}\n\\setcounter{secnumdepth}{\\maxdimen}",
        ),
      ),
      after(
        doc(
          "\\paragraph{P.}\\label{p}",
          "\\documentclass{article}\n\\setcounter{secnumdepth}{}",
        ),
      ),
      after("\\paragraph*{P.}\\label{p}"),
    ]).toEqual(["numbered", "numbered", "numbered", "numbered", "run-in"]);
  });
});

describe("labelsOf: what is read", () => {
  it("a fragment (no document environment) is read whole; a label before any heading stands under none", () => {
    const src = "\\textbf{RQ1.}\\label{x} Text.";
    expect(labels(src)).toEqual([
      {
        key: "x",
        span: spanOf(src, "\\label{x}"),
        anchor: { kind: "run-in", title: "RQ1." },
        takes: null,
      },
    ]);
  });

  it("a caption or a counter stepped is what the next label takes; a label with no anchor takes nothing known", () => {
    const src = doc(
      "\\section{A}\n\\refstepcounter{rq}\\label{r}\n\n\\textbf{X.}\\label{x}\n\n\\label{n}",
    );
    expect(labels(src).map((l) => [l.key, l.takes?.what ?? null])).toEqual([
      ["r", "\\refstepcounter"],
      ["x", "\\refstepcounter"],
      ["n", null],
    ]);
  });

  it("not a label in a comment", () => {
    expect(labels(doc("% \\textbf{RQ1.}\\label{x}\nText."))).toEqual([]);
  });
});
