/**
 * THE PROSE OF A paper.tex AS PLAIN TEXT — what `grade-paper-writing/prose-lint.mjs` measures.
 *
 * prose-lint counts sentences and words, and every metric it prints is a fraction of the word
 * count. Read as raw text, a `.tex` puts the preamble, the `%` comments and an inline `filecontents`
 * bibliography into that count (8127 "words" against about 4636 real ones on one paper), so every
 * rate comes out roughly halved. This reads the paper the way the `tex/register` rule does: the
 * includes spliced in (`readPaper`), then the body's prose as passages (`bodyProse` — the abstract
 * to the back matter, without headings, captions, floats or code), each passage's sentences as the
 * reader sees them (`bodySentences` — citations and math left out). A blank line separates two
 * passages, so no sentence runs across them.
 */
import { bodySentences } from "./domain/register.ts";
import { runText } from "./domain/tex-document.ts";
import { readPaper, type PaperDeps } from "./tex-paper.ts";

/** A paper's body prose, one passage per paragraph, and its section titles in document order. */
export interface PaperProse {
  readonly body: string;
  readonly headings: readonly string[];
}

/** The prose and the headings of the paper whose main file is `filename` with the text `src`. */
export function paperProse(
  filename: string,
  src: string,
  deps: PaperDeps,
): PaperProse {
  const { text } = readPaper(filename, src, deps);
  const passages = deps.latex
    .bodyProse(text)
    .map((p) =>
      bodySentences([p])
        .map((s) => s.text)
        .join(" "),
    )
    .filter((p) => p !== "");
  return {
    body: passages.join("\n\n"),
    headings: deps.latex
      .headings(text)
      .filter((h) => h.command.kind === "heading" && h.argument === "title")
      .map((h) => runText(h.title).replace(/\s+/g, " ").trim()),
  };
}
