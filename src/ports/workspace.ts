/** A scratch directory with a lifetime — the generic port for temporary files. */
import type { AbsolutePath } from "../domain/paths.ts";

/** Rejects a Promise at the type level, so an `await` cannot escape a scope that ends synchronously. */
export type NotAPromise<T> = T extends PromiseLike<unknown> ? never : T;

/** A scratch directory that exists only inside `Workspace.within`. */
export interface Scratch {
  readonly dir: AbsolutePath;
  /** Write one file into `dir`; `exec` also sets its execute bit. Returns the file's path. */
  write(name: string, content: string, mode: "read" | "exec"): AbsolutePath;
}

/**
 * A scratch directory that cannot outlive the callback: it is created before `use` runs and removed
 * after, whether `use` returns or throws. There is no other way to get one.
 */
export interface Workspace {
  within<T>(prefix: string, use: (scratch: Scratch) => NotAPromise<T>): T;
}
