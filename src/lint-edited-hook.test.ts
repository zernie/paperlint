/**
 * The `lint-edited` hook (`src/lint-edited-hook.ts`): a PostToolUse payload in, Claude Code's
 * `{"decision":"block"}` out when the edit introduced an error. Both halves, over in-memory files and
 * a linter that answers from a table, so each case names exactly the findings the engine returns:
 * it blocks on an error on the lines the edit wrote (no snapshot yet), on an error the snapshot did not
 * hold (with one), on every line of a Write; it stays quiet on an error the edit did not touch, on a
 * finding that only moved, on warnings, on a file paperlint does not lint and outside every paper; and
 * whatever throws, it says so in one stderr line and exits 0. The real engine on a real paper is in
 * `src/cli.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, type MemoryFiles } from "./adapters/memory/index.ts";
import { absolutePath } from "./domain/paths.ts";
import {
  SNAPSHOT_FILE,
  lintEdited,
  lintEditedHook,
  type LintMessage,
  type LintResult,
  type PaperLinter,
} from "./lint-edited-hook.ts";

const DIR = "/work/papers/p";
const MAIN = `${DIR}/paper.tex`;
const FIG = `${DIR}/figures/fig.tex`;
const SNAPSHOT = `${DIR}/${SNAPSHOT_FILE}`;
const PAPER = { [`${DIR}/PIPELINE-STATUS.md`]: "# status\n" };

/** An error (or, with severity 1, a warning) at `line`. */
const finding = (
  line: number,
  ruleId: string | null = "tex/max-sentence-words",
  severity = 2,
  message = "a sentence of 64 words",
): LintMessage => ({
  ruleId,
  severity,
  message,
  line,
  column: 1,
  endLine: line,
});

/**
 * A linter whose findings per file are `table[file]`, recording what it was asked. `linted` is the
 * set of files paperlint lints; the formatter prints `file:line rule message` per finding.
 */
function linterOf(
  table: Readonly<Record<string, readonly LintMessage[]>>,
  linted: readonly string[] = [MAIN, FIG],
) {
  const asked: string[][] = [];
  const linter: PaperLinter = {
    isLinted: (f) => Promise.resolve(linted.includes(f)),
    lint: (fs) => {
      asked.push([...fs]);
      return Promise.resolve(
        fs.map((filePath) => ({ filePath, messages: table[filePath] ?? [] })),
      );
    },
    format: (rs: readonly LintResult[]) =>
      Promise.resolve(
        rs
          .flatMap((r) =>
            r.messages.map(
              (m) =>
                `${r.filePath}:${String(m.line)} ${String(m.ruleId)} ${m.message}`,
            ),
          )
          .join("\n"),
      ),
  };
  return { linter, asked };
}

const edit = (file: string, newString: string) => ({
  tool_name: "Edit",
  tool_input: { file_path: file, old_string: "x", new_string: newString },
});

const run = (
  payload: unknown,
  files: MemoryFiles,
  table: Readonly<Record<string, readonly LintMessage[]>>,
  linted?: readonly string[],
) => {
  const { linter, asked } = linterOf(table, linted);
  return {
    asked,
    said: lintEdited(payload, {
      files,
      linter: (dir) => {
        expect(dir).toBe(DIR);
        return Promise.resolve(linter);
      },
    }),
  };
};

const snapshotOf = (files: MemoryFiles): unknown =>
  JSON.parse(
    new TextDecoder().decode(
      files.readBytes(absolutePath(SNAPSHOT)) ?? new Uint8Array(),
    ),
  );

const KEPT =
  "paperlint lint-edited: the edit was kept; the errors above are the ones it introduced.";

