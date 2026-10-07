/**
 * THE RECORD STEP OF A BUILD — `recordSources` writes `<paper>/_build/sources.json`
 * (`src/domain/sources-record.ts`, docs/design/paper-sources.md §1) from what TeX and bibtex left in
 * the paper directory after the build's passes: each pass's `.fls`, the `.aux`, the `.blg` and the
 * `.bbl`. The files are read through the `Files` port, the `.fls` and the `.blg` through `TexOutput`;
 * which files the passes read is decided by `filesOfRun` (`src/domain/tex-run.ts`).
 *
 * Nothing here reads TeX source. Every file named in the record is one TeX or bibtex opened, and its
 * bytes are hashed as they are now: what a rule compares later to know whether the paper changed.
 *
 * What the `.aux`, `.blg` and `.bbl` hold about the bibliography is read by `latex-log.ts` — the reader
 * the build loop already uses on them, so one reader answers what bibtex was told and what it read.
 */
import { join, posix, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  JOBNAME,
  serializeSourcesRecord,
  SOURCES_DIR,
  SOURCES_FILE,
  SOURCES_SCHEMA,
  type RecordedBibtex,
  type RecordedInput,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { filesOfRun, type RunFiles } from "./domain/tex-run.ts";
import { auxBib, bibtexRead } from "./latex-log.ts";
import type { Files } from "./ports/files.ts";
import type { ListDir } from "./ports/talk-media.ts";
import type { TexOutput } from "./ports/tex-output.ts";

/** What recording needs: the disk, its directory listings, and the readers of TeX's own files. */
export interface RecordDeps {
  readonly files: Files;
  readonly listDir: ListDir;
  readonly texOutput: TexOutput;
}

/** What a build's passes left to read, besides the files on disk. */
export interface TexRun {
  /** The text of each pdflatex pass's `.fls`, in the order the passes ran. */
  readonly fls: readonly string[];
  /** The exit of the last bibtex run, or null when the build ran none. */
  readonly bibtexExit: number | null;
}

export type Recorded =
  | {
      readonly kind: "recorded";
      readonly record: SourcesRecord;
      /** Where it was written. */
      readonly path: string;
    }
  | { readonly kind: "not-recorded"; readonly why: string };

/** The step as the build holds it: wired by the composition root, handed a paper's directory and its run. */
export type RecordSources = (paperDir: string, run: TexRun) => Recorded;

/** No recorder wired: the build says so, and lint reports the paper as not built. */
export const notWiredRecord: RecordSources = () => ({
  kind: "not-recorded",
  why: "no recorder was wired into this build",
});

/** Where a paper's record lives. */
export const sourcesPath = (paperDir: string): string =>
  join(paperDir, SOURCES_DIR, SOURCES_FILE);

const distinct = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];

/** A path as the record spells it: relative to the paper directory, `./` and doubled slashes gone. */
const spelled = (p: string): string => posix.normalize(p);

/** The entry of `names` that is `segment`: itself, else the one entry equal to it ignoring case. */
const entryFor = (names: readonly string[], segment: string): string => {
  if (names.includes(segment)) return segment;
  const [only, ...more] = names.filter(
    (n) => n.toLowerCase() === segment.toLowerCase(),
  );
  return only !== undefined && more.length === 0 ? only : segment;
};

/**
 * A path of the record spelled as the paper directory's entries spell it. TeX logs the name it opened:
 * on a file system that ignores case that is the source's spelling, while TeX on one that does not
 * retries without case and logs the disk's — one paper, two records. A segment no entry matches, or
 * several do, stays as TeX spelled it.
 */
const spelledOnDisk =
  (listDir: ListDir, paperDir: string) =>
  (p: string): string =>
    p
      .split("/")
      .reduce(
        (at, segment) =>
          posix.join(
            at,
            entryFor(listDir(callerPath(resolve(paperDir, at))), segment),
          ),
        "",
      );

/** The files a run read and wrote, each named as the disk names it. */
const respelled = (files: RunFiles, spell: (p: string) => string): RunFiles => {
  const inputs = files.inputs.map((i) => ({ ...i, path: spell(i.path) }));
  return {
    ...files,
    inputs: inputs.filter(
      (i, n) => inputs.findIndex((j) => j.path === i.path) === n,
    ),
    written: distinct(files.written.map(spell)),
  };
};

