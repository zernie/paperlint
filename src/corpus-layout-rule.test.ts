/**
 * `corpus/allowed-files-only` through `paperlint lint`, the way a consumer runs it: a stray name at
 * the top of a corpus reported on its `papers.json`, and a corpus that stores copies with no
 * `papers.json` reported on the project's root `paperlint.json`. The texts are pinned beside the
 * domain (src/domain/corpus-layout.test.ts); here, where each finding lands and what it names.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./cli.ts";
import { lintReport } from "../test/lint-report.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const STATUS = "---\nstages: []\n---\n# PIPELINE-STATUS\n";
const TEX = "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n";
const PAPER = {
  "papers/p/PIPELINE-STATUS.md": STATUS,
  "papers/p/paper.tex": TEX,
};
const C = "papers/venues/agent";
const RECORD = `${C}/papers.json`;
const EMPTY = '{"venue":"agent","editions":[],"papers":[],"rebuild":[]}';
const ID = "corpus/allowed-files-only";

/** `paperlint lint --json` run in `from`: the exit code, the linted files, and each finding as [file, line, the path it names]. */
async function lint(tree: Readonly<Record<string, string>>, from = ".") {
  const dir = writeTree(useTempDir("paperlint-corpus-layout-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  const out: string[] = [];
  const code = await run(["lint", "--json"], {
    cwd: join(dir, from),
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  const results = lintReport(out.join("\n"));
  const rel = (p: string) => p.slice(dir.length + 1);
  return {
    code,
    files: results.map((r) => rel(r.filePath)).sort(),
    found: results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === ID)
        .map((m) => [rel(r.filePath), m.line, m.message.split("`")[1]]),
    ),
  };
}

describe("corpus/allowed-files-only: a name at the top of a corpus", () => {
  it("🔴 reports a note, a folder and a script, each once, on papers.json", async () => {
    const r = await lint({
      ...PAPER,
      [RECORD]: EMPTY,
      [`${C}/notes.md`]: "# notes\n",
      [`${C}/scripts/fetch.sh`]: "echo\n",
      [`${C}/x.py`]: "print(1)\n",
      [`${C}/pdf/a.md`]: "inside pdf/: corpus/record's, not this rule's\n",
    });
    expect(r.found).toEqual(
      ["notes.md", "scripts/", "x.py"].map((n) => [
        RECORD,
        1,
        `venues/agent/${n}`,
      ]),
    );
  });

  it("🔴 is silent on a corpus holding all seven names", async () => {
    const r = await lint({
      ...PAPER,
      [RECORD]: EMPTY,
      [`${C}/MANIFEST.md`]: "# caveats\n",
      [`${C}/measurements.json`]: "[]",
      [`${C}/pdf/.gitkeep`]: "",
      [`${C}/text/.gitkeep`]: "",
      [`${C}/deep-reads/a.md`]: "# a\n",
      [`${C}/sources/cfp.html`]: "<p>cfp</p>\n",
      [`${C}/.DS_Store`]: "",
      "papers/venues/README.md": "loose in venues/: not a corpus, not judged\n",
    });
    expect(r.found).toEqual([]);
  });

  it("🔴 is silent on a project with no venues/, and lints no new file there", async () => {
    // Guards: most consumers keep no corpus; the rule must cost them nothing, not even a file.
    const r = await lint({ ...PAPER, "paperlint.json": "{}" });
    expect({ found: r.found, files: r.files }).toEqual({
      found: [],
      files: ["papers/p/PIPELINE-STATUS.md", "papers/p/paper.tex"],
    });
  });

  it("is turned off, both findings, in the root paperlint.json by one line", async () => {
    const r = await lint({
      ...PAPER,
      "paperlint.json": JSON.stringify({ rules: { [ID]: "off" } }),
      [RECORD]: EMPTY,
      [`${C}/notes.md`]: "# notes\n",
      "papers/venues/other/pdf/a.pdf": "%PDF",
    });
    expect(r.found).toEqual([]);
  });
});

describe("corpus/allowed-files-only: a corpus that stores copies with no papers.json", () => {
  it("🔴 is reported on the root paperlint.json, once per corpus", async () => {
    const r = await lint({
      ...PAPER,
      "paperlint.json": "{}",
      "papers/venues/agent/pdf/a.pdf": "%PDF",
      "papers/venues/other/text/a.txt": "a",
      "papers/venues/ids-only/MANIFEST.md": "# ids only\n",
      "papers/venues/kept/papers.json": EMPTY.replace("agent", "kept"),
      "papers/venues/kept/pdf/.gitkeep": "",
    });
    // Guards: a corpus folder made before papers.json existed warns and never fails the build (v20.6.0
    // shipped this rule at error in a minor release, which turned such a consumer red).
    expect({ code: r.code, found: r.found }).toEqual({
      code: 0,
      found: [
        ["paperlint.json", 1, "papers/venues/agent/"],
        ["paperlint.json", 1, "papers/venues/other/"],
      ],
    });
  });

  it("follows papersDir, and a paper's own paperlint.json is never linted", async () => {
    const r = await lint({
      "paperlint.json": '{"papersDir":"writing"}',
      "writing/p/PIPELINE-STATUS.md": STATUS,
      "writing/p/paper.tex": TEX,
      "writing/p/paperlint.json": "{}",
      "writing/venues/agent/pdf/a.pdf": "%PDF",
    });
    expect({ files: r.files, found: r.found }).toEqual({
      files: [
        "paperlint.json",
        "writing/p/PIPELINE-STATUS.md",
        "writing/p/paper.tex",
      ],
      found: [["paperlint.json", 1, "writing/venues/agent/"]],
    });
  });

  it("finds the root paperlint.json when the papers sit outside the project", async () => {
    // ESLint then runs from the folder above both, and names the file through the project's folder.
    const tree = {
      "proj/package.json": '{"name":"consumer","private":true}',
      "proj/paperlint.json": '{"papersDir":"../writing"}',
      "writing/p/PIPELINE-STATUS.md": STATUS,
      "writing/p/paper.tex": TEX,
      "writing/venues/agent/text/a.txt": "a",
    };
    expect((await lint(tree, "proj")).found).toEqual([
      ["proj/paperlint.json", 1, "../writing/venues/agent/"],
    ]);
  });

  it("is silent with no root paperlint.json: there is no file to report on", async () => {
    const r = await lint({ ...PAPER, [`${C}/pdf/a.pdf`]: "%PDF" });
    expect({ code: r.code, found: r.found }).toEqual({ code: 0, found: [] });
  });
});

describe("corpus/allowed-files-only: a file loose in venues/", () => {
  it("🔴 a file loose in venues/ is reported there too; its index and corpus folders are not", async () => {
    const r = await lint({
      ...PAPER,
      "paperlint.json": "{}",
      [RECORD]: EMPTY,
      "papers/venues/README.md": "# the corpora\n",
      "papers/venues/codebook.md": "# codes\n",
      "papers/venues/scripts/check.py": "print(1)\n",
    });
    expect(r.found).toEqual([
      ["paperlint.json", 1, "papers/venues/codebook.md"],
    ]);
  });
});
