/** `ListTree` over `node:fs`: a recursive `readdirSync` under a folder, its regular files only. */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { ListTree } from "../../ports/list-tree.ts";
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

export const nodeListTree: ListTree = (dir) =>
  isDir(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) =>
          relative(dir, join(d.parentPath, d.name)).split(sep).join("/"),
        )
        .toSorted()
    : null;
