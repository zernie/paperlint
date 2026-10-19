/**
 * The shipped presets as files, and their text rewritten — what the scheduled refresh of their
 * deadlines needs (`src/refresh-deadlines.ts`), not what a file system offers.
 */
import type { Reading } from "../domain/deadline.ts";

/** The presets of one directory, by file name. */
export interface PresetFiles {
  /** The preset files' names (`*.jsonc`), sorted. */
  list(): readonly string[];
  /** A preset's text. */
  read(name: string): string;
  /** A preset's new text. */
  write(name: string, text: string): void;
  /** Where a preset lives, as it is named in a message or parsed relative to. */
  path(name: string): string;
}

/** A preset's text with its `deadlines` set to `readings`, everything else as written. */
export interface PresetRewriter {
  withDeadlines(
    text: string,
    file: string,
    readings: readonly Reading[],
  ): Promise<string>;
}
