/** `nodeGlobFiles`: the files a glob matches under a folder; null for a folder that is not one; other errors thrown. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeGlobFiles } from "./glob-files.io.ts";

const root = useTempDir("paperlint-glob-files-");

describe("nodeGlobFiles", () => {
  it("lists the files a glob matches, relative and sorted; folders are not files", () => {
    mkdirSync(join(root, "a", "prompts", "deep"), { recursive: true });
    writeFileSync(join(root, "a", "README.md"), "");
    writeFileSync(join(root, "a", "prompts", "b.md"), "");
    writeFileSync(join(root, "a", "prompts", "deep", "c.md"), "");
    const at = absolutePath(join(root, "a"));
    // Guards: `*` gives the top level's files without the folder `prompts`; `**` descends.
    expect(nodeGlobFiles(at, "*")).toEqual(["README.md"]);
    expect(nodeGlobFiles(at, "**/*.md")).toEqual([
      "README.md",
      "prompts/b.md",
      "prompts/deep/c.md",
    ]);
    expect(nodeGlobFiles(at, "**/*.json")).toEqual([]);
  });

  it("is null for a folder that does not exist", () => {
    expect(nodeGlobFiles(absolutePath(join(root, "none")), "*")).toBeNull();
  });

  it("is null for a path that is a file, or that goes through one", () => {
    writeFileSync(join(root, "f"), "");
    expect(nodeGlobFiles(absolutePath(join(root, "f")), "*")).toBeNull();
    expect(nodeGlobFiles(absolutePath(join(root, "f", "x")), "*")).toBeNull();
  });

  it("throws any other error", () => {
    expect(() => nodeGlobFiles(absolutePath(`${root}/a\0b`), "*")).toThrow();
  });
});
