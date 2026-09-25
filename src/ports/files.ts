/** Files by path — the generic port for the disk. */
import type { AbsolutePath } from "../domain/paths.ts";

/** Files by path. A read that fails for any reason but absence throws: that is an adapter bug. */
export interface Files {
  isFile(p: AbsolutePath): boolean;
  /** The file's bytes, or null when there is no such file. */
  readBytes(p: AbsolutePath): Uint8Array | null;
  /** Write through `<p>.part` and a rename, creating the directory: a reader never sees half a file. */
  writeAtomic(p: AbsolutePath, bytes: Uint8Array): void;
}