describe("lint-edited — no snapshot yet: the lines the edit wrote", () => {
  it("🔴 an error on a line the Edit's new_string wrote: a block naming it, and the snapshot written", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "\\begin{document}\nA long sentence.\n\\end{document}\n",
    });
    const { said, asked } = run(edit(MAIN, "A long sentence."), files, {
      [MAIN]: [finding(2)],
    });
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:2 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
    // Guards: the edited file and paper.tex, once each, in one run.
    expect(asked).toEqual([[MAIN]]);
    expect(snapshotOf(files)).toEqual({
      files: {
        "paper.tex": [
          {
            rule: "tex/max-sentence-words",
            message: "a sentence of 64 words",
            text: "A long sentence.",
          },
        ],
      },
    });
  });

  it("an error the edit did not touch is not repeated", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "Old long sentence.\nA new short one.\n",
    });
    const { said } = run(edit(MAIN, "A new short one."), files, {
      [MAIN]: [finding(1)],
    });
    expect(await said).toBeNull();
    // Guards: the untouched error goes into the snapshot, so the next edit does not report it either.
    expect(snapshotOf(files)).toEqual({
      files: {
        "paper.tex": [
          {
            rule: "tex/max-sentence-words",
            message: "a sentence of 64 words",
            text: "Old long sentence.",
          },
        ],
      },
    });
  });
});

