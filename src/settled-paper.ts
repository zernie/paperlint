/**
 * The rule blocks a paper's stage adds (#583, #553).
 *
 * A rule judges its own subject and knows nothing about where a paper is in its life. Whether it
 * should run on a paper that is done is a question about WHICH FILES a rule runs on, and in ESLint
 * that is the config's question. So the stage (`src/domain/paper-stage.ts`) becomes blocks here, in
 * the one place that already reads every paper's `paperlint.json` to build its blocks:
 *
 *   accepted   `paper/edition-over` off: the edition being over is where an accepted paper ends up
 *   final      also every rule about the text and the build off on the paper's `.tex`: the published
 *              text and PDF are frozen in `versions/`, so "rebuild", "too long" or "not built yet" has
 *              nothing left to fix. The talk, the artifact and the records keep their rules
 *
 * The blocks go after the root `paperlint.json` (a glob over every paper is more general than one
 * paper's stage) and before the paper's own, so a paper that wants a rule back on a final paper
 * writes it in its own `rules`, and a later block wins, as in ESLint.
 */
import { paperStage } from "./domain/paper-stage.ts";
import type { Cycles } from "./domain/cycle.ts";
import type { Files } from "./ports/files.ts";
import type { RuleBlock } from "./rules-config.ts";
import { readLock } from "./versions.ts";

/** The paper's own `.tex` files: `paper.tex` and the files it includes. Relative to the paper. */
const PAPER_TEX = "**/*.tex";

/**
 * The plugins whose rules judge the paper's TEXT and its BUILD: what the frozen camera-ready already
 * fixed. Only these go off on a final paper. The rest stay on, because freezing the PDF says nothing
 * about them: the talk and the public artifact are still being delivered (`talk/*`, `artifact/*`),
 * and the records are what a final paper is judged on (`cycle/*`, `versions/*`, `repro/*`,
 * `study/*`). A list of what goes off, not of what stays, so a new plugin stays on until someone
 * decides it judges the frozen text.
 */
const FROZEN_TEXT_PLUGINS: readonly string[] = [
  "tex",
  "bib",
  "pdf",
  "format",
  "anonymity",
  "paper",
];

/** The blocks for the paper in `dir`, or none while it is being written. Reads the lock through `files`. */
export function stageBlocks(
  dir: string,
  cycles: Cycles | null,
  files: Files,
  shipped: ReadonlySet<string>,
): readonly RuleBlock[] {
  if (cycles === null) return [];
  const lock = readLock(dir, files);
  const stage = paperStage(cycles.current, lock?.ok ? lock.value : {});
  if (stage === "working") return [];
  const accepted: RuleBlock = {
    basePath: dir,
    rules: { "paper/edition-over": "off" },
  };
  if (stage === "accepted") return [accepted];
  const textOff = Object.fromEntries(
    [...shipped]
      .filter((id) => FROZEN_TEXT_PLUGINS.some((p) => id.startsWith(`${p}/`)))
      .map((id) => [id, "off" as const]),
  );
  return [accepted, { basePath: dir, files: [PAPER_TEX], rules: textOff }];
}
