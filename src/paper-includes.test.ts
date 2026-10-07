/**
 * `paperlint lint` over a paper whose body is in other files: the rules over ESLint's LaTeX text read
 * every body file the last build's record lists (`_build/sources.json`: the files TeX read after
 * `\\begin{document}`), report at that file's own path and line, and fix that file. A paper with no
 * record, or one it has outgrown, is `paper.tex` alone and `paper/sources-fresh` says the rest went
 * unlinted. What a rule decides for the whole paper — the majority reference form and whether the
 * build is in review mode — it decides over all of the paper's files, not over the one it is
 * reporting in.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { run } from "./cli.ts";
import { includeBlocks, paperBodies } from "./paper-includes.ts";
import { lintReport } from "../test/lint-report.ts";
import {
  builtFixture,
  fixtureFiles,
  recordedTree,
} from "../test/recorded-fixture.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const doc = (cls: string, preamble: string, body: string): string =>
  `\\documentclass${cls}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

const INTRO = "See §3 and p < .05.\nAs Fig.~\\ref{f3} shows.\n";

/** What TeX read of the paper `project` makes, in the order it read it. */
const READ = [
  { path: "paper.tex", role: "body" },
  { path: "macros.tex", role: "preamble" },
  { path: "sections/intro.tex", role: "body" },
] as const;

/**
 * A project with one paper, `papers/a`, as a build left it: its files, and a record listing `inputs`.
 * `inputs: null` is a paper nothing has built.
 */
