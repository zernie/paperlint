/**
 * THE PAPER A LINTED FILE BELONGS TO — handed to the rules by `paperlint lint` in ESLint's `settings`.
 *
 * ESLint lints one file at a time. A paper whose body is in `sections/*.tex` is several files, and
 * two questions are about the paper, not the file: which reference form (`Fig.` or `Figure`) the
 * paper uses most, and whether the build `paper.tex` declares is a review build. The CLI knows the
 * files (it resolves the includes the way the build does, `bodyFiles` in src/tex-paper.ts) and puts
 * them under `settings.paperlint.paper`
 * for `paper.tex` and for every file it includes. A rule reads the other files from disk.
 *
 * No setting — a file linted outside `paperlint lint`, or a markdown paper — means a paper of one
 * file: every rule decides on the file it was handed, as it did before.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

/** The key under ESLint's `settings`; the paper is at `settings[PAPERLINT_SETTINGS].paper`. */
export const PAPERLINT_SETTINGS = "paperlint";

const PaperSetting = z.object({
  /** The absolute path of the paper's `paper.tex`. */
  main: z.string(),
  /** Absolute paths: `paper.tex`, then every file of its body, each once. */
  files: z.array(z.string()).readonly(),
});

/** The paper a file belongs to: its main file and all of its files. */
export type PaperOfFile = Readonly<z.infer<typeof PaperSetting>>;

const Settings = z.looseObject({ paper: PaperSetting });

/** The paper the linted file belongs to, or null when lint handed none. */
export function paperOf(
  settings: Readonly<Record<string, unknown>>,
): PaperOfFile | null {
  const r = Settings.safeParse(settings[PAPERLINT_SETTINGS]);
  return r.success ? r.data.paper : null;
}

/**
 * The text of a file on disk; empty when it cannot be read — a file gone since `paperlint lint`
 * named it holds no text for any rule.
 */
export function textOnDisk(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** The texts of the paper's files other than `filename`, read from disk; none without a paper. */
export const otherTexts = (
  paper: PaperOfFile | null,
  filename: string,
): readonly string[] =>
  (paper?.files ?? []).filter((f) => f !== filename).map(textOnDisk);
