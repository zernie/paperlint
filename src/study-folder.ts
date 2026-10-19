/**
 * The one reader of what lies inside a study's folder, `repro/<folder>/<path>`, and of the decision
 * file that lies elsewhere in the paper. It never follows a symbolic link: a path is walked one
 * component at a time by the entries of each directory (`ListEntries`, which does not follow links),
 * and a path that passes through a link — the file itself, or any directory above it — is `linked`,
 * naming the link, before a single byte is read. Every reader of a study takes a `StudyFolder` and
 * not `Files`, so a read that follows a link is not what those readers are handed.
 *
 * What goes through it, and who builds it (once per run, from the paper's folder):
 *   - the plan of a row: `repro/study-registered`, `repro/outputs-before-decision`, `studies gate`
 *     and the index's mode columns;
 *   - the result file of a row: `repro/study-registered`;
 *   - whether a row's folder may be entered at all (`refusal`): `studies gate`, `studies index|new`;
 *   - the decision file's path (`entryAt`): the gate and the order rule.
 * The outputs of a study are listed through it too (`list`).
 * A study folder that is itself a link, or a folder name that is not one folder inside `repro/`, is
 * never entered: its files read as `absent`.
 *
 * A link made between the walk and the read is not caught: paperlint guards against accidents, not
 * against an author who races their own tooling (docs/design/study-modes.md, the threat model).
 */
import { join, posix } from "node:path";
import { callerPath } from "./caller-path.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import {
  isFolderName,
  isInside,
  type Located,
} from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { DirEntry, ListEntries } from "./ports/list-entries.ts";
import type {
  FolderRefusal,
  PathEntry,
  StudyFolder,
} from "./ports/study-folder.ts";

/** What a refusal says of the folder a row names: `which <reason>`, and the fix without its full stop. */
export const folderRefusalText = (
  why: FolderRefusal,
  shown: string,
): { readonly reason: string; readonly fix: string } =>
  why === "not-a-folder"
    ? {
        reason: `is not one folder inside ${shown}/${REPRO_DIR}/`,
        fix: "Give the row its own folder's name",
      }
    : {
        reason: "is a symbolic link",
        fix: `Give the row a real folder inside ${shown}/${REPRO_DIR}/`,
      };

/** What the entry `name` of the directory `dir` is; undefined when there is none. */
const kindAt = (
  entries: ListEntries,
  dir: string,
  name: string,
): DirEntry["kind"] | undefined =>
  entries(callerPath(dir)).find((e) => e.name === name)?.kind;

const ENTRY: Readonly<Record<Exclude<DirEntry["kind"], "symlink">, PathEntry>> =
  { file: { kind: "file" }, dir: { kind: "dir" } };

/**
 * What the entry `name` below `dir`/`above` is: every component on the way is looked up in its
 * directory's entries, and the first that is a symbolic link ends the walk (an entry under a
 * directory that is not there is not listed, so it can be no link).
 */
const walk = (
  dir: string,
  above: readonly string[],
  name: string,
  entries: ListEntries,
): PathEntry => {
  const path = [...above, name];
  const at = path.findIndex(
    (c, i) => kindAt(entries, join(dir, ...path.slice(0, i)), c) === "symlink",
  );
  if (at >= 0) return { kind: "linked", link: path.slice(0, at + 1).join("/") };
  const kind = kindAt(entries, join(dir, ...above), name);
  return kind === undefined || kind === "symlink"
    ? { kind: "absent" }
    : ENTRY[kind];
};

/** `path` as the directories above its last component, and that component. */
const split = (
  path: string,
): {
  readonly above: readonly string[];
  readonly name: string;
} => {
  const normal = posix.normalize(path);
  return {
    above: posix
      .dirname(normal)
      .split("/")
      .filter((c) => c !== "."),
    name: posix.basename(normal),
  };
};

/** What `path` in `folder` is, by the entries of the paper folder `paper`; nothing is read. */
const locateIn = (
  paper: string,
  entries: ListEntries,
  folder: string,
  path: string,
): Located => {
  // A NUL is no path the disk can hold, and probing one throws; the rest never leaves the folder.
  if (!isFolderName(folder) || !isInside(path) || path.includes("\0"))
    return { kind: "absent" };
  const { above, name } = split(path);
  // The folder is walked too: one that is a link is never entered, and reads as absent.
  const found = walk(join(paper, REPRO_DIR), [folder, ...above], name, entries);
  if (found.kind === "dir") return { kind: "absent" };
  if (found.kind !== "linked") return found;
  return found.link === folder
    ? { kind: "absent" }
    : { kind: "linked", link: found.link.slice(folder.length + 1) };
};

/** Why `folder` may not be entered in the paper folder `paper`; null when it may. */
const refusalOf = (
  paper: string,
  entries: ListEntries,
  folder: string,
): FolderRefusal | null => {
  if (!isFolderName(folder)) return "not-a-folder";
  return kindAt(entries, join(paper, REPRO_DIR), folder) === "symlink"
    ? "symbolic-link"
    : null;
};

/** Every file under `dir`, relative to it; a link is a file, and is not entered. */
const filesUnder = (
  dir: string,
  entries: ListEntries,
  prefix = "",
): readonly string[] =>
  entries(callerPath(dir)).flatMap(({ name, kind }) => {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    return kind === "dir" ? filesUnder(join(dir, name), entries, rel) : [rel];
  });

/** The reader of the study folders of the paper folder `paper`. */
export const studyFolder = (
  paper: string,
  deps: { readonly files: Files; readonly entries: ListEntries },
): StudyFolder => ({
  refusal: (folder) => refusalOf(paper, deps.entries, folder),
  locate: (folder, path) => locateIn(paper, deps.entries, folder, path),
  read: (folder, path) => {
    const at = locateIn(paper, deps.entries, folder, path);
    if (at.kind !== "file") return at;
    const p = callerPath(join(paper, REPRO_DIR, folder, path));
    const bytes = deps.files.isFile(p) ? deps.files.readBytes(p) : null;
    return bytes === null
      ? { kind: "absent" }
      : { kind: "text", text: new TextDecoder().decode(bytes) };
  },
  list: (folder) =>
    refusalOf(paper, deps.entries, folder) === null
      ? filesUnder(join(paper, REPRO_DIR, folder), deps.entries)
      : [],
  entryAt: (path) => {
    if (!isInside(path) || path.includes("\0")) return { kind: "absent" };
    const { above, name } = split(path);
    return walk(paper, above, name, deps.entries);
  },
});
