/**
 * The `lint-edited` hook after a Bash command (`src/lint-edited-hook.ts`): the `.tex` files a command
 * names — as a word, or as the target of a redirection that writes — are linted the way an Edit's file
 * is, against the snapshot. Both halves, over in-memory files, a linter that answers from a table, and
 * vigiles' real shell parser: it blocks on an error the snapshot did not hold in a file a command named
 * (one paper or two); it stays quiet on a command that names no `.tex`, on a `.tex` outside every paper,
 * on a relative path with no `cwd`, and on a file the snapshot has not seen, whose written lines a
 * command does not say (the snapshot is written, so the next change is judged exactly). The last case
 * runs `paperlint hook lint-edited` in-process on a real paper with the real engine.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leafCommandsNormalized } from "vigiles/hook";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import { runHook } from "./cli.ts";
import { memoryFiles, type MemoryFiles } from "./adapters/memory/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { fileHookGate } from "./domain/paper-folder.ts";
import {
  SNAPSHOT_FILE,
  lintEdited,
  type LintMessage,
  type PaperLinter,
} from "./lint-edited-hook.ts";

const ROOT = "/work";
const P = `${ROOT}/papers/p`;
const Q = `${ROOT}/papers/q`;
const STATUS = "PIPELINE-STATUS.md";

const ERROR = {
  rule: "tex/max-sentence-words",
  message: "a sentence of 64 words",
};
const finding = (line: number): LintMessage => ({
  ruleId: ERROR.rule,
  severity: 2,
  message: ERROR.message,
  line,
  column: 1,
  endLine: line,
});
/** A snapshot that has seen `rels`, each with no error. */
const seen = (...rels: readonly string[]): string =>
  JSON.stringify({ files: Object.fromEntries(rels.map((r) => [r, []])) });

/** A Bash payload; `cwd: null` leaves the field out. */
const bash = (command: string, cwd: string | null = ROOT) => ({
  tool_name: "Bash",
  tool_input: { command },
  ...(cwd === null ? {} : { cwd }),
});

/** The hook over `files`, with a linter per paper whose findings per file are `table[file]`. */
function run(
  payload: unknown,
  files: MemoryFiles,
  table: Readonly<Record<string, readonly LintMessage[]>> = {},
) {
  const asked: string[][] = [];
  const linter = (): PaperLinter => ({
    isLinted: (f) => Promise.resolve(f.endsWith(".tex")),
    lint: (fs) => {
      asked.push([...fs]);
      return Promise.resolve(
        fs.map((filePath) => ({ filePath, messages: table[filePath] ?? [] })),
      );
    },
    format: (rs) =>
      Promise.resolve(
        rs
          .flatMap((r) =>
            r.messages.map(
              (m) => `${r.filePath}:${String(m.line)} ${m.message}`,
            ),
          )
          .join("\n"),
      ),
  });
  const said = lintEdited(payload, {
    files,
    linter: () => Promise.resolve(linter()),
    shellLeaves: leafCommandsNormalized,
  });
  return { said, asked, linter: () => Promise.resolve(linter()) };
}

const KEPT =
  "paperlint lint-edited: the edit was kept; the errors above are the ones it introduced.";