describe("lint-edited — no snapshot yet: Write and MultiEdit", () => {
  it("a Write touched every line; a MultiEdit, the lines of each new_string", async () => {
    const text = "one\ntwo\nthree\nfour\n";
    const write = run(
      { tool_name: "Write", tool_input: { file_path: MAIN, content: text } },
      memoryFiles({ ...PAPER, [MAIN]: text }),
      { [MAIN]: [finding(1), finding(4)] },
    );
    expect(await write.said).toEqual({
      decision: "block",
      reason: `${MAIN}:1 tex/max-sentence-words a sentence of 64 words\n${MAIN}:4 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
    const multi = run(
      {
        tool_name: "MultiEdit",
        tool_input: {
          file_path: MAIN,
          edits: [
            { old_string: "a", new_string: "two" },
            { old_string: "b", new_string: "" },
            { old_string: "c", new_string: "four" },
          ],
        },
      },
      memoryFiles({ ...PAPER, [MAIN]: text }),
      { [MAIN]: [finding(1), finding(2), finding(3), finding(4)] },
    );
    expect(await multi.said).toEqual({
      decision: "block",
      reason: `${MAIN}:2 tex/max-sentence-words a sentence of 64 words\n${MAIN}:4 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
  });

  it("a finding spanning lines counts when any of its lines was written", async () => {
    const files = memoryFiles({ ...PAPER, [MAIN]: "a\nb\nc\n" });
    const long = { ...finding(1), endLine: 3 };
    const { said } = run(edit(MAIN, "c"), files, { [MAIN]: [long] });
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:1 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
  });
});

/** An Edit as Claude Code 2.1.319 reports it: the `structuredPatch` of its `tool_response` (measured). */
const patched = (
  file: string,
  newString: string,
  structuredPatch: unknown,
  replaceAll = false,
) => ({
  tool_name: "Edit",
  tool_input: {
    file_path: file,
    old_string: "x",
    new_string: newString,
    replace_all: replaceAll,
  },
  tool_response: { filePath: file, structuredPatch },
});

const BLOCK_LINE = (line: number) => ({
  decision: "block",
  reason: `${MAIN}:${String(line)} tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
});

describe("lint-edited — no snapshot yet: a new_string that stands on several lines", () => {
  const text = "a & b\nc & d\ne & f\n";

  it("🔴 with the payload's structuredPatch: the old error on a line holding the same text is not reported, the edited line's is", async () => {
    const hunk = [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [" a & b", "-c and d", "+c & d", " e & f"],
      },
    ];
    const { said } = run(
      patched(MAIN, "&", hunk),
      memoryFiles({ ...PAPER, [MAIN]: text }),
      {
        [MAIN]: [finding(1), finding(2), finding(3)],
      },
    );
    expect(await said).toEqual(BLOCK_LINE(2));
  });

  it("🔴 without a structuredPatch: a new_string standing on three lines places none, so nothing is reported", async () => {
    const files = memoryFiles({ ...PAPER, [MAIN]: text });
    const { said } = run(edit(MAIN, "&"), files, {
      [MAIN]: [finding(1), finding(2), finding(3)],
    });
    expect(await said).toBeNull();
    // Guards: the snapshot is written anyway, so the next edit is judged exactly.
    expect(snapshotOf(files)).toMatchObject({
      files: { "paper.tex": [{}, {}, {}] },
    });
  });

  it("without a structuredPatch, a new_string standing once is placed", async () => {
    const { said } = run(
      edit(MAIN, "c & d"),
      memoryFiles({ ...PAPER, [MAIN]: text }),
      { [MAIN]: [finding(1), finding(2)] },
    );
    expect(await said).toEqual(BLOCK_LINE(2));
  });
});

describe("lint-edited — no snapshot yet: the shapes of structuredPatch", () => {
  const text = "a\nb\nc\nd\ne\n";

  it("a replace_all: the added lines of every hunk, and a second hunk counts from its own newStart", async () => {
    const hunks = [
      { newStart: 1, lines: ["-x", "+a", " b"] },
      { newStart: 4, lines: [" d", "-x", "+e"] },
    ];
    const { said } = run(
      patched(MAIN, "x", hunks, true),
      memoryFiles({ ...PAPER, [MAIN]: text }),
      {
        [MAIN]: [finding(1), finding(2), finding(3), finding(4), finding(5)],
      },
    );
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:1 tex/max-sentence-words a sentence of 64 words\n${MAIN}:5 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
  });

  it("a multi-line new_string: every added line, not the context around it", async () => {
    const hunk = [{ newStart: 1, lines: [" a", "-x", "+b", "+c", " d"] }];
    const { said } = run(
      patched(MAIN, "b\nc", hunk),
      memoryFiles({ ...PAPER, [MAIN]: text }),
      {
        [MAIN]: [finding(1), finding(3), finding(4)],
      },
    );
    expect(await said).toEqual(BLOCK_LINE(3));
  });

  it("a deletion: no line was written, so an old error stays quiet", async () => {
    const hunk = [{ newStart: 1, lines: [" a", "-x", " b"] }];
    const { said } = run(
      patched(MAIN, "", hunk),
      memoryFiles({ ...PAPER, [MAIN]: text }),
      {
        [MAIN]: [finding(1), finding(2)],
      },
    );
    expect(await said).toBeNull();
  });

  it("a structuredPatch that is not well formed falls back to the search", async () => {
    const files = () => memoryFiles({ ...PAPER, [MAIN]: text });
    const table = { [MAIN]: [finding(2)] };
    for (const bad of [
      "x",
      [{ newStart: "1", lines: [] }],
      [{ lines: [] }],
      null,
    ]) {
      const { said } = run(patched(MAIN, "b", bad), files(), table);
      expect(await said).toEqual(BLOCK_LINE(2));
    }
  });
});

const snapshot = (files: Record<string, readonly object[]>) =>
  JSON.stringify({ files });
const ERROR = {
  rule: "tex/max-sentence-words",
  message: "a sentence of 64 words",
  text: "Old long sentence.",
};

describe("lint-edited — against the snapshot", () => {
  it("🔴 an edit to a body figure that breaks a rule judged on paper.tex: a block, though paper.tex was not touched", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "\\input{figures/fig}\n",
      [FIG]: "\\caption{x}\n",
      [SNAPSHOT]: snapshot({ "paper.tex": [], "figures/fig.tex": [] }),
    });
    const judged = finding(
      1,
      "tex/caption-period",
      2,
      "figures/fig.tex:1:1: …",
    );
    const { said, asked } = run(edit(FIG, "\\caption{x}"), files, {
      [MAIN]: [judged],
    });
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:1 tex/caption-period figures/fig.tex:1:1: …\n${KEPT}`,
    });
    expect(asked).toEqual([[FIG, MAIN]]);
  });

  it("an existing error that only moved down a line is not new", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "Inserted line.\nOld long sentence.\n",
      [SNAPSHOT]: snapshot({ "paper.tex": [ERROR] }),
    });
    const { said } = run(edit(MAIN, "Inserted line."), files, {
      [MAIN]: [finding(2)],
    });
    expect(await said).toBeNull();
  });
});

