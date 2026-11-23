/**
 * How far a paper is, read from what paperlint already records: its `cycles` and the files its
 * `versions/lock.json` holds frozen. Nothing new is written down to say a paper is done.
 *
 *   working    no cycle is accepted: the paper is being written, submitted or moved (open, rejected,
 *              withdrawn, none) — every rule applies
 *   accepted   the last cycle is accepted and its camera-ready is still to come: the build is still
 *              changing, but the edition being over is the expected end, not a problem (#553)
 *   final      accepted, and `<cycle>/camera-ready.pdf` is frozen: the published text and PDF no
 *              longer change, so nothing on the paper's `.tex` has anything left to fix (#583)
 *
 * The rules do not read this. The config does (`src/settled-paper.ts`): a stage decides which rules
 * run on which files, the ESLint way, and each rule stays about its own subject.
 */
import type { Current } from "./cycle.ts";
import { frozenKey, type Lock } from "./versions.ts";

export type PaperStage = "working" | "accepted" | "final";

/** The paper's stage from its current attempt and its lock. Pure. */
export function paperStage(current: Current, lock: Lock): PaperStage {
  if (current.kind !== "accepted") return "working";
  const key = frozenKey(current.cycle.id, "camera-ready", "pdf");
  return lock[key]?.kind === "file" ? "final" : "accepted";
}
