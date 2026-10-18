/**
 * The one reader of what lies inside a study's folder: `repro/<folder>/<path>`. Every read of a
 * plan or a result file goes through it, and it never follows a symbolic link: the path is walked
 * one component at a time by the folder's entries (`ListEntries`, which does not follow links), and
 * a path that passes through a link — the file itself, or any directory above it — is `linked`,
 * naming the link, before a single byte is read. The readers of a study take this and not `Files`,
 * so a read that follows a link cannot be written there.
 *
 * What is read, by whom: the plan of a row (`repro/study-registered`, `repro/outputs-before-decision`,
 * `studies gate`, the index's mode columns), and the result file of a row (`repro/study-registered`).
 * The outputs of a study are listed, not read (`filesUnder` in `src/study-modes.ts`, entries again).
 * A study folder that is itself a link, or a folder name that is not one folder inside `repro/`, is
 * never entered: its files read as `absent`.
 *
 * A link made between the walk and the read is not caught: paperlint guards against accidents, not
 * against an author who races their own tooling (docs/design/study-modes.md, the threat model).
 */
import { join, posix } from "node:path";
import { callerPath } from "./caller-path.ts";
import { REPRO_DIR } from "./domain/repro-layout.ts";
import { isFolderName, isInside } from "./domain/study-registry.ts";
import type { Files } from "./ports/files.ts";
import type { DirEntry, ListEntries } from "./ports/list-entries.ts";

/** What a path inside a study's folder is, found without reading it. */
export type Located =
  | { readonly kind: "file" }
  | { readonly kind: "absent" }
  /** `link`: the first symbolic link on the path, relative to the study's folder. */
  | { readonly kind: "linked"; readonly link: string };

/** What reading a path inside a study's folder gave. */
export type FolderRead =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "absent" }
  | { readonly kind: "linked"; readonly link: string };

/** The reads a study's folder allows. */
export interface StudyFolder {
  /** What `path` in `folder` is; nothing is read. */
  readonly locate: (folder: string, path: string) => Located;
  /** The text of the file at `path` in `folder`. */
  readonly read: (folder: string, path: string) => FolderRead;
}

/** What the entry `name` of the directory `dir` is; undefined when there is none. */
const kindAt = (
  entries: ListEntries,
  dir: string,
  name: string,
): DirEntry["kind"] | undefined =>
  entries(callerPath(dir)).find((e) => e.name === name)?.kind;

/**
 * What the file `name` below `dir`/`above` is: every component on the way is looked up in its
 * directory's entries, and the first that is a symbolic link ends the walk (an entry under a
 * directory that is not there is not listed, so it can be no link).
 */
const walk = (
  dir: string,
  above: readonly string[],
  name: string,
  entries: ListEntries,
): Located => {
  const path = [...above, name];
  const at = path.findIndex(
    (c, i) => kindAt(entries, join(dir, ...path.slice(0, i)), c) === "symlink",
  );
  if (at >= 0) return { kind: "linked", link: path.slice(0, at + 1).join("/") };
  return kindAt(entries, join(dir, ...above), name) === "file"
    ? { kind: "file" }
    : { kind: "absent" };
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
  // The folder is walked too: one that is a link is never entered, and reads as absent.
  const normal = posix.normalize(path);
  const found = walk(
    join(paper, REPRO_DIR),
    [
      folder,
      ...posix
        .dirname(normal)
        .split("/")
        .filter((c) => c !== "."),
    ],
    posix.basename(normal),
    entries,
  );
  if (found.kind !== "linked") return found;
  return found.link === folder
    ? { kind: "absent" }
    : { kind: "linked", link: found.link.slice(folder.length + 1) };
};

/** The reader of the study folders of the paper folder `paper`. */
export const studyFolder = (
  paper: string,
  deps: { readonly files: Files; readonly entries: ListEntries },
): StudyFolder => ({
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
});
