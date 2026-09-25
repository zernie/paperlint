/**
 * Running a program — the generic port an adapter that drives another program is built over (banal's,
 * curl's). The app does not see it where a need-shaped port (`MeasureGeometry`) would do.
 */
import type { AbsolutePath } from "../domain/paths.ts";

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
