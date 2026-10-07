import { expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { paperProse } from "./paper-prose.ts";
import { builtPaper } from "../test/recorded-fixture.ts";

const SRC = [
  "\\documentclass{article}",
  "\\usepackage{amsmath} % a preamble word count of its own",
  "\\title{A Title}",
  "\\begin{document}",
  "\\maketitle",
  "\\section{Introduction}",
  "We measure it~\\cite{a}. % a comment",
  "",
  "A second paragraph \\input{body}",
  "\\begin{filecontents*}{refs.bib}",
  "@misc{a, author = {Ada Lovelace}, title = {Never Prose}}",
  "\\end{filecontents*}",
  "\\end{document}",
].join("\n");

it("the body's prose, a blank line between passages, includes spliced; the preamble, comments, the inline .bib and the title stay out", () => {
  // The build recorded TeX reading both files; the preamble holds no include.
  const files = memoryFiles(
    builtPaper(
      "/p",
      { "paper.tex": SRC, "body.tex": "\\subsection{Method}\nends here." },
      [
        { path: "paper.tex", role: "body" },
        { path: "body.tex", role: "body" },
      ],
    ),
  );
  expect(
    paperProse("/p/paper.tex", SRC, {
      files,
      latex: latexReader,
      codec: sourcesCodec,
    }),
  ).toEqual({
    // A citation stands as `[1]`, where it is set; a heading — here an included one — ends a passage.
    body: "We measure it [1].\n\nA second paragraph\n\nends here.",
    headings: ["Introduction", "Method"],
    files: [
      { file: "paper.tex", text: SRC },
      { file: "body.tex", text: "\\subsection{Method}\nends here." },
    ],
  });
});

it("a citation stands as `[1]` and a cross-reference as `1`, so the sentence still ends on them", () => {
  const src =
    "\\documentclass{article}\n\\begin{document}\nIt holds~\\cite{a}. It is shown (Section~\\ref{s}).\n\\end{document}\n";
  expect(
    paperProse("/p/paper.tex", src, {
      files: memoryFiles({ "/p/paper.tex": src }),
      latex: latexReader,
      codec: sourcesCodec,
    }).body,
  ).toBe("It holds [1]. It is shown (Section 1).");
});
