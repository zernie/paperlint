/**
 * Reading a paper's studies with their modes: each registered study whose `plan.json` parses with a
 * `mode`, and the files under a study's folder. What `repro/outputs-before-decision`, `studies gate`
 * and the index's mode columns read with (docs/design/study-modes.md). A row whose folder is not one
 * folder inside `repro/` is never read through.
 */
import { join, posix } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { NotAFile } from "./domain/decide-first.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import type {
  PlanTextField,
  RegistryState,
  Study,
} from "./domain/study-registry.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import type { StudyDeps, StudyFolder } from "./study-folder.ts";

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

/** Whether a decision path is one git can vouch for: a file or nothing yet; else why not. */
export type DecisionPath =
  | { readonly kind: "ok" }
  | { readonly kind: "not-a-file"; readonly what: NotAFile }
  | { readonly kind: "linked"; readonly link: string };

/**
 * What the decision file `file` (relative to the paper) is, read through `folder` without following
 * a link: a decision must be a regular file in real directories — git answers for a directory with
 * the commits of anything under it, for a link with the link and not the file it points to, and for a
 * path through a linked directory with what lies behind the link.
 */
export const decisionPath = (
  folder: StudyFolder,
  file: string,
): DecisionPath => {
  const at = folder.entryAt(file);
  if (at.kind === "dir") return { kind: "not-a-file", what: "directory" };
  if (at.kind !== "linked") return { kind: "ok" };
  return at.link === posix.normalize(file)
    ? { kind: "not-a-file", what: "symbolic link" }
    : at;
};

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
  | { readonly kind: "linked"; readonly link: string };

/**
 * The plan of the row `s`, read through `folder` (`src/study-folder.ts`, which follows no link and
 * enters no folder that is not one inside `repro/`): its mode study when the plan parsed with a
 * mode; a link on the way to it; else nothing.
 */
export const readModeStudy = (
  s: Study,
  folder: StudyFolder,
  codec: StudyRegistryCodec,
): ModeRead => {
  const plan = s.plan;
  if (plan === undefined) return { kind: "none" };
  const read = folder.read(s.folder, plan);
  if (read.kind === "linked") return read;
  if (read.kind === "absent") return { kind: "none" };
  const parsed = codec.parsePlan(read.text, s.kind);
  if (parsed.kind === "unreadable" || parsed.plan.mode === undefined)
    return { kind: "none" };
  const empty = parsed.kind === "draft" ? parsed.empty : [];
  return {
    kind: "mode",
    study: { row: s, plan, mode: parsed.plan.mode, empty },
  };
};

/**
 * Every study of the registry `r` whose plan declares a mode, in registry order. A plan that does
 * not parse, or is reached through a link, is `repro/study-registered`'s to report; here it declares
 * nothing.
 */
export const modeStudies = (
  r: RegistryState,
  folder: StudyFolder,
  codec: StudyRegistryCodec,
): readonly ModeStudy[] =>
  (r.kind === "read" ? r.registry.studies : []).flatMap((s) => {
    const m = readModeStudy(s, folder, codec);
    return m.kind === "mode" ? [m.study] : [];
  });
