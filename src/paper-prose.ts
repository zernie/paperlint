/**
 * THE PROSE OF A paper.tex AS PLAIN TEXT — what `grade-paper-writing/prose-lint.mjs` measures.
 *
 * prose-lint counts sentences and words, and every metric it prints is a fraction of the word
 * count. Read as raw text, a `.tex` puts the preamble, the `%` comments and an inline `filecontents`
 * bibliography into that count (8127 "words" against about 4636 real ones on one paper), so every
 * rate comes out roughly halved. This reads the paper the way the `tex/register` rule does: the
 * includes spliced in (`readPaper`), then the body's prose as passages (`bodyProse` — the abstract
 * to the back matter, without headings, captions, floats or code), each passage's sentences
 * (`bodySentences`). A blank line separates two passages, so no sentence runs across them.
 *
 * A citation stands as `[1]` and a cross-reference as `1`, where they are set — not left out:
 * prose-lint judges a sentence that ENDS on one (a wasted stress position) and counts references
 * to other parts of the paper (`(Section 1)`), and both are invisible in a sentence the marks
 * were cut out of. Math is left out; prose-lint counts no formula.
 */
import { bodySentences } from "./domain/register.ts";
import { CITATION, MATH, REFERENCE } from "./domain/sentences.ts";
import { runText } from "./domain/tex-document.ts";
import { readPaper, type PaperDeps } from "./tex-paper.ts";

/** A sentence's text with each mark as a reader would see it set, and math left out. */
const rendered = (raw: string): string =>
  raw
    .replaceAll(CITATION, "[1]")
    .replaceAll(REFERENCE, "1")
    .replaceAll(MATH, "")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * A paper's body prose, one passage per paragraph, its section titles in document order, and the
 * text of each file it is made of — `paper.tex` and every file it includes, once, named as the
 * include names it — for what the body leaves out, such as captions.
 */
export interface PaperProse {
  readonly body: string;
  readonly headings: readonly string[];
  readonly files: readonly { readonly file: string; readonly text: string }[];
}

/** The prose and the headings of the paper whose main file is `filename` with the text `src`. */
export function paperProse(
  filename: string,
  src: string,
  deps: PaperDeps,
): PaperProse {
  const { text, segments } = readPaper(filename, src, deps);
  const passages = deps.latex
    .bodyProse(text)
    .map((p) =>
      bodySentences([p])
        .map((s) => rendered(s.raw))
        .join(" "),
    )
    .filter((p) => p !== "");
  return {
    body: passages.join("\n\n"),
    headings: deps.latex
      .headings(text)
      .filter((h) => h.command.kind === "heading" && h.argument === "title")
      .map((h) => runText(h.title).replace(/\s+/g, " ").trim()),
    files: [...new Map(segments.map((s) => [s.file, s.source])).entries()].map(
      ([file, text]) => ({ file, text }),
    ),
  };
}
