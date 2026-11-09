/**
 * WHY `paperlint lint <file>` REFUSES A FILE. A file paperlint's scope does not claim is refused by
 * name (src/cli.ts), and the reason is not always "not a paper file": a `.tex` inside a paper is
 * linted exactly when the last build recorded `paper.tex` reading it (src/paper-includes.ts), so a
 * figure the paper no longer includes, or one in a paper never built, is refused for THAT reason.
 * The general list of globs names only what is claimed outright, not the recorded bodies.
 */
import { dirname, extname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { describeChanges } from "./domain/sources-record.ts";
import { paperRecord, type RecordReadDeps } from "./paper-record.ts";
import { sourcesPath } from "./sources-record.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** The nearest directory above `file` holding a `PIPELINE-STATUS.md`, or null. */
const paperAbove = (file: string, deps: RecordReadDeps): string | null => {
  const dir = dirname(file);
  return deps.files.isFile(callerPath(join(dir, STATUS_FILE)))
    ? dir
    : dir === file
      ? null
      : paperAbove(dir, deps);
};

/** The one-line refusal of `file`, which paperlint does not lint. `shown` spells a path for a person. */
export function refusalOf(
  file: string,
  {
    patterns,
    shown,
  }: {
    readonly patterns: readonly string[];
    readonly shown: (path: string) => string;
  },
  deps: RecordReadDeps,
): string {
  const general = `${shown(file)} is not a file paperlint lints — it lints ${patterns.join(", ")}, and the .tex files a built paper.tex includes`;
  const paper = extname(file) === ".tex" ? paperAbove(file, deps) : null;
  if (paper === null) return general;
  const record = shown(sourcesPath(paper));
  const state = paperRecord(paper, deps);
  switch (state.kind) {
    case "none":
      return `${shown(file)} is in ${shown(paper)}, which has not been built (no ${record}) — paperlint lints a figure only when paper.tex includes it, and only a build records that; run \`paperlint build ${shown(paper)}\` first.`;
    case "stale":
      return `${shown(file)} is not linted: ${record} is out of date (${describeChanges(state.changed)}) — rebuild with \`paperlint build\`, then paperlint lints the files paper.tex includes.`;
    case "fresh":
      return `${shown(file)} is not in the last build's sources (${record}) — paperlint lints a figure only when paper.tex includes it; rebuild with \`paperlint build\` if it was just added.`;
  }
}
