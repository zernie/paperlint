import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./cli.ts";
import { recordOnDisk } from "../test/recorded-fixture.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const TEX = "\\documentclass{article}\n\\begin{document}x\\end{document}\n";
const STATUS = "---\nstages: []\n---\n";

const root = useTempDir("paperlint-unowned-");
let n = 0;

/** A project with one paper `papers/<name>`; built when `built` names the body files its record lists. */
function project(files: Record<string, string>, built?: readonly string[]) {
  n += 1;
  const dir = join(root, `p${String(n)}`);
  writeTree(dir, {
    "package.json": JSON.stringify({ name: "c", private: true }),
    "papers/a/paper.tex": TEX,
    "papers/a/PIPELINE-STATUS.md": STATUS,
    ...files,
  });
  if (built)
    recordOnDisk(join(dir, "papers/a"), {
      inputs: [
        ["paper.tex", "body"],
        ...built.map((b) => [b, "body"] as const),
      ],
    });
  return dir;
}

async function lint(cwd: string, file: string) {
  const err: string[] = [];
  const code = await run(["lint", "--json", file], {
    cwd,
    log: () => undefined,
    err: (s: string) => err.push(s),
  });
  return { code, err: err.join("\n") };
}

const FIGURE = { "papers/a/figures/construction.tex": "\\draw (0,0);\n" };

describe("a .tex outside the last build is refused with that reason", () => {
  it("a built paper whose paper.tex does not include the figure", async () => {
    const dir = project({ ...FIGURE, "papers/a/sections/intro.tex": "Hi.\n" }, [
      "sections/intro.tex",
    ]);
    const r = await lint(dir, "papers/a/figures/construction.tex");
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      "papers/a/figures/construction.tex is not in the last build's sources (papers/a/_build/sources.json) — paperlint lints a figure only when paper.tex includes it; rebuild with `paperlint build` if it was just added.",
    );
  });

  it("a paper that was never built says so", async () => {
    const dir = project(FIGURE);
    const r = await lint(dir, "papers/a/figures/construction.tex");
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      "papers/a/figures/construction.tex is in papers/a, which has not been built (no papers/a/_build/sources.json) — paperlint lints a figure only when paper.tex includes it, and only a build records that; run `paperlint build papers/a` first.",
    );
  });

  it("a record the files have moved on from says it is out of date", async () => {
    const dir = project(FIGURE, []);
    writeFileSync(join(dir, "papers/a/paper.tex"), `${TEX}% edited\n`);
    const r = await lint(dir, "papers/a/figures/construction.tex");
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      "papers/a/figures/construction.tex is not linted: papers/a/_build/sources.json is out of date (paper.tex edited) — rebuild with `paperlint build`, then paperlint lints the files paper.tex includes.",
    );
  });

  it("the other half: a figure the build recorded is linted, not refused", async () => {
    const dir = project(FIGURE, ["figures/construction.tex"]);
    const r = await lint(dir, "papers/a/figures/construction.tex");
    expect(r.code).toBe(0);
    expect(r.err).not.toMatch(/not in the last build|not been built/);
  });
});

describe("any other unowned file keeps the general refusal, without the glob it does not apply to", () => {
  it("a script in a paper", async () => {
    const dir = project({ "papers/a/repro/x.js": "return 1;\n" });
    const r = await lint(dir, "papers/a/repro/x.js");
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      "papers/a/repro/x.js is not a file paperlint lints — it lints **/PIPELINE-STATUS.md, **/reviews/*.md, **/paper.tex, **/siblings/*.md, and the .tex files a built paper.tex includes",
    );
  });

  it("a .tex that sits in no paper", async () => {
    const dir = project({ "notes/loose.tex": "x\n" });
    const r = await lint(dir, "notes/loose.tex");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(
      /^notes\/loose\.tex is not a file paperlint lints — /,
    );
  });
});
