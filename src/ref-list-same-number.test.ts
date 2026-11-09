/**
 * `tex/ref-list-same-number`: which reference lists its judge reports, on real parses of planted
 * sources, then the rule over a paper and its includes. Its run through real ESLint is in
 * `rule-cases.test.ts`; its agreement with a real build's .aux is `test/e2e/tex/ref-list-same-number.e2e.ts`.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import type { PlacedLabel, RefList } from "./domain/tex-document.ts";
import { refListSameNumberRule, sameNumbers } from "./ref-list-same-number.ts";
import { builtPaper } from "../test/recorded-fixture.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** The lines of the body the judge reports, with the message data, for a planted source. */
const found = (body: string) => {
  const src = doc(body);
  return sameNumbers(
    latexReader.refLists(src),
    latexReader.labels(src),
    latexReader.labelKeys(src),
  ).map((f) => [src.slice(0, f.at?.start ?? 0).split("\n").length, f] as const);
};

/** The judge's findings for a whole source, as the rule feeds it. */
const judged = (src: string) =>
  sameNumbers(
    latexReader.refLists(src),
    latexReader.labels(src),
    latexReader.labelKeys(src),
  );

const HEAD = [
  "\\subsection{Check}\\label{sec:check}",
  "\\textbf{Merged history.}\\label{sec:rq2} We compared.",
  "\\subsection{Other}\\label{sec:rq3}",
  "",
].join("\n");

describe("sameNumbers", () => {
  it("the paper that printed «II-A, II-A and II-B»: the run-in's key and its section's, in one list", () => {
    const hits = found(
      `${HEAD}Sections~\\ref{sec:check}, \\ref{sec:rq2} and~\\ref{sec:rq3}.`,
    );
    // Guards: one finding, at the second reference, naming both and the step they share; the third
    // key prints its own number.
    expect(hits.map(([line, f]) => [line, f.messageId, f.data])).toEqual([
      [
        6,
        "runIn",
        {
          first: "\\ref{sec:check}",
          second: "\\ref{sec:rq2}",
          key: "sec:rq2",
          title: "Merged history.",
          what: "\\subsection «Check»",
        },
      ],
    ]);
  });

  it("\\cref commands are a list across commands; the run-in named first is the one explained", () => {
    const hits = found(`${HEAD}See \\cref{sec:rq2}, \\cref{sec:check}.`);
    expect(hits.map(([, f]) => f.data)).toEqual([
      {
        first: "\\cref{sec:rq2}",
        second: "\\cref{sec:check}",
        key: "sec:rq2",
        title: "Merged history.",
        what: "\\subsection «Check»",
      },
    ]);
  });

  it("two labels on one heading print one number: said without a run-in", () => {
    const hits = found(
      "\\subsection{Check}\\label{a}\\label{b}\n\nSee \\autoref{a} or \\Cref{b}.",
    );
    expect(hits.map(([, f]) => [f.messageId, f.data])).toEqual([
      [
        "sameStep",
        {
          first: "\\autoref{a}",
          second: "\\Cref{b}",
          what: "\\subsection «Check»",
        },
      ],
    ]);
  });
});