describe("lint-edited after Bash — blocks", () => {
  it("🔴 sed -i on a paper's .tex: the error the snapshot did not hold is reported", async () => {
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "A long sentence.\n",
      [`${P}/${SNAPSHOT_FILE}`]: seen("paper.tex"),
    });
    const { said, asked } = run(
      bash(`sed -i 's/a/b/' papers/p/paper.tex`),
      files,
      { [`${P}/paper.tex`]: [finding(1)] },
    );
    expect(await said).toEqual({
      decision: "block",
      reason: `${P}/paper.tex:1 ${ERROR.message}\n${KEPT}`,
    });
    expect(asked).toEqual([[`${P}/paper.tex`]]);
  });

  it("a redirection that writes a body file: that file and paper.tex are linted", async () => {
    const fig = `${P}/figures/fig.tex`;
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "x\n",
      [fig]: "y\n",
      [`${P}/${SNAPSHOT_FILE}`]: seen("paper.tex", "figures/fig.tex"),
    });
    const { said, asked } = run(
      bash(`printf 'y\\n' >> ${fig}`, "/elsewhere"),
      files,
      { [fig]: [finding(1)] },
    );
    expect(await said).toEqual({
      decision: "block",
      reason: `${fig}:1 ${ERROR.message}\n${KEPT}`,
    });
    expect(asked).toEqual([[fig, `${P}/paper.tex`]]);
  });

  it("one command over two papers: each paper is linted with its own snapshot, both reported", async () => {
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "x\n",
      [`${P}/${SNAPSHOT_FILE}`]: seen("paper.tex"),
      [`${Q}/${STATUS}`]: "# s\n",
      [`${Q}/paper.tex`]: "x\n",
      [`${Q}/${SNAPSHOT_FILE}`]: seen("paper.tex"),
    });
    const { said, asked } = run(
      bash(`perl -pi -e 's/a/b/' papers/p/paper.tex papers/q/paper.tex`),
      files,
      { [`${P}/paper.tex`]: [finding(1)], [`${Q}/paper.tex`]: [finding(1)] },
    );
    expect(await said).toEqual({
      decision: "block",
      reason: `${P}/paper.tex:1 ${ERROR.message}\n${Q}/paper.tex:1 ${ERROR.message}\n${KEPT}`,
    });
    expect(asked).toEqual([[`${P}/paper.tex`], [`${Q}/paper.tex`]]);
  });
});

describe("lint-edited after Bash — one paper failing", () => {
  it("🔴 a paper whose lint throws does not swallow another paper's block and is named; alone, it throws", async () => {
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "x\n",
      [`${P}/${SNAPSHOT_FILE}`]: seen("paper.tex"),
      [`${Q}/${STATUS}`]: "# s\n",
      [`${Q}/paper.tex`]: "x\n",
    });
    const healthy = run(bash("true"), files, {
      [`${P}/paper.tex`]: [finding(1)],
    });
    const deps = {
      files,
      linter: (dir: string) =>
        dir === Q
          ? Promise.reject(new Error("paperlint.json: bad JSON\nat line 2"))
          : healthy.linter(),
      shellLeaves: leafCommandsNormalized,
    };
    const both = bash("sed -i x papers/p/paper.tex papers/q/paper.tex");
    expect(await lintEdited(both, deps)).toEqual({
      decision: "block",
      reason: `${P}/paper.tex:1 ${ERROR.message}\npaperlint lint-edited: ${Q} was not linted: paperlint.json: bad JSON\n${KEPT}`,
    });
    // Every paper failing: the first failure is thrown, for the hook's one line on stderr.
    const onlyQ = bash("sed -i x papers/q/paper.tex");
    await expect(lintEdited(onlyQ, deps)).rejects.toThrow("bad JSON");
  });
});

describe("lint-edited after Bash — quiet", () => {
  it("a command that names no .tex, a .tex outside every paper, a relative path with no cwd: nothing linted", async () => {
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "x\n",
      [`${ROOT}/notes/draft.tex`]: "x\n",
    });
    for (const payload of [
      bash("ls papers/p"),
      bash("sed -i 's/a/b/' notes/draft.tex"),
      bash("sed -i 's/a/b/' papers/p/paper.tex", null),
      bash("sed -i 's/a/b/' papers/p/missing.tex"),
      bash("sed -i 's/a/b/' papers/p/paper.tex", "work"),
      bash("wc -l < papers/p/paper.tex"),
      bash('printf x > "$OUT.tex"'),
      { tool_name: "Bash", tool_input: {}, cwd: ROOT },
    ]) {
      const { said, asked } = run(payload, files, {
        [`${P}/paper.tex`]: [finding(1)],
      });
      expect(await said).toBeNull();
      expect(asked).toEqual([]);
    }
    expect(files.isFile(absolutePath(`${P}/${SNAPSHOT_FILE}`))).toBe(false);
  });

  it("🔴 a file the snapshot has not seen: a command does not say which lines it wrote, so nothing is reported, and the snapshot is written", async () => {
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "A long sentence.\n",
    });
    const { said } = run(bash(`sed -i 's/a/b/' papers/p/paper.tex`), files, {
      [`${P}/paper.tex`]: [finding(1)],
    });
    expect(await said).toBeNull();
    const text = new TextDecoder().decode(
      files.readBytes(absolutePath(`${P}/${SNAPSHOT_FILE}`)) ??
        new Uint8Array(),
    );
    expect(JSON.parse(text)).toEqual({
      files: { "paper.tex": [{ ...ERROR, text: "A long sentence." }] },
    });
  });
});