describe("lint-edited — against the snapshot: counting", () => {
  it("the same error twice where the snapshot held it once: the second is new", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "Old long sentence.\nOld long sentence.\n",
      [SNAPSHOT]: snapshot({ "paper.tex": [ERROR] }),
    });
    const { said } = run(edit(MAIN, "Old long sentence."), files, {
      [MAIN]: [finding(1), finding(2)],
    });
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:2 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
  });
});

describe("lint-edited — against the snapshot: files and findings", () => {
  it("a file the snapshot has not seen falls back to the lines the edit wrote; the rest of the snapshot is kept", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "Old long sentence.\n",
      [FIG]: "kept\nwritten\n",
      [SNAPSHOT]: snapshot({ "paper.tex": [ERROR], "other.tex": [ERROR] }),
    });
    const { said } = run(edit(FIG, "written"), files, {
      [MAIN]: [finding(1)],
      [FIG]: [finding(1), finding(2)],
    });
    expect(await said).toEqual({
      decision: "block",
      reason: `${FIG}:2 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
    const figError = (text: string) => ({ ...ERROR, text });
    expect(snapshotOf(files)).toEqual({
      files: {
        "paper.tex": [ERROR],
        "other.tex": [ERROR],
        "figures/fig.tex": [figError("kept"), figError("written")],
      },
    });
  });

  it("a snapshot that does not parse is no snapshot", async () => {
    const files = memoryFiles({
      ...PAPER,
      [MAIN]: "Old long sentence.\nnew\n",
      [SNAPSHOT]: "{ not json",
    });
    const { said } = run(edit(MAIN, "new"), files, { [MAIN]: [finding(1)] });
    expect(await said).toBeNull();
    expect(snapshotOf(files)).toEqual({ files: { "paper.tex": [ERROR] } });
  });

  it("warnings are never reported; a parse error (no rule) is", async () => {
    const files = memoryFiles({ ...PAPER, [MAIN]: "x\n" });
    const write = {
      tool_name: "Write",
      tool_input: { file_path: MAIN, content: "x\n" },
    };
    expect(
      await run(write, files, { [MAIN]: [finding(1, "pdf/measured", 1)] }).said,
    ).toBeNull();
    expect(
      await run(write, memoryFiles({ ...PAPER, [MAIN]: "x\n" }), {
        [MAIN]: [finding(1, null, 2, "Parsing error")],
      }).said,
    ).toEqual({
      decision: "block",
      reason: `${MAIN}:1 null Parsing error\n${KEPT}`,
    });
  });
});

describe("lint-edited — quiet", () => {
  it("a file paperlint does not lint: nothing linted, no snapshot", async () => {
    const notes = `${DIR}/research/notes.txt`;
    const files = memoryFiles({ ...PAPER, [MAIN]: "x\n", [notes]: "y\n" });
    const { said, asked } = run(edit(notes, "y"), files, {});
    expect(await said).toBeNull();
    expect(asked).toEqual([]);
    expect(files.isFile(absolutePath(SNAPSHOT))).toBe(false);
  });

  it("a paper with no paper.tex lints the edited file alone", async () => {
    const status = `${DIR}/PIPELINE-STATUS.md`;
    const files = memoryFiles(PAPER);
    const { said, asked } = run(edit(status, "# status"), files, {}, [status]);
    expect(await said).toBeNull();
    expect(asked).toEqual([[status]]);
  });

  it("outside every paper, or no path in the payload: the linter is never built", async () => {
    const files = memoryFiles(PAPER);
    const never = () => Promise.reject(new Error("built a linter"));
    expect(
      await lintEdited(edit("/work/README.md", "x"), { files, linter: never }),
    ).toBeNull();
    expect(await lintEdited({}, { files, linter: never })).toBeNull();
  });
});

const hook = async (stdin: () => string, linter: () => Promise<never>) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await lintEditedHook(
    stdin,
    { files: memoryFiles({ ...PAPER, [MAIN]: "x\n" }), linter },
    { out: (t) => out.push(t), err: (m) => err.push(m) },
  );
  return { code, out, err };
};
const payload = () => JSON.stringify(edit(MAIN, "x"));

describe("lint-edited — never in the way", () => {
  it("🔴 a dependency that throws: one stderr line, exit 0, no block", async () => {
    expect(
      await hook(payload, () =>
        Promise.reject(new Error("ESLint crashed\n    at deep.js:1")),
      ),
    ).toEqual({
      code: 0,
      out: [],
      err: ["paperlint: the lint-edited hook did not run: ESLint crashed"],
    });
  });
});

describe("lint-edited — never in the way: what it cannot read", () => {
  it("a payload that is not JSON, and a stdin that cannot be read", async () => {
    const never = () => Promise.reject(new Error("unreached"));
    const garbled = await hook(() => "{ not json", never);
    expect(garbled.code).toBe(0);
    expect(garbled.out).toEqual([]);
    expect(garbled.err).toHaveLength(1);
    expect(garbled.err[0]).toMatch(
      /^paperlint: the lint-edited hook did not run: .*JSON/,
    );
    expect(
      await hook(() => {
        throw new Error("EAGAIN");
      }, never),
    ).toEqual({
      code: 0,
      out: [],
      err: ["paperlint: the lint-edited hook did not run: EAGAIN"],
    });
  });
});

describe("lint-edited — never in the way: the block", () => {
  it("a block goes to stdout as one JSON line", async () => {
    const out: string[] = [];
    const { linter } = linterOf({ [MAIN]: [finding(1)] });
    const code = await lintEditedHook(
      () =>
        JSON.stringify({
          tool_name: "Write",
          tool_input: { file_path: MAIN, content: "x\n" },
        }),
      {
        files: memoryFiles({ ...PAPER, [MAIN]: "x\n" }),
        linter: () => Promise.resolve(linter),
      },
      { out: (t) => out.push(t), err: () => {} },
    );
    expect(code).toBe(0);
    expect(out).toEqual([
      `${JSON.stringify({
        decision: "block",
        reason: `${MAIN}:1 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
      })}\n`,
    ]);
  });
});

