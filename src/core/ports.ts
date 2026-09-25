/**
 * The PORTS: what the core and the app layer need from the outside world, as interfaces. The
 * adapters in `src/adapters/` implement them — `node/` for real, `memory/` for tests — and the
 * composition root picks which. Four kinds of outside world are touched, so there are four ports:
 * processes, files, a scratch directory with a lifetime, and the network. See `src/CLAUDE.md`.
 */
import type { Opaque } from "ts-essentials";
import type { Result } from "./result.ts";

/** An absolute path. Minted at the composition root (`abs`), so the core never resolves a cwd. */
export type AbsolutePath = Opaque<string, "AbsolutePath">;

/** A program to run, as data. `env` is the child's WHOLE environment, never merged in by the adapter. */
export interface Command {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes?: number;
  readonly cwd?: AbsolutePath;
}

/**
 * What running a program can come to. `not-found` is the EXECUTABLE itself (ENOENT on `file`) —
 * perl, curl — never one of its arguments, and it names the program so a message can too.
 */
export type ProcessExit =
  | {
      readonly kind: "exited";
      readonly status: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | {
      readonly kind: "signalled";
      readonly signal: string;
      readonly stdout: string;
      readonly stderr: string;
    }
  | {
      readonly kind: "timed-out";
      readonly afterMs: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: "not-found"; readonly file: string }
  | { readonly kind: "spawn-failed"; readonly message: string };

/** Run a program to completion. Synchronous, like the `spawnSync` it replaces. */
export interface RunProcess {
  run(c: Command): ProcessExit;
}

/** Files by path. A read that fails for any reason but absence throws: that is an adapter bug. */
export interface Files {
  isFile(p: AbsolutePath): boolean;
  /** The file's bytes, or null when there is no such file. */
  readBytes(p: AbsolutePath): Uint8Array | null;
  /** Write through `<p>.part` and a rename, creating the directory: a reader never sees half a file. */
  writeAtomic(p: AbsolutePath, bytes: Uint8Array): void;
}

/** Fetch a URL's bytes. */
export interface Download {
  fetch(
    url: URL,
    timeoutMs: number,
  ): Result<Uint8Array, { readonly detail: string }>;
}

/** Rejects a Promise at the type level, so an `await` cannot escape a scope that ends synchronously. */
export type NotAPromise<T> = T extends PromiseLike<unknown> ? never : T;
