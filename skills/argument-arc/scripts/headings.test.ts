/**
 * headings-core.ts: every heading of a paper, in order, from `paper.tex` and the files its build
 * recorded — and the command that prints them. No model, no network.
 */
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latexReader } from "#src/adapters/latex/index";
import { memoryFiles } from "#src/adapters/memory/index";
import { sourcesCodec } from "#src/adapters/sources-record/index";
import { builtFixture, plantedOnDisk } from "../../../test/recorded-fixture.ts";
import { runNode, useTempDir } from "../../../test/support.ts";
import { headingsOf, listing, main } from "./headings-core.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "headings.ts");

const deps = (files: Record<string, string>) => ({
  files: memoryFiles(files),
  latex: latexReader,
  codec: sourcesCodec,
});

describe("headingsOf — the paper's headings, as the build read the paper", () => {
  it("🔴 the main file's and an included file's, in order; not one behind a comment or \\iffalse", () => {
    // p1: paper.tex opens on «Introduction» and \input's sections/intro.tex («Results»); dead.tex is
    // commented out and parked.tex sits behind \iffalse, so the record lists neither.
    const files = builtFixture("p1", "/p");
    expect(
      headingsOf("/p/paper.tex", files["/p/paper.tex"] ?? "", deps(files)),
    ).toEqual(["Introduction", "Results"]);
  });

  it("not the \\title, and a starred or nested heading's title with its spacing collapsed", () => {
    const src =
      "\\documentclass{article}\n\\title{A Paper}\n\\begin{document}\n\\section*{Scope  and\n limits}\n\\subsection{The gate}\nText.\n\\end{document}\n";
    expect(
      headingsOf("/q/paper.tex", src, deps({ "/q/paper.tex": src })),
    ).toEqual(["Scope and limits", "The gate"]);
  });
});

describe("main — the command", () => {
  const run = (argv: readonly string[], files: Record<string, string>) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = main(argv, deps(files), {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    });
    return { code, out: out.join(""), err: err.join("") };
  };

  it("🔴 prints the numbered list and the question to read it with", () => {
    const files = builtFixture("p1", "/p");
    expect(run(["/p/paper.tex"], files)).toEqual({
      code: 0,
      out: listing("/p/paper.tex", ["Introduction", "Results"]),
      err: "",
    });
    expect(listing("paper.tex", ["Introduction", "Results"])).toBe(
      [
        "=== paper.tex — every heading, in order ===",
        "  1. Introduction",
        "  2. Results",
        "",
        "Read these as a stranger who will read nothing else. Each should name a thing:",
        'a linter, a configuration, a repository, a rule — not "answers", "kinds", "moves".',
        "",
      ].join("\n"),
    );
  });

  it("refuses with exit 2: no file named, or none at the path", () => {
    expect(run([], {})).toEqual({
      code: 2,
      out: "",
      err: "usage: node headings.js <paper.tex>\n",
    });
    expect(run(["/nowhere/paper.tex"], {})).toEqual({
      code: 2,
      out: "",
      err: "headings: no file at /nowhere/paper.tex\n",
    });
  });

  it("the entry runs it on the disk: a built paper's headings on stdout, exit 0", () => {
    const dir = useTempDir("headings-");
    plantedOnDisk(dir, "p1");
    const r = runNode(SCRIPT, ["paper.tex"], { cwd: dir });
    expect(r).toEqual({
      status: 0,
      stdout: listing("paper.tex", ["Introduction", "Results"]),
      stderr: "",
    });
  });
});
