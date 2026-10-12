/**
 * The `paper-folder-layout` hook (`src/folder-layout-hook.ts`): a PreToolUse payload in, Claude Code's
 * refusal out. Both halves: it denies creating a new entry the layout does not allow — at a paper
 * folder's root or at the top of its `repro/`, and a study folder whose first file is not its
 * README.md — with the rule's own text; it allows every existing file, every new file inside an
 * existing entry, every allowed new entry, and anything outside a paper folder.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import {
  folderLayoutHook,
  paperFolderOf,
  writtenPath,
} from "./folder-layout-hook.ts";
import { folderLayoutRules } from "./folder-layout-rule.ts";
import { reproLayoutRules } from "./repro-layout-rule.ts";

const DIR = "/work/papers/p";
const PAPER = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: "\\documentclass{article}\n",
  [`${DIR}/paperlint.json`]: "{}\n",
};

/** A Write of `file`, which does not exist unless `tree` holds it, into the paper. */
const writing = (
  file: string,
  tree: Record<string, string> = {},
  tool = "Write",
) => {
  const files = memoryFiles({ ...PAPER, ...tree });
  return folderLayoutHook(
    {
      hook_event_name: "PreToolUse",
      tool_name: tool,
      tool_input: { file_path: file },
      cwd: "/work",
    },
    { files, listDir: memoryListDir(files) },
  );
};

/** The reason a refusal gives, or null when the write is allowed. */
const reason = (
  file: string,
  tree: Record<string, string> = {},
  tool = "Write",
): string | null =>
  writing(file, tree, tool)?.hookSpecificOutput.permissionDecisionReason ??
  null;

/** What both rules report once `tree` is on disk, as message text. */
function ruleSays(tree: Record<string, string>): string[] {
  const files = memoryFiles({ ...PAPER, ...tree });
  const deps = { files, listDir: memoryListDir(files) };
  const out: string[] = [];
  const report = (d: { readonly data: Record<string, unknown> }) =>
    out.push(String(d.data["text"]));
  const at = { getLocFromIndex: () => ({ line: 1, column: 0 }) };
  const filename = `${DIR}/PIPELINE-STATUS.md`;
  folderLayoutRules(deps)
    ["folder-layout"].create({ filename, sourceCode: at, report })
    .root?.();
  reproLayoutRules(deps)
    ["repro-layout"].create({ filename, sourceCode: at, report })
    .root?.();
  return out;
}

describe("paper-folder-layout hook — denies a new stray entry", () => {
  it("a new PLAN.md at the root: a PreToolUse deny, the rule's text exactly", () => {
    const out = writing(`${DIR}/PLAN.md`);
    expect(out).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ruleSays({ [`${DIR}/PLAN.md`]: "x" })[0],
      },
    });
    expect(out?.hookSpecificOutput.permissionDecisionReason).toMatch(
      /^`PLAN\.md` is at the root of a paper folder.*\n<paper>\/\n/su,
    );
  });

  it("a file that would create a root folder the layout does not allow, naming the folder", () => {
    expect(reason(`${DIR}/archive/2026/old.pdf`)).toBe(
      ruleSays({ [`${DIR}/archive/2026/old.pdf`]: "x" })[0],
    );
  });

  it("a loose script at the top of repro/, and an undated folder there", () => {
    expect(reason(`${DIR}/repro/run.py`)).toBe(
      ruleSays({ [`${DIR}/repro/run.py`]: "x" })[0],
    );
    expect(reason(`${DIR}/repro/run.py`)).toMatch(
      /Where it goes: repro\/tools\//,
    );
    expect(
      reason(`${DIR}/repro/baseline/run.py`, {
        [`${DIR}/repro/README.md`]: "x",
      }),
    ).toMatch(/^`repro\/baseline\/` is loose at the top/);
  });

  it("a new study folder whose first file is not its README.md", () => {
    expect(reason(`${DIR}/repro/ablation-2026-10-12/run.py`)).toMatch(
      /^`repro\/ablation-2026-10-12\/` is a study folder without a README\.md/,
    );
  });

  it("through an Edit and a MultiEdit too, and a path relative to the session's cwd", () => {
    expect(reason(`${DIR}/NOTES-2.md`, {}, "Edit")).not.toBeNull();
    expect(reason(`${DIR}/NOTES-2.md`, {}, "MultiEdit")).not.toBeNull();
    const files = memoryFiles(PAPER);
    expect(
      folderLayoutHook(
        { tool_input: { file_path: "papers/p/x.py" }, cwd: "/work" },
        { files, listDir: memoryListDir(files) },
      ),
    ).not.toBeNull();
  });
});