describe("lint-edited — shapes the engine or the payload may take", () => {
  it("a MultiEdit whose edits are not a list wrote no line; a finding with no endLine is its own line", async () => {
    const files = memoryFiles({ ...PAPER, [MAIN]: "a\nb\n" });
    const noEnd: LintMessage = {
      ruleId: "tex/max-sentence-words",
      severity: 2,
      message: "a sentence of 64 words",
      line: 2,
      column: 1,
    };
    const odd = run(
      { tool_name: "MultiEdit", tool_input: { file_path: MAIN, edits: "b" } },
      files,
      { [MAIN]: [noEnd] },
    );
    expect(await odd.said).toBeNull();
    const plain = run(
      edit(MAIN, "b"),
      memoryFiles({ ...PAPER, [MAIN]: "a\nb\n" }),
      {
        [MAIN]: [noEnd],
      },
    );
    expect(await plain.said).toEqual({
      decision: "block",
      reason: `${MAIN}:2 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
  });

  it("a finding past the file's last line, and an edited file gone from the disk, key on an empty line", async () => {
    // The engine read the file before it went: its text is gone, its finding is not.
    const files = memoryFiles(PAPER);
    const { said } = run(
      { tool_name: "Write", tool_input: { file_path: MAIN, content: "" } },
      files,
      { [MAIN]: [finding(9)] },
      [MAIN],
    );
    expect(await said).toEqual({
      decision: "block",
      reason: `${MAIN}:9 tex/max-sentence-words a sentence of 64 words\n${KEPT}`,
    });
    expect(snapshotOf(files)).toEqual({
      files: { "paper.tex": [{ ...ERROR, text: "" }] },
    });
  });
});
