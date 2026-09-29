/**
 * `paperlint lint` over a paper whose body is in other files: the rules over ESLint's LaTeX text read
 * every file `paper.tex` includes from its document body, report at that file's own path and line,
 * and fix that file. What a rule decides for the whole paper — the majority reference form and
 * whether the build is in review mode — it decides over all of the paper's files, not over the one
 * it is reporting in.
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
import { run } from "./cli.ts";
import { lintReport } from "../test/lint-report.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const doc = (cls: string, preamble: string, body: string): string =>
  `\\documentclass${cls}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

const INTRO = "See §3 and p < .05.\nAs Fig.~\\ref{f3} shows.\n";

function project(files: Record<string, string>): string {
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
  for (const [p, text] of Object.entries(all)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

/** `paperlint lint --json` → rule ids per linted file (relative to the project), and stderr. */
async function lint(
  root: string,
  args: string[] = [],
): Promise<{ byFile: Record<string, string[]>; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  await run(["lint", "--json", ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  const byFile = Object.fromEntries(
    lintReport(out.join("\n")).map((r) => [
      relative(root, r.filePath),
      r.messages.map((m) => m.ruleId ?? "(fatal)").sort(),
    ]),
  );
  return { byFile, err: err.join("\n") };
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

  it("an include that resolves nowhere is named as a file lint did not read", async () => {
    const { err } = await lint(
      project({
        "papers/a/paper.tex": doc("{article}", "", "\\input{sections/gone}"),
      }),
    );
    expect(err).toMatch(
      /papers\/a\/paper\.tex: lint did not read `sections\/gone`/,
    );
  });

  it("the note is about the papers this run lints, not another paper of the project", async () => {
    const root = project({
      "papers/b/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
      "papers/b/paper.tex": doc("{article}", "", "\\input{gone}"),
    });
    expect((await lint(root, ["papers/a"])).err).not.toMatch(/did not read/);
    expect((await lint(root)).err).toMatch(
      /papers\/b\/paper\.tex: lint did not read `gone`/,
    );
  });
});
