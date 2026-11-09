/**
 * The readers of what TeX writes beside a paper: pdflatex's `-recorder` file and bibtex's errors.
 * One implementation of `TexOutput` (`src/ports/tex-output.ts`).
 */
import type { TexOutput } from "../../ports/tex-output.ts";
import { parseBlgErrors } from "./blg.ts";
import { parseFls } from "./fls.ts";

export const texOutput: TexOutput = {
  fls: parseFls,
  blgErrors: parseBlgErrors,
};
