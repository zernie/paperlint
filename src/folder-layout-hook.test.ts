/**
 * The `paper-folder-layout` hook (`src/folder-layout-hook.ts`): a PostToolUse payload in, the Claude
 * Code output out. Both halves: it fires on a file written at a paper folder's root that the layout
 * does not allow, or inside a root folder it does not allow; it is silent on an allowed file and on
 * any file outside a paper folder. Its text is the rule's, through the same function.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import {
  folderLayoutHook,
  paperFolderOf,
  writtenPath,
} from "./folder-layout-hook.ts";
import { folderLayoutRules } from "./folder-layout-rule.ts";

const DIR = "/work/papers/p";
const PAPER = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: "\\documentclass{article}\n",
  [`${DIR}/paperlint.json`]: "{}\n",
};

/** A Write of `file`, after it landed in `tree`. */
const written = (
  file: string,
  tree: Record<string, string> = {},
  tool = "Write",
) => {
  const files = memoryFiles({ ...PAPER, ...tree, [file]: "x" });
  return folderLayoutHook(
    {
      hook_event_name: "PostToolUse",
      tool_name: tool,
      tool_input: { file_path: file },
      cwd: "/work",
    },
    files,
  );
};

/** What the rule reports for the same tree, as message text. */
function ruleSays(tree: Record<string, string>): string[] {
  const files = memoryFiles({ ...PAPER, ...tree });
  const rule = folderLayoutRules({ files, listDir: memoryListDir(files) })[
    "folder-layout"
  ];
  const out: string[] = [];
  rule
    .create({
      filename: `${DIR}/PIPELINE-STATUS.md`,
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => out.push(String(d.data["text"])),
    })
    .root?.();
  return out;
}

describe("paper-folder-layout hook — fires", () => {
  it("on a stray PLAN.md: additionalContext on PostToolUse, the rule's text exactly", () => {
    const out = written(`${DIR}/PLAN.md`);
    expect(out).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: ruleSays({ [`${DIR}/PLAN.md`]: "x" })[0],
      },
    });
    expect(out?.hookSpecificOutput.additionalContext).toMatch(
      /^`PLAN\.md` is at the root of a paper folder/,
    );
  });

  it("on a file inside a root folder that is not allowed, naming the folder", () => {
    expect(
      written(`${DIR}/archive/2026/old.pdf`)?.hookSpecificOutput
        .additionalContext,
    ).toBe(ruleSays({ [`${DIR}/archive/2026/old.pdf`]: "x" })[0]);
  });

  it("on an Edit and a MultiEdit too, and on a path relative to the session's cwd", () => {
    expect(written(`${DIR}/NOTES-2.md`, {}, "Edit")).not.toBeNull();
    expect(written(`${DIR}/NOTES-2.md`, {}, "MultiEdit")).not.toBeNull();
    const files = memoryFiles({ ...PAPER, [`${DIR}/x.py`]: "x" });
    expect(
      folderLayoutHook(
        { tool_input: { file_path: "papers/p/x.py" }, cwd: "/work" },
        files,
      ),
    ).not.toBeNull();
  });
});

describe("paper-folder-layout hook — silent", () => {
  it("on an allowed file and inside an allowed folder", () => {
    expect(written(`${DIR}/NOTES.md`)).toBeNull();
    expect(written(`${DIR}/reviews/2026-10-12-x.md`)).toBeNull();
    expect(written(`${DIR}/extra/anything.bin`)).toBeNull();
  });

  it("on a file outside every paper folder", () => {
    expect(written("/work/README.md")).toBeNull();
    expect(written("/work/papers/notes.md")).toBeNull();
    expect(written("/elsewhere/PLAN.md")).toBeNull();
  });

  it("on a payload with no path it can read", () => {
    const files = memoryFiles(PAPER);
    expect(folderLayoutHook({}, files)).toBeNull();
    expect(
      folderLayoutHook({ tool_input: { file_path: 7 } }, files),
    ).toBeNull();
    expect(folderLayoutHook(null, files)).toBeNull();
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
  });
});
