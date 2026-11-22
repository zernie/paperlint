/**
 * Claude Code, as `paperlint init`, `doctor` and the in-session notice need it: is it here, is the
 * paperlint plugin turned on for this project (and at which version), and turning it on.
 */
import type { AbsolutePath } from "../domain/paths.ts";

export interface PluginState {
  /** Turned on for the project, by the most specific settings file that names it. */
  readonly enabled: boolean;
  /** The version Claude Code installed for this project, or null when it has none on record. */
  readonly version: string | null;
}

/** How the plugin was turned on, in the commands or files that did it. */
export type EnableResult =
  | { readonly ok: true; readonly ran: readonly string[] }
  | {
      readonly ok: true;
      readonly wrote: string;
      /** The commands still owed where `claude` runs: the keys alone load nothing. */
      readonly owed: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

export interface ClaudeCode {
  /** A `.claude/` folder in the project, or `claude` on PATH. */
  readonly present: (root: AbsolutePath) => boolean;
  readonly plugin: (root: AbsolutePath) => PluginState;
  readonly enable: (root: AbsolutePath) => EnableResult;
}
