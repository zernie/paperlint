/** `RemoveFile` over `node:fs`. */
import { rmSync } from "node:fs";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { RemoveFile } from "../../ports/remove-file.ts";

export const nodeRemove: RemoveFile = (p: AbsolutePath): void => {
  rmSync(p, { force: true });
};
