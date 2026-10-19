/**
 * `nodeListEntries`: a directory's entries with their kinds, a symbolic link reported as one and never
 * followed; none for a missing directory or a file; other errors thrown.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { nodeListEntries } from "./list-entries.io.ts";

const root = useTempDir("paperlint-list-entries-");

const sorted = (dir: string) =>
  [...nodeListEntries(absolutePath(dir))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

describe("nodeListEntries", () => {
  it("names each entry's kind, a link to a directory as a link", () => {
    const d = join(root, "study");
    mkdirSync(join(d, "out"), { recursive: true });
    writeFileSync(join(d, "a.md"), "");
    symlinkSync(".", join(d, "loop"));
    expect(sorted(d)).toEqual([
      { name: "a.md", kind: "file" },
      { name: "loop", kind: "symlink" },
      { name: "out", kind: "dir" },
    ]);
  });

  // A FIFO needs `mkfifo`, which Windows does not have; the reason is said, not hidden.
  it.skipIf(process.platform === "win32")(
    "names a FIFO as neither a file nor a directory: other",
    () => {
      const d = join(root, "fifo");
      mkdirSync(d, { recursive: true });
      const made = spawnSync("mkfifo", [join(d, "pipe")]);
      expect(made.status).toBe(0);
      writeFileSync(join(d, "a.md"), "");
      // Guards: it was reported as a file, so a reader would open it and block.
      expect(sorted(d)).toEqual([
        { name: "a.md", kind: "file" },
        { name: "pipe", kind: "other" },
      ]);
    },
  );

  it("is empty for a directory that does not exist, and for a file", () => {
    writeFileSync(join(root, "f"), "");
    expect([
      nodeListEntries(absolutePath(join(root, "none"))),
      nodeListEntries(absolutePath(join(root, "f"))),
    ]).toEqual([[], []]);
  });

  it("throws any other error", () => {
    expect(() => nodeListEntries(absolutePath(`${root}/a\0b`))).toThrow();
  });
});
