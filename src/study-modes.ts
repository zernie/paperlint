/**
 * Reading a paper's studies with their modes: each registered study whose `plan.json` parses with a
 * `mode`, and the files under a study's folder. What `repro/outputs-before-decision`, `studies gate`
 * and the index's mode columns read with (docs/design/study-modes.md). A row whose folder is not one
 * folder inside `repro/` is never read through.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import type { NotAFile } from "./domain/decide-first.ts";
import type { PlanTextField, Study } from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { DirEntry, ListEntries } from "./ports/list-entries.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { studyFolder } from "./study-folder.ts";
import { registryOf } from "./study-registry-rule.ts";

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

/** What reading the plan of one row gave: its mode study, nothing, or a link on the way to it. */
export type ModeRead =
  | { readonly kind: "mode"; readonly study: ModeStudy }
  | { readonly kind: "none" }
  | {
      readonly kind: "linked";
      readonly plan: string;
      readonly link: string;
    };

/**
 * The plan of the row `s`, read through the study folder's reader (`src/study-folder.ts`, which
 * follows no link and enters no folder that is not one inside `repro/`): its mode study when the
 * plan parsed with a mode; a link on the way to it; else nothing.
 */
export const readModeStudy = (
  paper: string,
  s: Study,
  deps: Pick<StudyDeps, "files" | "codec" | "entries">,
): ModeRead => {
  const plan = s.plan;
  if (plan === undefined) return { kind: "none" };
  const read = studyFolder(paper, deps).read(s.folder, plan);
  if (read.kind === "linked") return { kind: "linked", plan, link: read.link };
  if (read.kind === "absent") return { kind: "none" };
  const parsed = deps.codec.parsePlan(read.text, s.kind);
  if (parsed.kind === "unreadable" || parsed.plan.mode === undefined)
    return { kind: "none" };
  const empty = parsed.kind === "draft" ? parsed.empty : [];
  return {
    kind: "mode",
    study: { row: s, plan, mode: parsed.plan.mode, empty },
  };
};

/**
 * Every study of the paper folder `paper` whose plan declares a mode, in registry order. A plan that
 * does not parse, or is reached through a link, is `repro/study-registered`'s to report; here it
 * declares nothing.
 */
export const modeStudies = (
  paper: string,
  deps: Pick<StudyDeps, "files" | "codec" | "entries">,
): readonly ModeStudy[] => {
  const r = registryOf(paper, deps);
  return (r.kind === "read" ? r.registry.studies : []).flatMap((s) => {
    const m = readModeStudy(paper, s, deps);
    return m.kind === "mode" ? [m.study] : [];
  });
};
