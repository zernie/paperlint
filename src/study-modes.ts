/**
 * Reading a paper's studies with their modes: each registered study whose `plan.json` parses with a
 * `mode`, and the files under a study's folder. What `repro/outputs-before-decision`, `studies gate`
 * and the index's mode columns read with (docs/design/study-modes.md). A row whose folder is not one
 * folder inside `repro/` is never read through.
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import { isFolderName, type Study } from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { ListEntries } from "./ports/list-entries.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { registryOf, textAt } from "./study-registry-rule.ts";

/** What reading a paper's studies needs: the disk, its listings with and without kinds, and the parsers. */
export interface StudyDeps {
  readonly files: Files;
  readonly listDir: ListDir;
  readonly entries: ListEntries;
  readonly codec: StudyRegistryCodec;
}

/**
 * Whether `p` is a directory with something in it: what a decision path must not be, since git answers
 * for a directory with the commits of anything under it. An empty directory git never tracked.
 */
export const isDirectory = (
  p: string,
  deps: Pick<StudyDeps, "files" | "listDir">,
): boolean =>
  !deps.files.isFile(callerPath(p)) && deps.listDir(callerPath(p)).length > 0;

/**
 * Every file under `dir`, relative to it, `/`-separated; none when it is not a directory. A symbolic
 * link is listed as a file — git stores it as one — and never followed: a link to the folder itself
 * would recurse forever, and one to a tree outside would bring its files into the study.
 */
export const filesUnder = (
  dir: string,
  deps: Pick<StudyDeps, "entries">,
  prefix = "",
): readonly string[] =>
  deps.entries(callerPath(dir)).flatMap(({ name, kind }) => {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    return kind === "dir" ? filesUnder(join(dir, name), deps, rel) : [rel];
  });

/** A study whose plan parsed with a mode: its row, the plan's path in its folder, and the mode. */
export interface ModeStudy {
  readonly row: Study;
  readonly plan: string;
  readonly mode: StudyMode;
}

/** The study `s`'s plan, when it is a `plan.json` inside its folder that parsed with a mode; else null. */
const modeStudyOf = (
  paper: string,
  s: Study,
  deps: Pick<StudyDeps, "files" | "codec">,
): ModeStudy | null => {
  const plan = s.plan;
  const text =
    plan === undefined ||
    !isFolderName(s.folder) ||
    plan.split("/").includes("..") ||
    plan.includes("\0")
      ? null
      : textAt(deps.files, join(paper, REPRO_DIR, s.folder, plan));
  if (plan === undefined || text === null) return null;
  const parsed = deps.codec.parsePlan(text, s.kind);
  const mode = parsed.kind === "unreadable" ? undefined : parsed.plan.mode;
  return mode === undefined ? null : { row: s, plan, mode };
};

/**
 * Every study of the paper folder `paper` whose plan declares a mode, in registry order. A plan that
 * does not parse is `repro/study-registered`'s to report; here it declares nothing.
 */
export const modeStudies = (
  paper: string,
  deps: Pick<StudyDeps, "files" | "codec">,
): readonly ModeStudy[] => {
  const r = registryOf(paper, deps);
  return (r.kind === "read" ? r.registry.studies : []).flatMap((s) => {
    const m = modeStudyOf(paper, s, deps);
    return m === null ? [] : [m];
  });
};
