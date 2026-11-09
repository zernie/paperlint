/**
 * The readers of what TeX writes beside a paper: pdflatex's `-recorder` file, the labels of its `.aux`,
 * and bibtex's errors.
 * One implementation of `TexOutput` (`src/ports/tex-output.ts`).
 */
import type { TexOutput } from "../../ports/tex-output.ts";
import { parseLabels } from "./aux.ts";
import { parseBlgErrors } from "./blg.ts";
import { parseFls } from "./fls.ts";

export const texOutput: TexOutput = {
  fls: parseFls,
  blgErrors: parseBlgErrors,
  labels: parseLabels,
};
