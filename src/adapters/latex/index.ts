/**
 * Reads a paper.tex and answers three questions — checks nothing itself: `documentClassOf` (which
 * class, with which options, and where), `outlineOf` (the sections in order, where the back matter
 * starts, where the document ends) and `renderedRuns` (the text a reader sees, each character with
 * its source offset). Used by `tex/template`, `tex/required-section`, `tex/venue-leftover` and
 * `paperlint new`, through the `LatexReader` port (`src/ports/latex.ts`); `src/cli.ts` wires it.
 *
 * ── WHY THE PARSE TREE AND NOT THE `tex/latex` PROJECTION ────────────────────────
 * The ESLint language's projection (`eslint-rules/latex-language.ts`) blanks the preamble,
 * `\documentclass`, `\author` and every other macro in its OPAQUE list, because prose rules must
 * not see markup. These questions are about exactly that markup: the class line, a `\section*`
 * title, an `\institution{…}` in the author block. So the source is parsed here with unified-latex,
 * the parser the language already uses.
 *
 * ── STATES, NOT NULL ─────────────────────────────────────────────────────────────
 * A class line is missing, empty or a class; a node the parser gave no position is `unplaced`, not
 * offset 0; a run of text is a non-empty list of contiguous segments, and a range outside it has
 * no span (`spanIn` in `src/domain/tex-document.ts`). A tree travels only with its own source
 * (`ParsedTex`, minted by `parseLatex` alone).
 */
import type { LatexReader } from "../../ports/latex.ts";
import {
  documentClassOf,
  parseTemplate,
  replaceDocumentClass,
} from "./document-class.ts";
import { outlineOf } from "./outline.ts";
import { parseLatex } from "./parse.ts";
import { renderedRuns } from "./rendered.ts";

export {
  documentClassOf,
  parseTemplate,
  replaceDocumentClass,
} from "./document-class.ts";
export {
  collapse,
  macroPlace,
  mandatory,
  optional,
  placeOf,
  textOf,
} from "./nodes.ts";
export { outlineOf } from "./outline.ts";
export { parseLatex, type ParsedTex } from "./parse.ts";
export { renderedRuns } from "./rendered.ts";

/** The `LatexReader` port over unified-latex: each call parses its source once. */
export const latexReader: LatexReader = {
  documentClass: (src) => documentClassOf(parseLatex(src)),
  outline: (src) => outlineOf(parseLatex(src)),
  renderedRuns: (src) => renderedRuns(parseLatex(src)),
  template: parseTemplate,
  withDocumentClass: (src, want) => replaceDocumentClass(parseLatex(src), want),
};