describe("lint-edited — a file gone by the time its text is read", () => {
  it("an Edit's file the linter still reports on but the disk no longer has: no line placed, nothing reported", async () => {
    const files = memoryFiles({ [`${P}/${STATUS}`]: "# s\n" });
    const edit = {
      tool_name: "Edit",
      tool_input: { file_path: `${P}/paper.tex`, new_string: "x" },
    };
    const { said } = run(edit, files, { [`${P}/paper.tex`]: [finding(1)] });
    expect(await said).toBeNull();
  });
});

describe("lint-edited — paper.tex linted beside a body file, with no snapshot yet", () => {
  it("an error in paper.tex, which the Edit did not write: not blamed on the edit", async () => {
    const fig = `${P}/figures/fig.tex`;
    const files = memoryFiles({
      [`${P}/${STATUS}`]: "# s\n",
      [`${P}/paper.tex`]: "Old long sentence.\n",
      [fig]: "x\n",
    });
    const edit = {
      tool_name: "Edit",
      tool_input: { file_path: fig, new_string: "x" },
    };
    const { said, asked } = run(edit, files, {
      [`${P}/paper.tex`]: [finding(1)],
    });
    expect(await said).toBeNull();
    expect(asked).toEqual([[fig, `${P}/paper.tex`]]);
  });
});

describe("lint-edited after Bash — the gate before the CLI loads", () => {
  it("🔴 a Bash payload goes to the hook: the `if` in the wiring already chose the command", () => {
    const files = { isFile: () => false };
    const stdin = () => JSON.stringify(bash("sed -i x papers/p/paper.tex"));
    expect(fileHookGate(["hook", "lint-edited"], stdin, files).kind).toBe(
      "hook",
    );
  });
});

const tmp = useTempDir("lint-edited-bash-");
const sentence = (n: number): string =>
  `${Array.from({ length: n - 1 }, () => "word").join(" ")} end.`;

/** `paperlint hook lint-edited` in-process on a Bash payload run in `cwd`. */
async function hookOn(command: string, cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runHook("lint-edited", {
    stdin: () =>
      JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }),
    out: (t) => {
      out.push(t);
    },
    err: (m: string) => {
      err.push(m);
    },
  });
  return { code, out: out.join(""), err };
}

describe("lint-edited after Bash — the real parser and engine", () => {
  it("🔴 the first command records the snapshot; a later one that added a long sentence is a block naming only it", async () => {
    const dir = writeTree(join(tmp, "real"), {
      "package.json": "{}\n",
      "papers/p/PIPELINE-STATUS.md": "# status\n",
      "papers/p/paperlint.json": JSON.stringify({
        extends: null,
        rules: { "tex/max-sentence-words": "error" },
      }),
      "papers/p/paper.tex": `\\documentclass{article}\n\\begin{document}\nShort one.\n\n${sentence(64)}\n\\end{document}\n`,
    });
    const tex = join(dir, "papers/p/paper.tex");
    // No snapshot yet, and a command says no line: the old 64-word sentence is recorded, not reported.
    expect(
      await hookOn("sed -i 's/Short/Brief/' papers/p/paper.tex", dir),
    ).toEqual({ code: 0, out: "", err: [] });
    const end = "\\end{document}";
    writeFileSync(
      tex,
      readFileSync(tex, "utf8").replace(end, `\n${sentence(70)}\n${end}`),
    );
    const long = await hookOn(`perl -pi -e 's/Brief/Short/' ${tex}`, dir);
    expect([long.code, long.err]).toEqual([0, []]);
    const { reason } = z
      .object({ decision: z.literal("block"), reason: z.string() })
      .strict()
      .parse(JSON.parse(long.out));
    // Guards: only the new sentence (line 7), not the old one on line 5 the snapshot holds.
    expect(reason).toMatch(/\n +7:1 +error +.+ +tex\/max-sentence-words\n/u);
    expect(reason).not.toMatch(/\n +5:1 /u);
  });
});
