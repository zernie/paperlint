/**
 * The `LatexDiff` adapter over a fake `latexdiff` process: what it runs and writes, the one line it
 * says for each way the program fails, and the stretches it reads out of the output's `\DIFdel` markup.
 */
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import type { Command, ProcessExit } from "../../ports/process.ts";
import { latexReader } from "../latex/index.ts";
import { memoryFiles } from "../memory/index.ts";
import { latexDiff, withTexBin } from "./index.ts";

const DIR = absolutePath("/w/p/_build/diff");

function diff(out: (c: Command) => ProcessExit) {
  const files = memoryFiles({});
  const calls: Command[] = [];
  const d = latexDiff({
    proc: {
      run: (c) => {
        calls.push(c);
        return out(c);
      },
    },
    env: { PATH: "/bin" },
    files,
    latex: latexReader,
  });
  return { d, files, calls };
}
const exited = (stdout: string, status = 0, stderr = ""): ProcessExit => ({
  kind: "exited",
  status,
  stdout,
  stderr,
});
const removed = (text: string) => {
  const r = diff(() => exited(text)).d.removedSince("a", "b", DIR);
  return r.ok ? r.value.removed : r.error;
};
const read = (f: ReturnType<typeof memoryFiles>, name: string) => {
  const b = f.readBytes(absolutePath(`${DIR}/${name}`));
  return b === null ? null : new TextDecoder().decode(b);
};

describe("the latexdiff adapter, the run", () => {
  it("🔴 writes both texts, runs latexdiff on them in the folder, writes diff.tex and returns the removed text", () => {
    const { d, files, calls } = diff(() => exited("x \\DIFdel{Gone.} y"));
    expect(d.removedSince("old", "new", DIR)).toEqual({
      ok: true,
      value: { diffTex: "x \\DIFdel{Gone.} y", removed: ["Gone."] },
    });
    expect(calls.map((c) => [c.file, c.args, c.cwd, c.env])).toEqual([
      ["latexdiff", ["approved.tex", "current.tex"], DIR, { PATH: "/bin" }],
    ]);
    expect([
      read(files, "approved.tex"),
      read(files, "current.tex"),
      read(files, "diff.tex"),
    ]).toEqual(["old", "new", "x \\DIFdel{Gone.} y"]);
  });

  it.each<[string, ProcessExit, string]>([
    [
      "not installed",
      { kind: "not-found", file: "latexdiff" },
      "latexdiff is not on PATH — `npx paperlint toolchain` installs it",
    ],
    [
      "fails with a message",
      exited("", 2, "bad tex"),
      "latexdiff failed: bad tex",
    ],
    ["fails silently", exited("", 3), "latexdiff failed: exit 3"],
    [
      "does not finish",
      { kind: "timed-out", afterMs: 1, stdout: "", stderr: "" },
      "latexdiff failed: timed-out",
    ],
  ])("one line when it %s, and no diff.tex", (_, exit, says) => {
    const { d, files } = diff(() => exit);
    const r = d.removedSince("a", "b", DIR);
    expect(!r.ok && r.error.startsWith(says)).toBe(true);
    expect(read(files, "diff.tex")).toBeNull();
  });
});

describe("latexdiff's PATH", () => {
  it("🔴 the managed TeX Live bin comes first; without one the environment is unchanged", () => {
    expect(
      withTexBin(
        { PATH: "/usr/bin", HOME: "/h" },
        { bin: "/cache/2026/bin/x" },
      ),
    ).toEqual({ PATH: "/cache/2026/bin/x:/usr/bin", HOME: "/h" });
    expect(withTexBin({ PATH: "/usr/bin" }, null)).toEqual({
      PATH: "/usr/bin",
    });
    expect(withTexBin({}, { bin: "/b" })).toEqual({ PATH: "/b:" });
  });
});

describe("latexdiff's removed text", () => {
  it("reads nested groups, skips bare commands, keeps the order", () => {
    expect(
      removed(
        "\\DIFdel{A {nested} one.} x \\DIFdel{\\DIFdelend} \\DIFdel{  B\n two. }",
      ),
    ).toEqual(["A nested one.", "B two."]);
  });

  it("🔴 a deleted caption (\\DIFdelFL) is listed too", () => {
    expect(removed("\\DIFdelFL{A deleted caption.} \\DIFdel{Prose.}")).toEqual([
      "A deleted caption.",
      "Prose.",
    ]);
  });

  it("a diff of many deletions is read in linear time, one group at a time", () => {
    const many = Array.from(
      { length: 20000 },
      (_, i) => `\\DIFdel{d${String(i)}}`,
    ).join(" ");
    expect(removed(many)).toHaveLength(20000);
  }, 30000);

  it("🔴 an escaped brace inside a group is text, not a delimiter", () => {
    expect(
      removed("\\DIFdel{The opening symbol \\{ is used.} \\DIFdel{Next.}"),
    ).toEqual(["The opening symbol \\{ is used.", "Next."]);
    expect(removed("\\DIFdel{a \\} b \\\\} \\DIFdel{c}")).toEqual([
      "a \\} b \\\\",
      "c",
    ]);
  });
});
