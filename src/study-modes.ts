/**
 * Reading a paper's studies with their modes: each registered study whose `plan.json` parses with a
 * `mode`, and the files under a study's folder. What `repro/outputs-before-decision`, `studies gate`
 * and the index's mode columns read with (docs/design/study-modes.md). A row whose folder is not one
 * folder inside `repro/` is never read through.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import type { NotAFile } from "./domain/decide-first.ts";
import {
  isInside,
  type PlanTextField,
  type Study,
} from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { DirEntry, ListEntries } from "./ports/list-entries.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { readableFolders, registryOf, textAt } from "./study-registry-rule.ts";

/** What reading a paper's studies needs: the disk, its listings with and without kinds, and the parsers. */
export interface StudyDeps {
  readonly files: Files;
  readonly listDir: ListDir;
  readonly entries: ListEntries;
  readonly codec: StudyRegistryCodec;
}

/** What a decision path names on disk: a file, nothing, or something git cannot vouch for. */
export type OnDisk = "file" | "absent" | NotAFile;

const ON_DISK: Readonly<Record<DirEntry["kind"], OnDisk>> = {
  file: "file",
  dir: "directory",
  symlink: "symbolic link",
};

/**
 * What `p` is on disk, read from its directory's entries without following a link: a decision must
 * be a regular file — git answers for a directory with the commits of anything under it, and for a
 * link with the link, not the file it points to.
 */
export const onDisk = (p: string, deps: Pick<StudyDeps, "entries">): OnDisk => {
  const e = deps
    .entries(callerPath(dirname(p)))
    .find((x) => x.name === basename(p));
  return e === undefined ? "absent" : ON_DISK[e.kind];
};

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

/**
 * A study whose plan parsed with a mode: its row, the plan's path in its folder, the mode, and the
 * plan's empty texts — none when it is ready. Only a ready plan's mode decides anything: a draft may
 * name no outputs, or an empty decision file.
 */
export interface ModeStudy {
  readonly row: Study;
  readonly plan: string;
  readonly mode: StudyMode;
  readonly empty: readonly PlanTextField[];
}

/**
 * The study `s`'s plan, when it is a plan inside a folder every reader may read through
 * (`readableFolders`), by the registry rule's own containment test (`isInside`), that parsed with a
 * mode; else null.
 */
const modeStudyOf = (
  paper: string,
  s: Study,
  deps: Pick<StudyDeps, "files" | "codec">,
  readable: (folder: string) => boolean,
): ModeStudy | null => {
  const plan = s.plan;
  const text =
    plan === undefined ||
    !readable(s.folder) ||
    !isInside(plan) ||
    plan.includes("\0")
      ? null
      : textAt(deps.files, join(paper, REPRO_DIR, s.folder, plan));
  if (plan === undefined || text === null) return null;
  const parsed = deps.codec.parsePlan(text, s.kind);
  if (parsed.kind === "unreadable" || parsed.plan.mode === undefined)
    return null;
  const empty = parsed.kind === "draft" ? parsed.empty : [];
  return { row: s, plan, mode: parsed.plan.mode, empty };
};

/** The mode study of the one row `s` of the paper folder `paper`; null when its plan declares none. */
export const modeStudyFor = (
  paper: string,
  s: Study,
  deps: Pick<StudyDeps, "files" | "codec" | "entries">,
): ModeStudy | null =>
  modeStudyOf(paper, s, deps, readableFolders(paper, deps));

/**
 * Every study of the paper folder `paper` whose plan declares a mode, in registry order. A plan that
 * does not parse is `repro/study-registered`'s to report; here it declares nothing.
 */
export const modeStudies = (
  paper: string,
  deps: Pick<StudyDeps, "files" | "codec" | "entries">,
): readonly ModeStudy[] => {
  const r = registryOf(paper, deps);
  const readable = readableFolders(paper, deps);
  return (r.kind === "read" ? r.registry.studies : []).flatMap((s) => {
    const m = modeStudyOf(paper, s, deps, readable);
    return m === null ? [] : [m];
  });
};
