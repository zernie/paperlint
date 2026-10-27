/**
 * A PAPER'S FROZEN VERSIONS, read from the disk: the folder `versions/`, its lock, and the draft
 * measured against the frozen source it left (`src/domain/versions.ts` holds the convention and every
 * decision; this file reads and writes through the ports).
 *
 *   readVersions    the cycles, the lock and the files of `versions/`, as the rules and the table read them
 *   draftDrift      paper.tex, assembled as the build read it, against the frozen source of the attempt
 *   versionLines    the version → state table (`paperlint versions`, `paperlint submission show`)
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { Cycles } from "./domain/cycle.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { messageOf } from "./domain/text.ts";
import { err, ok, type Result } from "./domain/result.ts";
import {
  driftBase,
  lineDrift,
  LOCK_FILE,
  parseLock,
  versionRows,
  versionTable,
  VERSIONS_DIR,
  type DraftDrift,
  type Entry,
  type FileFacts,
  type Lock,
} from "./domain/versions.ts";
import type { Files } from "./ports/files.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { readCycles } from "./cycle-rules.ts";
import { readPaper, decoded, type ProseDeps } from "./tex-paper.ts";
import { MAIN } from "./build.ts";

/** The paper's `versions/` folder. */
export const versionsDir = (paperDir: string): string =>
  join(paperDir, VERSIONS_DIR);

/** A frozen file's path, by its key. */
export const frozenPath = (paperDir: string, key: string): string =>
  join(paperDir, VERSIONS_DIR, key);

/** Whether a frozen file is on disk, by its key. */
export const hasFrozen =
  (paperDir: string, files: Files) =>
  (key: string): boolean =>
    files.isFile(callerPath(frozenPath(paperDir, key)));

/** A frozen file's text, by its key; null when it is not there. */
export const frozenText = (
  paperDir: string,
  key: string,
  files: Files,
): string | null =>
  decoded(files.readBytes(callerPath(frozenPath(paperDir, key))));

/** The size and digest of a frozen file on disk, by its key: zero bytes of nothing when it is gone. */
export const factsOfFrozen =
  (paperDir: string, files: Files) =>
  (key: string): FileFacts => {
    const b =
      files.readBytes(callerPath(frozenPath(paperDir, key))) ??
      new Uint8Array();
    return { bytes: b.length, sha256: sha256Hex(b) };
  };

/** `versions/lock.json`: null when there is none; else parsed, or why it does not parse. */
export function readLock(
  paperDir: string,
  files: Files,
): Result<Lock, string> | null {
  const b = files.readBytes(callerPath(join(versionsDir(paperDir), LOCK_FILE)));
  if (b === null) return null;
  try {
    return parseLock(JSON.parse(new TextDecoder().decode(b)));
  } catch (e) {
    return err(`not JSON: ${messageOf(e)}`);
  }
}

/** What reading the folder needs: the disk and its listings. */
export interface VersionsDeps {
  readonly files: Files;
  readonly listDir: ListDir;
}

/** The entries of a folder, each a file or a folder, by name. */
export const entriesIn = (dir: string, deps: VersionsDeps): readonly Entry[] =>
  [...deps.listDir(callerPath(dir))].sort().map((name) => ({
    name,
    kind: deps.files.isFile(callerPath(join(dir, name))) ? "file" : "dir",
  }));

/** The paper's cycles, when it keeps them and they read; null for the flat form or a broken record. */
export function cyclesIn(paperDir: string, files: Files): Cycles | null {
  const r = readCycles(paperDir, { files });
  return r.ok ? r.value : null;
}

/** paper.tex, assembled as the last build read it (its includes spliced in); null without one. */
export function draftText(paperDir: string, deps: ProseDeps): string | null {
  const main = join(paperDir, MAIN);
  const src = decoded(deps.files.readBytes(callerPath(main)));
  return src === null ? null : readPaper(main, src, deps).text;
}

/** The draft against the frozen source of the paper's attempt: none, nothing frozen, the same, or drifted. */
export function draftDrift(
  paperDir: string,
  cycles: Cycles,
  draft: string,
  files: Files,
): DraftDrift {
  const base = driftBase(cycles.current, hasFrozen(paperDir, files));
  if (base === null) return { kind: "none" };
  const frozen = frozenText(paperDir, base.key, files);
  if (frozen === null) return { kind: "no-base", key: base.key };
  const drift = lineDrift(frozen, draft);
  return drift.added === 0 && drift.removed === 0
    ? { kind: "same", key: base.key }
    : { kind: "drift", key: base.key, drift };
}

/**
 * The version → state table of the paper in `paperDir`: each attempt's frozen files and what they
 * are, then the draft. Or why there is none: the paper keeps no `cycles`.
 */
export function versionLines(
  paperDir: string,
  deps: ProseDeps,
): Result<readonly string[], string> {
  const cycles = cyclesIn(paperDir, deps.files);
  if (cycles === null)
    return err(
      'the paper keeps no "cycles" in paperlint.json (or they do not read — `paperlint lint` says why): versions are kept per attempt, versions/<cycle>/<stage>.pdf',
    );
  const lock = readLock(paperDir, deps.files);
  const draft = draftText(paperDir, deps);
  return ok(
    versionTable(
      versionRows({
        cycles: cycles.list,
        has: hasFrozen(paperDir, deps.files),
        lock: lock?.ok === true ? lock.value : {},
        draft:
          draft === null
            ? { kind: "none" }
            : draftDrift(paperDir, cycles, draft, deps.files),
      }),
    ),
  );
}
