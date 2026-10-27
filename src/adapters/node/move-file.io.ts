/** `MoveFile` and `CopyFile` over `node:fs`: a rename or a copy, the directory made first. */
import { copyFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { CopyFile, MoveFile } from "../../ports/move-file.ts";

export const nodeMoveFile: MoveFile = (
  from: AbsolutePath,
  to: AbsolutePath,
): void => {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
};

export const nodeCopyFile: CopyFile = (
  from: AbsolutePath,
  to: AbsolutePath,
): void => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};
