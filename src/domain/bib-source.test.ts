/**
 * Where a build's bibliography comes from: bibtex run on the databases the `.aux` names, the
 * `paper.bbl` on disk, or nowhere. Table tests over the facts the build gathers: the `.aux`, what
 * `kpsewhich` found, and whether a paper.bbl is there.
 */
import { describe, expect, it } from "vitest";
import { bibSource, type BibLookup } from "./bib-source.ts";

const found = (name: string): BibLookup => ({ name, found: true });
const lost = (name: string): BibLookup => ({ name, found: false });

describe("where the bibliography comes from", () => {
  it("no database named: none, whatever is on disk", () => {
    for (const bbl of [false, true])
      expect(bibSource({ databases: [], style: null, bbl })).toEqual({
        kind: "none",
      });
  });
  it("every database and the style found: run bibtex, a paper.bbl on disk or not", () => {
    // Guards: a shipped paper.bbl beside its found .bib is regenerated — the bib rules need bibtex's run.
    for (const bbl of [false, true])
      expect(
        bibSource({
          databases: [found("refs.bib"), found("IEEEabrv.bib")],
          style: found("IEEEtran.bst"),
          bbl,
        }),
      ).toEqual({ kind: "run-bibtex" });
  });
  it("no \\bibliographystyle: bibtex still runs, and reports it itself", () => {
    expect(
      bibSource({ databases: [found("refs.bib")], style: null, bbl: false }),
    ).toEqual({ kind: "run-bibtex" });
  });
  it("a database or the style not found, and a paper.bbl on disk: typeset it, naming what is missing", () => {
    // Guards: #708 — bibtex would truncate the paper.bbl it cannot regenerate.
    expect(
      bibSource({
        databases: [lost("refs.bib"), found("IEEEabrv.bib")],
        style: lost("custom.bst"),
        bbl: true,
      }),
    ).toEqual({ kind: "shipped-bbl", missing: ["refs.bib", "custom.bst"] });
  });
  it("a database or the style not found, and no paper.bbl: stop, naming them", () => {
    // Guards: #708 — bibtex is never run on input it cannot read.
    expect(
      bibSource({
        databases: [lost("refs.bib"), found("IEEEabrv.bib"), lost("more.bib")],
        style: found("plain.bst"),
        bbl: false,
      }),
    ).toEqual({ kind: "missing", missing: ["refs.bib", "more.bib"] });
    expect(
      bibSource({
        databases: [found("refs.bib")],
        style: lost("nosuchstyle.bst"),
        bbl: false,
      }),
    ).toEqual({ kind: "missing", missing: ["nosuchstyle.bst"] });
  });
});
