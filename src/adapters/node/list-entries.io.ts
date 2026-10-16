/** `ListEntries` over `node:fs`: `readdir` with its file types, which `lstat` each entry, never following a link. */
import { readdirSync, type Dirent } from "node:fs";
import type { AbsolutePath } from "../../domain/paths.ts";
import { codeOf } from "../../domain/text.ts";
import type { DirEntry, ListEntries } from "../../ports/list-entries.ts";

/** What a directory entry is, its link never followed. */
const kindOf = (d: Readonly<Dirent>): DirEntry["kind"] => {
  if (d.isSymbolicLink()) return "symlink";
  return d.isDirectory() ? "dir" : "file";
};

export const nodeListEntries: ListEntries = (
  dir: AbsolutePath,
): readonly DirEntry[] => {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      kind: kindOf(d),
    }));
  } catch (e) {
    const code = codeOf(e);
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
};
