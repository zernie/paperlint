/**
 * `bibInput` over real files in a temporary paper directory, with a fake `kpsewhich` that finds a
 * file in the paper directory (printing `./name`, as the real one does) or in a planted TeX tree.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import { bibInput, shippedBblNote, type BibDeps } from "./bib-input.ts";

const root = useTempDir("paperlint-bib-input-test-");
let n = 0;
const paper = (files: Record<string, string> = {}) =>
  writeTree(join(root, `p${String(n++)}`), files);

/** The TeX tree: every TeX Live has plain.bst; a case that needs a style gone names another. */
const tree = writeTree(join(root, "tree"), {
  "plain.bst": "",
  "IEEEtran.bst": "",
  "IEEEabrv.bib": "@string{x = {y}}\n",
});

const kpsewhich =
  (noStart: boolean): BibDeps["run"] =>
  (_bin, args, opts) => {
    if (noStart) return { status: null, error: new Error("spawn ENOENT") };
    const name = args.at(-1) ?? "";
    if (existsSync(join(opts.cwd ?? "", name)))
      return { status: 0, stdout: `./${name}\n` };
    return existsSync(join(tree, name))
      ? { status: 0, stdout: `${join(tree, name)}\n` }
      : { status: 1, stdout: "" };
  };

const at = (dir: string, noStart = false): BibDeps => ({
  paperDir: dir,
  env: {},
  run: kpsewhich(noStart),
  files: nodeFiles,
});
const aux = (style: string, data: string) =>
  `\\citation{k}\n\\bibstyle{${style}}\n\\bibdata{${data}}\n`;

describe("where a build's bibliography comes from", () => {
  it("no .aux, or one that names no database: none", () => {
    expect(bibInput(at(paper()))).toEqual({ kind: "none" });
    expect(bibInput(at(paper({ "paper.aux": "\\relax\n" })))).toEqual({
      kind: "none",
    });
  });

  it("databases in the paper directory and in the TeX tree: run bibtex over all their bytes", () => {
    const dir = paper({
      "paper.aux": aux("IEEEtran", "a.bib,IEEEabrv"),
      "a.bib": "@misc{k}\n",
    });
    // Guards: a database kpsewhich finds in the tree is bibtex's to read, and its bytes are hashed.
    expect(bibInput(at(dir))).toEqual({
      kind: "run-bibtex",
      citations: ["k"],
      databases: ["a.bib", "IEEEabrv"],
      style: "IEEEtran",
      bibHash: createHash("sha256")
        .update("@misc{k}\n@string{x = {y}}\n")
        .digest("hex"),
    });
  });

  it("a database named in an \\include'd chapter's aux counts, as bibtex follows it", () => {
    const dir = paper({
      "paper.aux": "\\@input{ch1.aux}\n\\bibstyle{plain}\n",
      "ch1.aux": "\\citation{k}\n\\bibdata{gone}\n",
    });
    expect(bibInput(at(dir))).toEqual({
      kind: "missing",
      missing: ["gone.bib"],
    });
  });
});

describe("where a build's bibliography comes from, when a file is not there", () => {
  it("a database or the style nowhere: missing, even over bibtex's own paper.bbl", () => {
    // Guards: #708 — bibtex is never run on a file it cannot find.
    for (const own of [{}, { "paper.bbl": "x", "paper.blg": "x" }])
      expect(
        bibInput(
          at(
            paper({
              "paper.aux": aux("plain", "gone,here"),
              "here.bib": "",
              ...own,
            }),
          ),
        ),
      ).toEqual({ kind: "missing", missing: ["gone.bib"] });
    expect(
      bibInput(
        at(paper({ "paper.aux": aux("nosuchstyle", "here"), "here.bib": "" })),
      ),
    ).toEqual({ kind: "missing", missing: ["nosuchstyle.bst"] });
  });

  it("a paper.bbl with no paper.blg: the author's, typeset as shipped", () => {
    // Guards: #708 — the shipped .bbl is never handed to bibtex, whatever else is missing.
    const dir = paper({
      "paper.aux": aux("nosuchstyle", "gone,here"),
      "here.bib": "",
      "paper.bbl": "x",
    });
    expect(bibInput(at(dir))).toEqual({
      kind: "shipped-bbl",
      missing: ["gone.bib", "nosuchstyle.bst"],
    });
  });

  it("a kpsewhich that cannot start is answered from the paper directory", () => {
    const dir = paper({
      "paper.aux": aux("plain", "refs,gone"),
      "refs.bib": "",
    });
    expect(bibInput(at(dir, true))).toEqual({
      kind: "missing",
      missing: ["gone.bib", "plain.bst"],
    });
  });
});

describe("the line a build prints for the bibliography", () => {
  it("the author's paper.bbl: not checked, and what would regenerate it", () => {
    expect(shippedBblNote({ kind: "shipped-bbl", missing: [] })).toBe(
      "; bibliography: the author's paper.bbl, typeset as shipped — bibtex not run, references not checked; delete paper.bbl to regenerate it with bibtex",
    );
    expect(shippedBblNote({ kind: "shipped-bbl", missing: ["refs.bib"] })).toBe(
      "; bibliography: the author's paper.bbl, typeset as shipped — bibtex not run, references not checked; it could not be regenerated: refs.bib not found",
    );
  });
  it("any other bibliography: nothing", () => {
    expect(shippedBblNote({ kind: "none" })).toBe("");
  });
});
