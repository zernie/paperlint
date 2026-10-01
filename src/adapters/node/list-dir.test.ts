/** `nodeListDir`: a directory's names; none for a missing directory or a file; other errors thrown. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeListDir } from "./list-dir.io.ts";

const root = useTempDir("paperlint-list-dir-");

describe("nodeListDir", () => {
  it("lists a directory's names", () => {
    mkdirSync(join(root, "talk"));
    writeFileSync(join(root, "talk", "a.mp4"), "");
    expect(nodeListDir(absolutePath(join(root, "talk")))).toEqual(["a.mp4"]);
  });

  it("is empty for a directory that does not exist", () => {
    expect(nodeListDir(absolutePath(join(root, "none")))).toEqual([]);
  });

  it("is empty for a path that is a file", () => {
    writeFileSync(join(root, "f"), "");
    expect(nodeListDir(absolutePath(join(root, "f")))).toEqual([]);
  });

  it("throws any other error", () => {
    expect(() => nodeListDir(absolutePath(`${root}/a\0b`))).toThrow();
  });
});
