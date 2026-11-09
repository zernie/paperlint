/**
 * `src/domain/paper-folder.ts` — the first question of both file hooks, and the only one the bin asks
 * before it loads the CLI: which paper folder does the edited file belong to? Both halves: a file in a
 * paper folder runs the hook with the stdin already read; a file outside every paper folder, under
 * `extra/`, or a payload with no path is quiet; anything but a file hook is left to the CLI.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "../adapters/memory/index.ts";
import {
  FILE_HOOKS,
  fileHookGate,
  paperFolderOf,
  writtenPath,
} from "./paper-folder.ts";

const DIR = "/work/papers/p";
const files = memoryFiles({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/extra/old/PIPELINE-STATUS.md`]: "# old\n",
});
const payload = (file: string): string =>
  JSON.stringify({ tool_input: { file_path: file }, cwd: "/work" });

describe("the cheap first step: the nearest folder holding PIPELINE-STATUS.md", () => {
  it("is the paper folder for a file at its root or anywhere below", () => {
    expect(paperFolderOf(`${DIR}/x.md`, files)).toBe(DIR);
    expect(paperFolderOf(`${DIR}/a/b/c.md`, files)).toBe(DIR);
  });

  it("is null outside a paper folder, up to the file system's root, and under extra/", () => {
    expect(paperFolderOf("/work/papers/x.md", files)).toBeNull();
    expect(paperFolderOf("/x.md", files)).toBeNull();
    // Guards: an archived paper under extra/ carries its own status file and is not a paper.
    expect(paperFolderOf(`${DIR}/extra/old/notes.txt`, files)).toBeNull();
  });

  it("reads the path from file_path, or notebook_path, made absolute against cwd", () => {
    expect(writtenPath({ tool_input: { file_path: "/a/b.md" } })).toBe(
      "/a/b.md",
    );
    expect(
      writtenPath({ tool_input: { notebook_path: "n.ipynb" }, cwd: "/w" }),
    ).toBe("/w/n.ipynb");
    expect(writtenPath({ tool_input: {} })).toBeNull();
    // Guards: a relative path needs an absolute cwd to mean anything — never the process's own.
    expect(writtenPath({ tool_input: { file_path: "a.md" } })).toBeNull();
    expect(
      writtenPath({ tool_input: { file_path: "a.md" }, cwd: "w" }),
    ).toBeNull();
  });
});

describe("fileHookGate — what the bin decides before it loads the CLI", () => {
  const reads: string[] = [];
  const stdin = (text: string) => () => {
    reads.push(text);
    return text;
  };

  it("names exactly the two hooks that look at an edited file", () => {
    expect(FILE_HOOKS).toEqual(["paper-folder-layout", "lint-edited"]);
  });

  it("anything but a file hook is the CLI's, and stdin is not touched", () => {
    reads.length = 0;
    expect(fileHookGate(["lint"], stdin("x"), files)).toEqual({
      kind: "other",
    });
    expect(
      fileHookGate(["hook", "paper-edit-guard"], stdin("x"), files),
    ).toEqual({ kind: "other" });
    expect(fileHookGate([], stdin("x"), files)).toEqual({ kind: "other" });
    // Guards: a Bash hook reads its own stdin later; reading it here would leave it nothing.
    expect(reads).toEqual([]);
  });

  it("a file outside every paper folder, or a payload naming no file: quiet", () => {
    for (const name of FILE_HOOKS) {
      expect(
        fileHookGate(["hook", name], stdin(payload("/work/README.md")), files),
      ).toEqual({ kind: "quiet" });
      expect(fileHookGate(["hook", name], stdin("{}"), files)).toEqual({
        kind: "quiet",
      });
    }
  });

  it("a file in a paper folder: the hook runs, handed the stdin already read, once", () => {
    reads.length = 0;
    const text = payload(`${DIR}/paper.tex`);
    const gate = fileHookGate(["hook", "lint-edited"], stdin(text), files);
    expect(gate.kind).toBe("hook");
    expect(gate.kind === "hook" && gate.name).toBe("lint-edited");
    expect(gate.kind === "hook" && gate.stdin()).toBe(text);
    // Guards: stdin is a stream — read once by the gate, never again by the hook.
    expect(reads).toEqual([text]);
  });

  it("a payload that is not JSON, or a stdin that cannot be read: the hook runs and says why", () => {
    const garbled = fileHookGate(
      ["hook", "lint-edited"],
      stdin("{ not json"),
      files,
    );
    expect(garbled.kind === "hook" && garbled.stdin()).toBe("{ not json");
    const unreadable = fileHookGate(
      ["hook", "paper-folder-layout"],
      () => {
        throw new Error("EAGAIN");
      },
      files,
    );
    expect(unreadable.kind).toBe("hook");
    expect(() => unreadable.kind === "hook" && unreadable.stdin()).toThrow(
      "EAGAIN",
    );
  });
});
