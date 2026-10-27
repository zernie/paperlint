/** `MoveFile` over `node:fs`: a rename, its directory made first. */
import { mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { MoveFile } from "../../ports/move-file.ts";

export const nodeMoveFile: MoveFile = (
  from: AbsolutePath,
  to: AbsolutePath,
): void => {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
};