function project(
  files: Record<string, string>,
  inputs: readonly { path: string; role: "preamble" | "body" }[] | null = READ,
): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-inc-")));
  dirs.push(root);
  const all: Record<string, string> = {
    "package.json": JSON.stringify({ name: "c", private: true }),
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "papers/a/paper.tex": doc(
      "{article}",
      "\\input{macros}",
      "Figure~\\ref{f1} and Figure~\\ref{f2}.\n\\input{sections/intro}",
    ),
    // Prose in a preamble include is not the body: were it linted, `§2` would be reported.
    "papers/a/macros.tex": "% See §2.\n\\newcommand{\\half}{0.5}\nSee §2.\n",
    "papers/a/sections/intro.tex": INTRO,
    // A frozen version beside the paper is not the paper.
    "papers/a/versions/2026-01-01-submitted.tex": doc(
      "{article}",
      "",
      "See §9.",
    ),
    ...files,
  };
  const written = inputs === null ? all : recordedTree(all, "papers/a", inputs);
  for (const [p, text] of Object.entries(written)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

/** `paperlint lint --json` → rule ids per linted file (relative to the project), and stderr. */
async function lint(
  root: string,
  args: string[] = [],
): Promise<{
  byFile: Record<string, string[]>;
  said: Record<string, string[]>;
  err: string;
}> {
  const out: string[] = [];
  const err: string[] = [];
  await run(["lint", "--json", ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  const report = lintReport(out.join("\n"));
  const byFile = Object.fromEntries(
    report.map((r) => [
      relative(root, r.filePath),
      r.messages.map((m) => m.ruleId ?? "(fatal)").sort(),
    ]),
  );
  const said = Object.fromEntries(
    report.map((r) => [
      relative(root, r.filePath),
      r.messages.map((m) => m.message),
    ]),
  );
  return { byFile, said, err: err.join("\n") };
}

describe("lint reads the files paper.tex includes from its body", () => {
  it("🔴 findings in an included file land at that file; the majority form is the paper's", async () => {
    const { byFile } = await lint(project({}));
    expect(byFile["papers/a/sections/intro.tex"]).toEqual([
      "paper/figure-ref-style",
      "paper/leading-zero",
      "paper/section-word",
    ]);
    // Two `Figure` in paper.tex against one `Fig.` in the section: the section holds the minority.
    expect(byFile["papers/a/paper.tex"]).not.toContain(
      "paper/figure-ref-style",
    );
  });

  it("a preamble include and a frozen version beside the paper are not linted", async () => {
    const { byFile } = await lint(project({}));
    expect(Object.keys(byFile).sort()).toEqual([
      "papers/a/PIPELINE-STATUS.md",
      "papers/a/paper.tex",
      "papers/a/sections/intro.tex",
    ]);
  });

  it("🔴 an included file that is not `.tex` — a `.bbl` — is not handed to ESLint, which parsed it as JavaScript (#153)", async () => {
    const { byFile, err } = await lint(
      project(
        {
          "papers/a/paper.tex": doc(
            "{article}",
            "",
            "Text, as Figure~\\ref{f1} shows.\n\\input{paper.bbl}",
          ),
          // What bibtex writes: a comment first, which ESLint's JavaScript parser stops at.
          "papers/a/paper.bbl":
            "% Generated by IEEEtran.bst\n\\begin{thebibliography}{1}\n" +
            "\\bibitem{a} A. Author, ``A result with p < .05,'' 2024.\n" +
            "\\end{thebibliography}\n",
        },
        [
          { path: "paper.tex", role: "body" },
          { path: "paper.bbl", role: "body" },
        ],
      ),
    );
    // Guards: the `.bbl` was the one file of the run with a parse error («Unexpected token %»).
    // It is bibtex's output, not prose the author edits: no fragment rule reports in it, and
    // paper.tex — which reads it, spliced, as TeX typesets it — draws no finding from its `.05`.
    expect(byFile).toEqual({
      "papers/a/PIPELINE-STATUS.md": [],
      "papers/a/paper.tex": [],
    });
    expect(err).not.toMatch(/paper\.bbl/);
  });

  it("--fix rewrites the included file, to the paper's majority form", async () => {
    const root = project({});
    const before = readFileSync(join(root, "papers/a/paper.tex"), "utf8");
    const { byFile } = await lint(root, ["--fix"]);
    expect(byFile["papers/a/sections/intro.tex"]).toEqual([]);
    expect(
      readFileSync(join(root, "papers/a/sections/intro.tex"), "utf8"),
    ).toBe("See Section 3 and p < 0.05.\nAs Figure~\\ref{f3} shows.\n");
    expect(readFileSync(join(root, "papers/a/paper.tex"), "utf8")).toBe(before);
  });
});

describe("what lint decides for the whole paper, it decides over every file of it", () => {
  it("tex/future-promise in an included file follows the build mode paper.tex declares", async () => {
    const promise = {
      "papers/a/sections/intro.tex":
        "The harness will be released at camera-ready.\n",
    };
    const final = await lint(project(promise));
    expect(final.byFile["papers/a/sections/intro.tex"]).toEqual([
      "tex/future-promise",
    ]);
    const review = await lint(
      project({
        ...promise,
        "papers/a/paper.tex": doc(
          "[review]{article}",
          "",
          "Text.\n\\input{sections/intro}",
        ),
      }),
    );
    expect(review.byFile["papers/a/sections/intro.tex"]).toEqual([]);
  });
});

describe("a built paper whose files are clean", () => {
  it("is reported as the files that were checked — the paper's, and the section TeX read", async () => {
    const root = project({
      "papers/a/sections/intro.tex": "Plain words, nothing to flag.\n",
    });
    const out: string[] = [];
    const code = await run(["lint"], {
      cwd: root,
      log: (s: string) => out.push(s),
      err: () => undefined,
    });
    expect({ code, out }).toEqual({
      code: 0,
      out: ["✓ 3 file(s) checked, no findings"],
    });
  });
});

describe("a paper whose record is missing, stale or silent about a file", () => {
  it("🔴 a paper no build has recorded is paper.tex alone: its includes are not linted, and paper/sources-fresh says so", async () => {
    const { byFile } = await lint(project({}, null));
    expect(byFile).toEqual({
      "papers/a/PIPELINE-STATUS.md": [],
      "papers/a/paper.tex": ["paper/sources-fresh"],
    });
  });

  it("🔴 a paper changed since its build is paper.tex alone, and paper/sources-fresh names the file", async () => {
    const root = project({});
    writeFileSync(
      join(root, "papers/a/sections/intro.tex"),
      "Edited after the build, p < .05.\n",
    );
    const { byFile, said } = await lint(root);
    expect(Object.keys(byFile)).not.toContain("papers/a/sections/intro.tex");
    expect(said["papers/a/paper.tex"]).toEqual([
      expect.stringMatching(/sections\/intro\.tex edited/),
    ]);
  });

  it("🔴 a file the text names and TeX did not read is not linted: the record, not the text, says what the paper is", async () => {
    const { byFile } = await lint(
      project(
        {
          "papers/a/paper.tex": doc(
            "{article}",
            "",
            "Text.\n\\input{sections/intro}\n\\iffalse\n\\input{sections/parked}\n\\fi",
          ),
          "papers/a/sections/parked.tex": "See §3 and p < .05.\n",
        },
        [
          { path: "paper.tex", role: "body" },
          { path: "sections/intro.tex", role: "body" },
        ],
      ),
    );
    expect(Object.keys(byFile).sort()).toEqual([
      "papers/a/PIPELINE-STATUS.md",
      "papers/a/paper.tex",
      "papers/a/sections/intro.tex",
    ]);
  });
});

describe("paperBodies — the body files of the record TeX's own build left", () => {
  const bodies = (files: Record<string, string>, dir = "/papers/p") =>
    paperBodies([dir], { files: memoryFiles(files), codec: sourcesCodec });

  it("p1: the one file TeX read after \\begin{document} — not the `.bib`, not the files its text names behind a comment or \\iffalse", () => {
    expect(bodies(builtFixture("p1", "/papers/p"))).toEqual([
      {
        dir: "/papers/p",
        main: "/papers/p/paper.tex",
        files: ["/papers/p/sections/intro.tex"],
      },
    ]);
  });

  it("a body file that is a `.tex` listed after paper.tex is handed over; a preamble one is not (v16: a block written from a preamble include)", () => {
    expect(
      bodies(builtFixture("v16-included-block", "/papers/p"))[0]?.files,
    ).toEqual([]);
    expect(
      bodies(builtFixture("v17-include-order", "/papers/p"))[0]?.files,
    ).toEqual(["/papers/p/bibsetup.tex"]);
  });

  it("🔴 a file the text names after the document ends, which TeX never read, is not handed over (v23)", () => {
    expect(
      bodies(builtFixture("v23-parked-include", "/papers/p"))[0]?.files,
    ).toEqual([]);
  });

  it("🔴 no record: paper.tex alone", () => {
    expect(bodies(fixtureFiles("p1", "/papers/p"))).toEqual([
      { dir: "/papers/p", main: "/papers/p/paper.tex", files: [] },
    ]);
  });

  it("🔴 a stale record: paper.tex alone", () => {
    const files = {
      ...builtFixture("p1", "/papers/p"),
      "/papers/p/sections/intro.tex": "Changed.\n",
    };
    expect(bodies(files)[0]?.files).toEqual([]);
  });

  it("a directory without paper.tex is no paper", () => {
    expect(bodies({}, "/papers/none")).toEqual([]);
  });
});

describe("includeBlocks — what ESLint is told of each paper", () => {
  it("un-ignores each body file by name, and hands the paper to every file of it", () => {
    const main = absolutePath("/papers/p/paper.tex");
    const intro = absolutePath("/papers/p/sections/intro.tex");
    expect(includeBlocks([{ dir: "/papers/p", main, files: [intro] }])).toEqual(
      [
        { basePath: "/papers/p", ignores: ["!sections/intro.tex"] },
        {
          basePath: "/papers/p",
          files: ["paper.tex", "sections/intro.tex"],
          settings: { paperlint: { paper: { main, files: [main, intro] } } },
        },
      ],
    );
  });

  it("a paper of one file un-ignores nothing", () => {
    const main = absolutePath("/papers/p/paper.tex");
    expect(includeBlocks([{ dir: "/papers/p", main, files: [] }])).toEqual([
      {
        basePath: "/papers/p",
        files: ["paper.tex"],
        settings: { paperlint: { paper: { main, files: [main] } } },
      },
    ]);
  });
});
