/**
 * Where a build's bibliography comes from: bibtex run on the databases the `.aux` names, the
 * `paper.bbl` the author shipped, or nowhere (a database or the style cannot be found). Table tests
 * over the facts the build gathers: the `.aux`, what `kpsewhich` found, and which files are on disk.
 */
import { describe, expect, it } from "vitest";
import { bblOwner, bibSource, type BibLookup } from "./bib-source.ts";

const found = (name: string): BibLookup => ({ name, found: true });
const lost = (name: string): BibLookup => ({ name, found: false });

describe("whose paper.bbl it is", () => {
  it("no paper.bbl: nobody's", () => {
    // Guards: a paper with no .bbl yet is the build's to write.
    expect(bblOwner({ bbl: false, blg: false })).toBe("none");
    expect(bblOwner({ bbl: false, blg: true })).toBe("none");
  });
  it("a paper.bbl beside the paper.blg bibtex writes on every run: the build's", () => {
    expect(bblOwner({ bbl: true, blg: true })).toBe("build");
  });
  it("a paper.bbl with no paper.blg: the author's", () => {
    // Guards: the shipped .bbl of an arXiv source is never handed to bibtex to overwrite.
    expect(bblOwner({ bbl: true, blg: false })).toBe("author");
  });
});

describe("where the bibliography comes from", () => {
  it("no database named: none, whatever paper.bbl is", () => {
    for (const owner of ["none", "build", "author"] as const)
      expect(bibSource({ databases: [], style: null, owner })).toEqual({
        kind: "none",
      });
  });
  it("every database and the style found, paper.bbl absent or the build's: run bibtex", () => {
    for (const owner of ["none", "build"] as const)
      expect(
        bibSource({
          databases: [found("refs.bib"), found("IEEEabrv.bib")],
          style: found("IEEEtran.bst"),
          owner,
        }),
      ).toEqual({ kind: "run-bibtex" });
  });
  it("no \\bibliographystyle: bibtex still runs, and reports it itself", () => {
    expect(
      bibSource({ databases: [found("refs.bib")], style: null, owner: "none" }),
    ).toEqual({ kind: "run-bibtex" });
  });
  it("the author's paper.bbl: never bibtex, and the missing files are named", () => {
    // Guards: a shipped .bbl is used as it is, even when every database is there.
    expect(
      bibSource({
        databases: [found("refs.bib")],
        style: found("plain.bst"),
        owner: "author",
      }),
    ).toEqual({ kind: "shipped-bbl", missing: [] });
    expect(
      bibSource({
        databases: [lost("refs.bib"), found("IEEEabrv.bib")],
        style: lost("custom.bst"),
        owner: "author",
      }),
    ).toEqual({ kind: "shipped-bbl", missing: ["refs.bib", "custom.bst"] });
  });
  it("a database or the style not found and no shipped paper.bbl: stop, naming them", () => {
    // Guards: bibtex is never run on input it cannot read — it would truncate paper.bbl.
    expect(
      bibSource({
        databases: [lost("refs.bib"), found("IEEEabrv.bib"), lost("more.bib")],
        style: found("plain.bst"),
        owner: "none",
      }),
    ).toEqual({ kind: "missing", missing: ["refs.bib", "more.bib"] });
    expect(
      bibSource({
        databases: [found("refs.bib")],
        style: lost("nosuchstyle.bst"),
        owner: "build",
      }),
    ).toEqual({ kind: "missing", missing: ["nosuchstyle.bst"] });
  });
});
