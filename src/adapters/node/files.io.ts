/** `Files` over `node:fs`. */
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Files } from "../../domain/ports.ts";

const code = (e: unknown): unknown =>
  e instanceof Error ? (e as NodeJS.ErrnoException).code : undefined;

export const nodeFiles: Files = {
  isFile(p: AbsolutePath): boolean {
    return statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
  },
  readBytes(p: AbsolutePath): Uint8Array | null {
    try {
      return readFileSync(p);
    } catch (e) {
      if (code(e) === "ENOENT") return null;
      throw e;
    }
  },
  writeAtomic(p: AbsolutePath, bytes: Uint8Array): void {
    const part = `${p}.part`;
    mkdirSync(dirname(p), { recursive: true });
    try {
      writeFileSync(part, bytes);
      renameSync(part, p);
    } finally {
      rmSync(part, { force: true });
    }
  },
};
