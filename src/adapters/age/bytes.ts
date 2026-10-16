/** Running a program with bytes in and bytes out: what age needs, which `RunProcess` (text) is not. */

/** A program to run, as data. `env` is the child's whole environment. */
export interface BytesCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/** What it came to. `not-found` is the executable itself. */
export type BytesExit =
  | {
      readonly kind: "exited";
      readonly status: number;
      readonly stdout: Uint8Array;
      readonly stderr: string;
    }
  | { readonly kind: "not-found" }
  | { readonly kind: "failed"; readonly message: string };

export type RunBytes = (c: BytesCommand) => BytesExit;
