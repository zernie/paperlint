/** `nodeListTree`: every file under a folder; null for a folder that is not one; other errors thrown. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeListTree } from "./list-tree.io.ts";

const root = useTempDir("paperlint-list-tree-");

describe("nodeListTree", () => {
  it("lists every file at any depth, relative and sorted; folders are not files", () => {
    mkdirSync(join(root, "a", "prompts", "deep"), { recursive: true });
    mkdirSync(join(root, "a", "empty"));
    writeFileSync(join(root, "a", "README.md"), "");
    writeFileSync(join(root, "a", ".env"), "");
    writeFileSync(join(root, "a", "prompts", "b.md"), "");
    writeFileSync(join(root, "a", "prompts", "deep", "c.md"), "");
    expect(nodeListTree(absolutePath(join(root, "a")))).toEqual([
      ".env",
      "README.md",
      "prompts/b.md",
      "prompts/deep/c.md",
    ]);
  });

  it("is empty for a folder that holds nothing", () => {
    mkdirSync(join(root, "bare"));
    expect(nodeListTree(absolutePath(join(root, "bare")))).toEqual([]);
  });

  it("is null for a folder that does not exist", () => {
    expect(nodeListTree(absolutePath(join(root, "none")))).toBeNull();
  });

  it("is null for a path that is a file, or that goes through one", () => {
    writeFileSync(join(root, "f"), "");
    expect(nodeListTree(absolutePath(join(root, "f")))).toBeNull();
    expect(nodeListTree(absolutePath(join(root, "f", "x")))).toBeNull();
  });

  it("throws any other error", () => {
    expect(() => nodeListTree(absolutePath(`${root}/a\0b`))).toThrow();
  });
});