describe("sameNumbers: what a later or other command changes", () => {
  it("a \\setcounter{secnumdepth} later in the body does not reach the headings before it", () => {
    // Guards: the depth in force at each heading is the last change before it, in document order.
    // A and B are both numbered when they are written (article: depth 3); the later change to 2
    // only affects what follows.
    expect(
      found(
        [
          "\\subsection{A}\\label{a}",
          "\\subsubsection{B}\\label{b}",
          "",
          "See \\ref{a}, \\ref{b}.",
          "\\setcounter{secnumdepth}{2}",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("a \\setcounter{secnumdepth} before a heading does reach it, and the change back reaches what follows", () => {
    const body = (before: string, after: string): string =>
      [
        before,
        "\\subsection{A}\\label{a}",
        "\\subsubsection{B}\\label{b}",
        "",
        "See \\ref{a}, \\ref{b}.",
        after,
        "\\subsubsection{C}\\label{c}",
        "",
        "See \\ref{b}, \\ref{c}.",
      ].join("\n");
    // Guards: depth 2 first makes B a run-in under A (a finding); restored to 3 before C, C prints
    // its own number (none). Then depth 3 first and 2 before C: only the second list is reported.
    expect([
      found(
        body("\\setcounter{secnumdepth}{2}", "\\setcounter{secnumdepth}{3}"),
      ).map(([line]) => line),
      found(body("", "\\setcounter{secnumdepth}{2}")).map(([line]) => line),
    ]).toEqual([[7], [11]]);
  });

  it("\\chapter and \\part step counters of their own: a label after the next chapter is its own", () => {
    const src = `\\documentclass{report}\n\\begin{document}\n\\chapter{First}\n\\section{Old}\\label{old}\n\\chapter{Second}\\label{new}\n\nSee \\ref{old}, \\ref{new}.\n\\end{document}\n`;
    const part = `\\documentclass{book}\n\\begin{document}\n\\chapter{First}\\label{old}\n\\part{Two}\\label{new}\n\nSee \\ref{old}, \\ref{new}.\n\\end{document}\n`;
    const starred = `\\documentclass{report}\n\\begin{document}\n\\chapter{First}\\label{old}\n\\chapter*{Two}\\label{new}\n\nSee \\ref{old}, \\ref{new}.\n\\end{document}\n`;
    const hits = judged;
    // Guards: a numbered chapter or part is a step, so its label is not the earlier section's; a
    // starred chapter steps nothing, its label does print the chapter's number (reported).
    expect([
      hits(src),
      hits(part),
      hits(starred).map((f) => f.messageId),
    ]).toEqual([[], [], ["runIn"]]);
  });

  it("two keys of one \\cref command are compressed by cleveref, separate commands are not", () => {
    // Guards: cleveref prints an equal number once inside one command (cleveref.sty 990-996), so
    // `\\cref{a,b}` is quiet; `\\cref{a}, \\cref{b}` and `\\cref{a,b}, \\ref{c}` keep their findings.
    const two =
      "\\subsection{A}\\label{a}\\label{b}\n\\subsection{C}\\label{c}\n\n";
    expect([
      found(`${two}See \\cref{a,b}.`).length,
      found(`${two}See \\Cref{a,b}.`).length,
      found(`${two}See \\cref{a}, \\cref{b}.`).length,
      found(`${two}See \\cref{a,b} and \\ref{c}.`).length,
      found(`${two}See \\cref{c,a} and \\ref{b}.`).length,
    ]).toEqual([0, 0, 1, 0, 1]);
  });
});

describe("sameNumbers: what is not a list or not known", () => {
  it("a key repeated in a list is not two labels; a run-in cited alone prints one number", () => {
    // Guards: the same key twice (even with another between) and a lone reference are quiet.
    expect([
      found(`${HEAD}See \\ref{sec:rq2}, \\ref{sec:rq2} and \\ref{sec:rq3}.`),
      found(`${HEAD}See \\ref{sec:check}, \\ref{sec:rq3}, \\ref{sec:check}.`),
      found(`${HEAD}See \\ref{sec:rq2}.`),
    ]).toEqual([[], [], []]);
  });

  it("references in different sentences, or parted by a word, a citation or math, are not one list", () => {
    // Guards: a full stop, the word "in", a \\cite and math each end the list.
    expect([
      found(`${HEAD}See \\ref{sec:check}. Then \\ref{sec:rq2}.`),
      found(`${HEAD}See \\ref{sec:check} in \\ref{sec:rq2}.`),
      found(`${HEAD}See \\ref{sec:check}~\\cite{x}, \\ref{sec:rq2}.`),
      found(`${HEAD}See \\ref{sec:check}, $x$, \\ref{sec:rq2}.`),
      found(`${HEAD}See \\ref{sec:check}, \\eqref{sec:rq2}.`),
    ]).toEqual([[], [], [], [], []]);
  });

  it("a label in an unknown place, or defined twice, is never judged", () => {
    // Guards: unknown is not the same. `x` follows no heading or run-in; `d` is defined twice.
    expect([
      found(
        "\\subsection{A}\\label{a}\n\nText\\label{x}.\n\nSee \\ref{a}, \\ref{x}.",
      ),
      found(
        "\\subsection{A}\\label{d}\n\\subsection{B}\\label{d}\\label{e}\n\nSee \\ref{d}, \\ref{e}.",
      ),
      found("See \\ref{nowhere}, \\ref{never}."),
    ]).toEqual([[], [], []]);
  });
});

/** What the rule reported: the line, and the id with its data or the whole message. */
type Report =
  | {
      readonly line: number;
      readonly messageId: string;
      readonly data?: unknown;
    }
  | { readonly line: number; readonly message: string };

/** Run the rule over `/p/paper.tex` holding `src`, as ESLint runs it: `create`, then `root`. */
function run(
  files: Record<string, string>,
  src: string,
  raw = true,
): readonly Report[] {
  const reports: Report[] = [];
  refListSameNumberRule({
    files: memoryFiles(files),
    latex: latexReader,
    codec: sourcesCodec,
  })
    .create({
      filename: "/p/paper.tex",
      sourceCode: {
        text: src,
        ...(raw ? { raw: src } : {}),
        getLocFromIndex: (i) => ({
          line: src.slice(0, i).split("\n").length,
          column: 0,
        }),
      },
      report: (d) =>
        reports.push(
          "messageId" in d
            ? { line: d.loc.start.line, messageId: d.messageId, data: d.data }
            : { line: d.loc.start.line, message: d.message },
        ),
    })
    .root?.();
  return reports;
}

describe("sameNumbers: the class's default depth and every definition of a key", () => {
  it("book and report number to \\subsection (2), not \\subsubsection: the deeper heading is a run-in", () => {
    // Guards: book.cls line 268 and report.cls line 262 are `\setcounter{secnumdepth}{2}`, so
    // `\subsubsection{B}` steps no counter and `b` takes the number of subsection A.
    const hits = (cls: string) => {
      const src = `\\documentclass{${cls}}\n\\begin{document}\n\\chapter{C}\n\\subsection{A}\\label{a}\n\\subsubsection{B}\\label{b}\n\nSee \\ref{a}, \\ref{b}.\n\\end{document}\n`;
      return judged(src).length;
    };
    expect([hits("book"), hits("report"), hits("article")]).toEqual([1, 1, 0]);
  });

  it("a key defined again inside an environment is defined twice: never judged", () => {
    // Guards: `b` is also a figure's label, outside the running text the walk reads, and is unknown.
    expect(
      found(
        "\\subsection{A}\\label{a}\\label{b}\n\n\\begin{figure}\\caption{F}\\label{b}\\end{figure}\n\nSee \\ref{a}, \\ref{b}.",
      ),
    ).toEqual([]);
  });
});

describe("sameNumbers: a step the parser gave no place", () => {
  it("is not the same as another: two labels on unplaced steps are never reported", () => {
    const label = (key: string): PlacedLabel => ({
      key,
      span: { start: 0, end: 1 },
      anchor: { kind: "numbered" },
      takes: { at: { kind: "unplaced" }, what: "\\section" },
    });
    const ref = (key: string) => ({
      macro: "ref",
      key,
      span: { start: 0, end: 1 },
    });
    const lists: readonly RefList[] = [[ref("a"), ref("b")]];
    // Guards: the same two labels on one PLACED step are reported, so the quiet is the unplaced.
    expect(sameNumbers(lists, [label("a"), label("b")], ["a", "b"])).toEqual(
      [],
    );
  });
});

const LIST = "\n\nSee~\\ref{sec:check} and~\\ref{sec:rq2}.";

describe("the rule, as ESLint runs it", () => {
  it("reads `text` when the source code carries no `raw`", () => {
    expect(
      run(
        {},
        doc(
          `\\subsection{Check}\\label{sec:check}\n\\textbf{M.}\\label{sec:rq2}${LIST}`,
        ),
        false,
      ),
    ).toEqual([
      {
        line: 6,
        messageId: "runIn",
        data: {
          first: "\\ref{sec:check}",
          second: "\\ref{sec:rq2}",
          key: "sec:rq2",
          title: "M.",
          what: "\\subsection «Check»",
        },
      },
    ]);
  });

  it("a finding in an included file is reported at its \\input, naming the file, line and column", () => {
    const main = doc(
      "\\subsection{Check}\\label{sec:check}\n\\input{sections/rq}",
    );
    const files = builtPaper(
      "/p",
      {
        "paper.tex": main,
        "sections/rq.tex": `\\textbf{Merged history.}\\label{sec:rq2} We.${LIST}\n`,
      },
      [
        { path: "paper.tex", role: "body" },
        { path: "sections/rq.tex", role: "body" },
      ],
    );
    // Guards: the include is spliced, so its run-in takes the subsection that encloses it in paper.tex.
    expect(run(files, main)).toEqual([
      {
        line: 4,
        message:
          "sections/rq.tex:3:25: \\ref{sec:check} and \\ref{sec:rq2} print the same number: sec:rq2 follows «Merged history.», which steps no counter, so it takes the number of \\subsection «Check»",
      },
    ]);
  });
});
