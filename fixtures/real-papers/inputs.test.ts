/**
 * Every real paper holds the files its source names (inputs.ts): the pure check fires on planted
 * directories built here, and on the real `accepted/` and `preprints/` it reports exactly the known
 * case below. No network.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inputProblems, type PaperFiles } from "./inputs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** A planted paper: `files` maps a path to its text (only `.tex` text is read). */
const paper = (files: Record<string, string>, recorded?: readonly string[]): PaperFiles => ({
  paths: Object.keys(files),
  tex: new Map(Object.entries(files).filter(([p]) => p.endsWith(".tex"))),
  recorded,
});

describe("inputProblems — planted", () => {
  it("is quiet when every input resolves and is recorded", () => {
    const p = paper(
      { "paper.tex": "\\input{sec/a}\n\\include{b.tex}", "sec/a.tex": "\\input{sec/c}", "sec/c.tex": "x", "b.tex": "y" },
      ["paper.tex", "sec/a.tex", "sec/c.tex", "b.tex"],
    );
    expect(inputProblems(p)).toEqual([]);
  });

  it("reports an input whose file is not in the directory, nested or not", () => {
    const p = paper({ "paper.tex": "\\input{sec/a}\n\\input{gone}", "sec/a.tex": "\\input{deeper}" }, [
      "paper.tex",
      "sec/a.tex",
    ]);
    expect(inputProblems(p)).toEqual([
      { kind: "missing", from: "sec/a.tex", target: "deeper" },
      { kind: "missing", from: "paper.tex", target: "gone" },
    ]);
  });

  it("reports a file the source reads that the record does not list", () => {
    const p = paper({ "paper.tex": "\\input{a}", "a.tex": "x" }, ["paper.tex"]);
    expect(inputProblems(p)).toEqual([{ kind: "not-recorded", file: "a.tex" }]);
  });

  it("reports a match by case alone, and does not follow it", () => {
    const p = paper({ "paper.tex": "\\input{t/Tab}", "t/tab.tex": "\\input{gone}" }, ["paper.tex"]);
    expect(inputProblems(p)).toEqual([
      { kind: "case-only", from: "paper.tex", target: "t/Tab", file: "t/tab.tex" },
    ]);
  });

  it("skips commented inputs, macro arguments and non-prose files", () => {
    const p = paper(
      { "paper.tex": "% \\input{gone}\n\\newcommand{\\t}[1]{\\input{tables/#1}}\n\\input{style.sty}\n\\input{paper.bbl}" },
      ["paper.tex"],
    );
    expect(inputProblems(p)).toEqual([]);
  });

  it("reads a listed .tex file without text as empty, and still requires it in the record", () => {
    const p: PaperFiles = { paths: ["paper.tex", "a.tex"], tex: new Map([["paper.tex", "\\input{a}"]]), recorded: ["paper.tex"] };
    expect(inputProblems(p)).toEqual([{ kind: "not-recorded", file: "a.tex" }]);
  });

  it("checks no record when the paper has none", () => {
    expect(inputProblems(paper({ "paper.tex": "\\input{a}", "a.tex": "x" }))).toEqual([]);
  });
});

const RecordSchema = z.object({ inputs: z.array(z.object({ path: z.string() })) });

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const readPaper = (dir: string): PaperFiles => {
  const paths = walk(dir).map((p) => relative(dir, p));
  const record = join(dir, "record-by-hand.json");
  return {
    paths,
    tex: new Map(paths.filter((p) => p.endsWith(".tex")).map((p) => [p, readFileSync(join(dir, p), "utf8")])),
    recorded: existsSync(record)
      ? RecordSchema.parse(JSON.parse(readFileSync(record, "utf8"))).inputs.map((i) => i.path)
      : undefined,
  };
};

/**
 * The known cases, kept so that a new one fails: TeX Live finds the file by case-folding,
 * paperlint does not read it (https://github.com/zernie/paperlint/issues/570).
 */
const KNOWN = {
  "accepted/2506.03437v2": [
    {
      kind: "case-only",
      from: "paper.tex",
      target: "sections/S0_abstract",
      file: "sections/s0_abstract.tex",
    },
  ],
  "accepted/2602.22696v1": [
    {
      kind: "case-only",
      from: "paper.tex",
      target: "table/model_comparison_split_init_category_sr_AIS",
      file: "table/model_comparison_split_init_category_sr_ais.tex",
    },
  ],
};

/** Every paper directory of a folder (one holding `paper.tex`), as `folder/name`. */
const papersOf = (folder: string): readonly string[] =>
  readdirSync(join(HERE, folder))
    .filter((n) => existsSync(join(HERE, folder, n, "paper.tex")))
    .map((n) => `${folder}/${n}`);

describe("inputProblems — the real papers", () => {
  it("every paper of accepted/ and preprints/ holds the files its source names", () => {
    const all = [...papersOf("accepted"), ...papersOf("preprints")];
    expect(all.length).toBeGreaterThanOrEqual(200);
    const found = Object.fromEntries(
      all
        .map((p) => [p, inputProblems(readPaper(join(HERE, p)))] as const)
        .filter(([, problems]) => problems.length > 0),
    );
    expect(found).toEqual(KNOWN);
  });
});
