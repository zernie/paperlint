/**
 * Adding a package to the project's devDependencies, with the package manager the project already
 * uses — what `paperlint init` needs to add paperlint itself (`src/self-install.ts`).
 */
import type { AbsolutePath } from "../domain/paths.ts";

/** A program and its arguments; never empty. */
export type Argv = readonly [string, ...string[]];

export interface ProjectInstall {
  /** The command, as a person would type it, that adds `spec` to `root`'s devDependencies, saved exact. */
  readonly command: (root: AbsolutePath, spec: string) => Argv;
  /** Runs `argv` in `root` with its output on the terminal. */
  readonly run: (
    root: AbsolutePath,
    argv: Argv,
  ) => { readonly ok: true } | { readonly ok: false; readonly reason: string };
}
