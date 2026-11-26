/**
 * WHERE A BUILD'S BIBLIOGRAPHY COMES FROM (paperlint#708). The `.aux` names the databases
 * (`\bibdata`) and the style (`\bibstyle`); bibtex reads them and writes `paper.bbl`, which the next
 * pdflatex pass typesets. Nothing in a paper declares its kind: it is TeX's convention plus which
 * files exist. So the build decides from three facts, all on disk:
 *
 *   no database named                                       → none: nothing for bibtex to do
 *   paper.bbl is the author's (no paper.blg beside it)      → shipped-bbl: typeset it as it is,
 *                                                             never bibtex, missing files named
 *   a database or the style not found (kpsewhich)           → missing: stop, naming them
 *   otherwise                                               → run-bibtex
 *
 * 🔴 WHY bibtex IS NEVER RUN ON WHAT IT CANNOT READ. bibtex truncates `paper.bbl` before it reads
 * anything, and an error leaves it truncated: measured on a real paper, 17,682 → 49 bytes for a
 * missing `.bib`, 0 bytes for `\bibliographystyle{nosuchstyle}`. A shipped `.bbl` would be lost.
 *
 * 🔴 WHY paper.blg MARKS THE BUILD'S paper.bbl. bibtex writes `paper.blg` on every run, failed ones
 * included, and an author ships the `.bbl` without it (none of the 46 corpus papers that ship a
 * `.bbl` ships a `.blg`). The record of the last build is no marker: a build whose bibtex ran and
 * whose next pdflatex pass failed writes no record, and its `.bbl` would read as the author's.
 */

/** Whose `paper.bbl` it is: there is none, bibtex wrote it, or it came with the paper. */
export type BblOwner = "none" | "build" | "author";

export const bblOwner = (onDisk: {
  readonly bbl: boolean;
  readonly blg: boolean;
}): BblOwner => (!onDisk.bbl ? "none" : onDisk.blg ? "build" : "author");

/** A file bibtex would read (`refs.bib`, `plain.bst`), and whether `kpsewhich` found it. */
export interface BibLookup {
  readonly name: string;
  readonly found: boolean;
}

export type BibSource =
  | { readonly kind: "none" }
  | { readonly kind: "run-bibtex" }
  /** The author's `paper.bbl`; `missing` names what bibtex could not have read to regenerate it. */
  | { readonly kind: "shipped-bbl"; readonly missing: readonly string[] }
  /** No `.bbl` to fall back on, and these cannot be read. */
  | { readonly kind: "missing"; readonly missing: readonly string[] };

export function bibSource(facts: {
  readonly databases: readonly BibLookup[];
  /** Null when the `.aux` names no style. */
  readonly style: BibLookup | null;
  readonly owner: BblOwner;
}): BibSource {
  if (facts.databases.length === 0) return { kind: "none" };
  const missing = [...facts.databases, ...(facts.style ? [facts.style] : [])]
    .filter((l) => !l.found)
    .map((l) => l.name);
  if (facts.owner === "author") return { kind: "shipped-bbl", missing };
  return missing.length > 0
    ? { kind: "missing", missing }
    : { kind: "run-bibtex" };
}
