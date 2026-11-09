import { describe, expect, it } from "vitest";
import { run } from "./cli.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const TEX = "\\documentclass{article}\n\\begin{document}x\\end{document}\n";
const root = useTempDir("paperlint-time-");
writeTree(root, {
  "package.json": JSON.stringify({ name: "c", private: true }),
  "papers/a/paper.tex": TEX,
  "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
});

/** A clock that answers `ticks` in turn: no test measures real time. */
const clock = (ticks: readonly number[]) => {
  const rest = [...ticks];
  return () => rest.shift() ?? Number.NaN;
};

async function lint(args: string[], ticks: readonly number[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["lint", ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
    now: clock(ticks),
  });
  return { code, out: out.join("\n"), err };
}

describe("paperlint lint reports its time on stderr", () => {
  it("a quick run: one line, the file count, seconds to one decimal", async () => {
    const r = await lint([], [1000, 2234]);
    expect(r.code).toBe(0);
    expect(r.err).toEqual(["linted 2 file(s) in 1.2 s"]);
  });

  it("--json keeps stdout a pure JSON array, with no stats in it", async () => {
    const r = await lint(["--json"], [0, 500]);
    const parsed: unknown = JSON.parse(r.out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(r.out).not.toMatch(/"stats"/);
    expect(r.err).toEqual(["linted 2 file(s) in 0.5 s"]);
  });

  it("over 10 s the three slowest rules are named, with ESLint's own milliseconds", async () => {
    const r = await lint([], [0, 12000]);
    expect(r.err).toHaveLength(2);
    expect(r.err[0]).toBe("linted 2 file(s) in 12.0 s");
    expect(r.err[1]).toMatch(
      /^slowest rules: \S+ \d+ ms · \S+ \d+ ms · \S+ \d+ ms$/,
    );
  });
});
