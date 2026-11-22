/**
 * `check-release-claims.sh`, the release-claim reconciler: it prints the paper's "we release X"
 * sentences next to what the artifact directory actually holds, so an over-promise is visible.
 * The gate is advisory (a real run always exits 0), so the verdict lives in its output; exit 2 on
 * a bad path is the only way a wrong path differs from a paper that promises nothing.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-release-claims.sh",
);
const made: string[] = [];
afterEach(() => {
  made.splice(0).forEach((d) => {
    rmSync(d, { recursive: true, force: true });
  });
});

/** A paper directory holding `paper.tex` with the given lines and the given artifact files. */
const paperDir = (
  lines: readonly string[],
  artifact: Readonly<Record<string, string>> = {},
): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "release-")));
  made.push(dir);
  writeFileSync(join(dir, "paper.tex"), `${lines.join("\n")}\n`);
  Object.entries(artifact).forEach(([name, body]) => {
    mkdirSync(join(dir, "artifact"), { recursive: true });
    writeFileSync(join(dir, "artifact", name), body);
  });
  return dir;
};

const run = (args: readonly string[]) => {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: tmpdir(),
  });
  return { status: r.status, stdout: r.stdout };
};

const claimsHeader = (dir: string): string[] => [
  `== release-claim reconciliation: ${dir} ==`,
  "-- (1) PROSE claims (release verbs) — reconcile each against the artifact listing below --",
];

const footer = [
  "-- CHECK: every 'we release X' in (1) must be satisfied by a file in (2).",
  "   Promised-but-absent (e.g. 'raw runs' but only aggregates shipped) -> soften to '(at camera-ready)' or add the file.",
  "   Mirror the accurate Availability paragraph; do not let the abstract/conclusion over-promise the artifact.",
  "",
];

describe("check-release-claims.sh", () => {
  it("prints the release sentence beside what the artifact holds, skipping a commented-out claim", () => {
    const dir = paperDir(
      [
        "\\documentclass{article}",
        "\\begin{document}",
        "We release the harness and raw runs with the submission.",
        "% we release nothing, and this line is a comment",
        "The gate reads the configuration.",
        "\\end{document}",
      ],
      { "aggregates.csv": "arm,mean\na,1\n" },
    );
    expect(run([dir])).toEqual({
      status: 0,
      stdout: [
        ...claimsHeader(dir),
        "    3:We release the harness and raw runs with the submission.",
        `-- (2) what the artifact ACTUALLY contains (${dir}/artifact) --`,
        "    artifact/aggregates.csv",
        ...footer,
      ].join("\n"),
    });
  });

  it("says no release-verb line matched, and that no local artifact exists, for a paper that promises nothing", () => {
    const dir = paperDir([
      "\\documentclass{article}",
      "\\begin{document}",
      "The gate reads the configuration.",
      "\\end{document}",
    ]);
    expect(run([dir])).toEqual({
      status: 0,
      stdout: [
        ...claimsHeader(dir),
        "    (no release-verb lines matched)",
        `-- (2) what the artifact ACTUALLY contains (${dir}/artifact) --`,
        "    (no local artifact/ dir — hosted externally? then reconcile the claim against the HOSTED contents)",
        ...footer,
      ].join("\n"),
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
