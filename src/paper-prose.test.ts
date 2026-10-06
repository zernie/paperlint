import { expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { paperProse } from "./paper-prose.ts";

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
  const files = memoryFiles({
    "/p/paper.tex": SRC,
    "/p/body.tex": "\\subsection{Method}\nends here.",
  });
  expect(
    paperProse("/p/paper.tex", SRC, { files, latex: latexReader }),
  ).toEqual({
    // A citation mark leaves its space; a heading — here an included one — ends a passage.
    body: "We measure it .\n\nA second paragraph\n\nends here.",
    headings: ["Introduction", "Method"],
  });
});
