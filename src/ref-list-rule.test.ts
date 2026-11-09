/**
 * `tex/ref-list-same-number` through `create()`: the captured IEEEtran paper whose included section
 * holds two labels that print II-A (test/fixtures/tex-output/ref-list-include/), with the record its
 * build would write, and the states of the build in which the rule must say nothing.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { texOutput } from "./adapters/tex-output/index.ts";
import { refListSameNumberRule } from "./ref-list-rule.ts";
import { recordText } from "../test/recorded-fixture.ts";

const CAPTURE = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "test",
  "fixtures",
  "tex-output",
  "ref-list-include",
);
const captured = (f: string): string => readFileSync(join(CAPTURE, f), "utf8");

const PAPER = captured("source.tex");
const RESULTS = captured("results.tex");
const SOURCES = { "paper.tex": PAPER, "results.tex": RESULTS };
const RECORD = recordText(SOURCES, {
  inputs: [
    ["paper.tex", "body"],
    ["results.tex", "body"],
  ],
});
const BUILT: Readonly<Record<string, string>> = {
  "/p/paper.tex": PAPER,
  "/p/results.tex": RESULTS,
  "/p/_build/sources.json": RECORD,
  "/p/paper.aux": captured("paper.aux"),
  "/p/results.aux": captured("results.aux"),
};

/** What the rule reports on `/p/paper.tex` holding `src`, with `files` on the disk. */
function run(
  files: Readonly<Record<string, string>>,
  src: string = PAPER,
): unknown[] {
  const rule = refListSameNumberRule({
    files: memoryFiles(files),
    latex: latexReader,
    codec: sourcesCodec,
    texOutput,
  });
  const out: unknown[] = [];
  rule
    .create({
      filename: "/p/paper.tex",
      options: [],
      sourceCode: {
        text: src,
        getLocFromIndex: (i) => ({
          line: src.slice(0, i).split("\n").length,
          column: i - src.lastIndexOf("\n", i - 1) - 1,
        }),
      },
      report: (d) => out.push(d),
    })
    .root?.();
  return out;
}

describe("tex/ref-list-same-number", () => {
  it("🔴 the built paper: one finding, at the second label of the list, naming both labels and II-A", () => {
    const at = PAPER.indexOf("\\ref{sec:rq2}");
    const end = at + "\\ref{sec:rq2}".length;
    const loc = (i: number) => ({
      line: PAPER.slice(0, i).split("\n").length,
      column: i - PAPER.lastIndexOf("\n", i - 1) - 1,
    });
    expect(run(BUILT)).toEqual([
      {
        loc: { start: loc(at), end: loc(end) },
        messageId: "same",
        data: { first: "sec:check", second: "sec:rq2", number: "II-A" },
      },
    ]);
  });

  it("the labels of a different list, with different numbers: silent", () => {
    const src = PAPER.replace(
      "Sections~\\ref{sec:check}, \\ref{sec:rq2} and~\\ref{sec:rq3}",
      "Sections~\\ref{sec:check} and~\\ref{sec:rq3}",
    );
    const files = {
      ...BUILT,
      "/p/paper.tex": src,
      "/p/_build/sources.json": recordText(
        { ...SOURCES, "paper.tex": src },
        {
          inputs: [
            ["paper.tex", "body"],
            ["results.tex", "body"],
          ],
        },
      ),
    };
    expect(run(files, src)).toEqual([]);
  });

  it("not built — no record — says nothing: paper/sources-fresh speaks", () => {
    const { "/p/_build/sources.json": _, ...unbuilt } = BUILT;
    expect(run(unbuilt)).toEqual([]);
  });

  it("a record the paper has changed since says nothing: the .aux numbers other text", () => {
    expect(run({ ...BUILT, "/p/results.tex": `${RESULTS}% edited\n` })).toEqual(
      [],
    );
  });

  it("a fresh record and no .aux says nothing", () => {
    const { "/p/paper.aux": _, ...noAux } = BUILT;
    expect(run(noAux)).toEqual([]);
  });
});
