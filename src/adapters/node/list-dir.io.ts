/** `ListDir` over `node:fs`: the names in a directory, or none when it does not exist. */
import { readdirSync } from "node:fs";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { ListDir } from "../../ports/talk-media.ts";
import { codeOf } from "../../domain/text.ts";

export const nodeListDir: ListDir = (dir: AbsolutePath): readonly string[] => {
  try {
    return readdirSync(dir);
  } catch (e) {
    const code = codeOf(e);
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
};
