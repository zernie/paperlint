/** `GlobFiles` over `node:fs`: `fs.globSync` under a folder, its regular files only. */
import { globSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { GlobFiles } from "../../ports/glob-files.ts";
import { codeOf } from "../../domain/text.ts";

/** Whether `dir` is a directory; a path that is absent or runs through a file is not. */
function isDir(dir: AbsolutePath): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch (e) {
    const code = codeOf(e);
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw e;
  }
}

export const nodeGlobFiles: GlobFiles = (dir, pattern) =>
  isDir(dir)
    ? globSync(pattern, { cwd: dir, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(dir, join(d.parentPath, d.name)))
        .toSorted()
    : null;
