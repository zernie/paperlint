/**
 * The folders inside a paper that are copies of it, not papers (#582): a snapshot kept for a review
 * (`reviews/<date>/paper.tex`), a build copy made to measure an edit (`research/…/runs/<x>/`). They
 * carry a paper's files, so a glob over file names took each for a paper of its own: its warnings
 * read as the paper's, and an error on a copy turned a clean paper's run red.
 *
 * What makes a folder a paper is its settings file, not the name of a file in it. Prior art: ESLint
 * decides a project by its config, and a nested config is what makes a subtree a project of its own.
 * So a folder below the paper that holds a paper's file and no settings file of its own is a copy,
 * and `paperlint lint` ignores it. One with its own settings file is still linted.
 */
import { filter, isIncludedIn, map, pipe, sortBy, unique } from "remeda";

/** The names that decide: the settings file, and the files a paper folder is recognised by. */
export interface CopyNames {
  readonly config: string;
  readonly markers: readonly string[];
}

/** The folder of a `/`-separated relative path; "" for a file at the top. Pure. */
const folderOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
};

/** The last segment of a `/`-separated path. Pure. */
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/**
 * The copies among the folders below a paper, as paths relative to it, sorted. `files` are the
 * paper's files, relative to it and `/`-separated, as `ListTree` gives them. The paper's own top
 * level is never a copy. Pure.
 */
export function copiesIn(
  files: readonly string[],
  names: CopyNames,
): readonly string[] {
  const configured = new Set(
    files.filter((f) => nameOf(f) === names.config).map(folderOf),
  );
  return pipe(
    files,
    filter((f) => isIncludedIn(nameOf(f), names.markers)),
    map(folderOf),
    filter((dir) => dir !== "" && !configured.has(dir)),
    unique(),
    sortBy((dir) => dir),
  );
}
