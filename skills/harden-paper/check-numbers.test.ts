/**
 * `check-numbers.sh`, the number enumerator: it lists every quantitative token in a paper's body
 * so each can be traced to an artifact output or a citation. The gate is advisory (a real run
 * always exits 0), so the verdict lives entirely in its output, and an empty list is its whole
 * failure mode. Exit 2 on a bad path is the only signal that tells "nothing to trace" from "no
 * file was read".
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-numbers.sh",
);
const made: string[] = [];
afterEach(() => {
  made.splice(0).forEach((d) => {
    rmSync(d, { recursive: true, force: true });
  });
});

/** A paper directory holding `paper.tex` with the given lines. */
const paperDir = (lines: readonly string[]): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "numbers-")));
  made.push(dir);
  writeFileSync(join(dir, "paper.tex"), `${lines.join("\n")}\n`);
  return dir;
};

const run = (args: readonly string[]) => {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: tmpdir(),
  });
  return { status: r.status, stdout: r.stdout };
};

const header = (dir: string): string[] => [
  `== number enumeration (body only): ${dir}/paper.tex ==`,
  "   Trace each to an artifact output or a \\cite. An untraceable number = treat as fabricated (source it or cut it).",
];

const footer =
  "-- review the list: every number above must appear in the artifact output or carry a citation --";

describe("check-numbers.sh", () => {
  it("lists the body line whose numbers carry no citation, and nothing else", () => {
    const dir = paperDir([
      "\\documentclass{article}",
      "\\begin{document}",
      "% a stray 99\\% inside a comment, which is not body prose",
      "The mean output change ranged from a 37\\% growth to an 18\\% cut across independent runs.",
      "Prior work reports a 2.4x speedup \\cite{smith2020}.",
      "\\begin{filecontents}{refs.bib}",
      "@article{smith2020, year={2020}, pages={100--200}}",
      "\\end{filecontents}",
      "\\end{document}",
    ]);
    // Excluded: the comment (line 3), the cited line (5) and the embedded bibliography (6-8).
    expect(run([dir])).toEqual({
      status: 0,
      stdout: [
        ...header(dir),
        "  4: The mean output change ranged from a 37\\% growth to an 18\\% cut across independent runs.",
        footer,
        "",
      ].join("\n"),
    });
  });

  it("lists nothing for prose with no quantitative token", () => {
    const dir = paperDir([
      "\\documentclass{article}",
      "\\begin{document}",
      "The gate reads the configuration and fails the build when they disagree.",
      "\\end{document}",
    ]);
    expect(run([dir])).toEqual({
      status: 0,
      stdout: [...header(dir), footer, ""].join("\n"),
    });
  });

  it("exits 2, naming the file, when the named tex basename does not exist", () => {
    const dir = paperDir(["\\documentclass{article}"]);
    expect(run([dir, "nosuchbase"])).toEqual({
      status: 2,
      stdout: "FAIL: no nosuchbase.tex\n",
    });
  });

  it("exits 2 when the paper directory does not exist", () => {
    const dir = paperDir([]);
    const gone = join(dir, "missing");
    expect(run([gone])).toEqual({
      status: 2,
      stdout: `FAIL: cannot cd ${gone}\n`,
    });
  });
});
