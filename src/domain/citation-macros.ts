/**
 * Citation commands: their `{…}` argument is a list of keys, their `[…]` ones are notes the reader
 * sees. The LaTeX reader (`src/adapters/latex/`) and the changelist (`src/changelist.ts`) both take
 * the set from here, so what counts as a citation is decided once.
 */
export const CITATION_MACROS: ReadonlySet<string> = new Set([
  "cite",
  "citep",
  "citet",
  "citealp",
  "citealt",
  "citeauthor",
  "citeyear",
  "citeyearpar",
  "Citep",
  "Citet",
  "nocite",
  "parencite",
  "textcite",
  "autocite",
  "footcite",
]);