describe("paper-folder-layout hook — allows", () => {
  it("🔴 any file that already exists, even one out of place: editing is never blocked", () => {
    expect(reason(`${DIR}/PLAN.md`, { [`${DIR}/PLAN.md`]: "x" })).toBeNull();
    expect(
      reason(`${DIR}/repro/run.py`, { [`${DIR}/repro/run.py`]: "x" }),
    ).toBeNull();
  });

  it("a new file inside an entry that already exists, even a stray one — the rule reports the entry", () => {
    expect(
      reason(`${DIR}/archive/new.pdf`, { [`${DIR}/archive/old.pdf`]: "x" }),
    ).toBeNull();
    expect(
      reason(`${DIR}/repro/baseline/new.py`, {
        [`${DIR}/repro/baseline/old.py`]: "x",
      }),
    ).toBeNull();
  });

  it("a new allowed entry: at the root, in an allowed folder, and in repro/'s layout", () => {
    expect(reason(`${DIR}/NOTES.md`)).toBeNull();
    expect(reason(`${DIR}/reviews/2026-10-12-x.md`)).toBeNull();
    expect(reason(`${DIR}/extra/anything.bin`)).toBeNull();
    expect(reason(`${DIR}/repro/README.md`)).toBeNull();
    expect(reason(`${DIR}/repro/tools/paper_numbers.py`)).toBeNull();
    expect(reason(`${DIR}/repro/data/numbers.tsv`)).toBeNull();
  });

  it("a new study folder started with its README.md, then any file in it", () => {
    expect(reason(`${DIR}/repro/ablation-2026-10-12/README.md`)).toBeNull();
    expect(
      reason(`${DIR}/repro/ablation-2026-10-12/run.py`, {
        [`${DIR}/repro/ablation-2026-10-12/README.md`]: "x",
      }),
    ).toBeNull();
  });

  it("a file outside every paper folder", () => {
    expect(reason("/work/README.md")).toBeNull();
    expect(reason("/work/papers/notes.md")).toBeNull();
    expect(reason("/elsewhere/PLAN.md")).toBeNull();
  });

  it("a payload with no path it can read", () => {
    const files = memoryFiles(PAPER);
    const deps = { files, listDir: memoryListDir(files) };
    expect(folderLayoutHook({}, deps)).toBeNull();
    expect(folderLayoutHook({ tool_input: { file_path: 7 } }, deps)).toBeNull();
    expect(folderLayoutHook(null, deps)).toBeNull();
  });
});

describe("the cheap first step: the nearest folder holding PIPELINE-STATUS.md", () => {
  const files = memoryFiles(PAPER);

  it("is the paper folder for a file at its root or anywhere below", () => {
    expect(paperFolderOf(`${DIR}/x.md`, files)).toBe(DIR);
    expect(paperFolderOf(`${DIR}/a/b/c.md`, files)).toBe(DIR);
  });

  it("is null outside a paper folder, up to the file system's root", () => {
    expect(paperFolderOf("/work/papers/x.md", files)).toBeNull();
    expect(paperFolderOf("/x.md", files)).toBeNull();
  });

  it("reads the path from file_path, or notebook_path, made absolute against cwd", () => {
    expect(writtenPath({ tool_input: { file_path: "/a/b.md" } })).toBe(
      "/a/b.md",
    );
    expect(
      writtenPath({ tool_input: { notebook_path: "n.ipynb" }, cwd: "/w" }),
    ).toBe("/w/n.ipynb");
    expect(writtenPath({ tool_input: {} })).toBeNull();
    // A relative path needs an absolute cwd to mean anything: never the process's own.
    expect(writtenPath({ tool_input: { file_path: "a.md" } })).toBeNull();
    expect(
      writtenPath({ tool_input: { file_path: "a.md" }, cwd: "w" }),
    ).toBeNull();
  });
});
