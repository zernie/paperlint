/** `nodeMoveFile`: the file arrives with its bytes, into a folder made for it, and is gone from where it was. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeMoveFile } from "./move-file.io.ts";

const root = useTempDir("paperlint-move-file-");

describe("nodeMoveFile", () => {
  it("moves a file into a folder that does not exist yet", () => {
    writeFileSync(join(root, "a.pdf"), "bytes");
    nodeMoveFile(
      absolutePath(join(root, "a.pdf")),
      absolutePath(join(root, "x", "y", "b.pdf")),
    );
    expect(existsSync(join(root, "a.pdf"))).toBe(false);
    expect(readFileSync(join(root, "x", "y", "b.pdf"), "utf8")).toBe("bytes");
  });

  it("throws when there is nothing to move", () => {
    expect(() => {
      nodeMoveFile(
        absolutePath(join(root, "none")),
        absolutePath(join(root, "z")),
      );
    }).toThrow();
  });
});