/** The bytes of a file of the paper by its path in the record, or null when it is not there. */
const bytesOf =
  (deps: RecordDeps, paperDir: string) =>
  (p: string): Uint8Array | null =>
    deps.files.readBytes(callerPath(resolve(paperDir, p)));

const textOf =
  (bytes: (p: string) => Uint8Array | null) =>
  (p: string): string | null => {
    const b = bytes(p);
    return b === null ? null : new TextDecoder().decode(b);
  };

/** What the build's bibtex did, from the `.blg` and `.bbl` it left — or that it did not run. */
function bibtexOf(
  deps: RecordDeps,
  text: (p: string) => string | null,
  spell: (p: string) => string,
  exit: number | null,
): RecordedBibtex {
  if (exit === null) return { ran: false };
  const blg = text(`${JOBNAME}.blg`) ?? "";
  const bbl = text(`${JOBNAME}.bbl`) ?? "";
  const read = bibtexRead(blg, bbl);
  return {
    ran: true,
    databases: distinct(read.databases.map((d) => spell(spelled(d)))),
    keys: read.bibitems,
    exit,
    errors: deps.texOutput.blgErrors(blg),
  };
}

/**
 * The digest of every file the paper is made of: each input, and each database bibtex opened — one TeX
 * wrote too, since the rules read it from disk and an edit to it after the build must read as a change.
 * Null for one that is not there.
 */
function hashesOf(
  inputs: readonly RecordedInput[],
  databases: readonly string[],
  bytes: (p: string) => Uint8Array | null,
): SourcesRecord["sha256"] {
  const paths = distinct([...inputs.map((i) => i.path), ...databases]);
  return Object.fromEntries(
    paths.map((p) => {
      const b = bytes(p);
      return [p, b === null ? null : sha256Hex(b)] as const;
    }),
  );
}

/** Why there is nothing to record, or null when the passes read the paper's files. */
const nothingToRecord = (
  run: TexRun,
  inputs: readonly RecordedInput[],
): string | null => {
  if (run.fls.length === 0)
    return `pdflatex wrote no ${JOBNAME}.fls — nothing to record`;
  return inputs.length === 0
    ? `${JOBNAME}.fls lists no file of the paper directory — nothing to record`
    : null;
};

/** The record of a run whose passes read `files`: bibtex's part, the `.aux`'s, every digest. */
function recordOf(
  deps: RecordDeps,
  paperDir: string,
  run: TexRun,
  files: RunFiles,
): SourcesRecord {
  const bytes = bytesOf(deps, paperDir);
  const text = textOf(bytes);
  const bibtex = bibtexOf(
    deps,
    text,
    spelledOnDisk(deps.listDir, paperDir),
    run.bibtexExit,
  );
  return {
    schema: SOURCES_SCHEMA,
    inputs: files.inputs,
    written: files.written,
    bibdata: auxBib(text(`${JOBNAME}.aux`) ?? "", text).databases,
    bibtex,
    sha256: hashesOf(files.inputs, bibtex.ran ? bibtex.databases : [], bytes),
  };
}

export function recordSources(
  deps: RecordDeps,
  paperDir: string,
  run: TexRun,
): Recorded {
  const files = respelled(
    filesOfRun(run.fls.map(deps.texOutput.fls), {
      jobname: JOBNAME,
      generated: run.bibtexExit === null ? [] : [`${JOBNAME}.bbl`],
    }),
    spelledOnDisk(deps.listDir, paperDir),
  );
  const why = nothingToRecord(run, files.inputs);
  if (why !== null) return { kind: "not-recorded", why };
  const record = recordOf(deps, paperDir, run, files);
  const path = sourcesPath(paperDir);
  deps.files.writeAtomic(
    callerPath(path),
    new TextEncoder().encode(serializeSourcesRecord(record)),
  );
  return { kind: "recorded", record, path };
}

/** `recordSources` over `deps`, as the `RecordSources` the build is handed. */
export const sourcesRecorder =
  (deps: RecordDeps): RecordSources =>
  (paperDir, run) =>
    recordSources(deps, paperDir, run);

/** The line a build prints for a recording. */
export const recordingNote = (r: Recorded): string =>
  r.kind === "recorded"
    ? `sources: ${String(r.record.inputs.length)} file${r.record.inputs.length === 1 ? "" : "s"} read → ${SOURCES_DIR}/${SOURCES_FILE}`
    : `sources NOT recorded — ${r.why}; lint will say so`;
