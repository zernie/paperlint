/**
 * `paperSources(dir)` — THE one reading of what a paper is made of: its files, each with a role, and
 * its bibliography, decided from the committed bytes. Every place that used to answer "which files"
 * or "which bibliography" for itself asks this instead (docs/design/paper-sources.md); the value is
 * `src/domain/paper-sources.ts`.
 *
 * Reads through the ports only: the disk (`Files`), the LaTeX reader (`LatexReader`, which decides the
 * bibliography by TeX's rules), the bibtex reader (`BibReader`, the one reader of `.bib` text) and
 * `CommittedFiles` (whether a `.bib` beside a block is part of the paper or of this machine).
 * `sourcesOf` takes the main file's text from the caller — a lint rule hands the editor's buffer —
 * and reads the rest from disk.
 */
import { basename, dirname, join, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { PaperSource } from "./domain/paper-source.ts";
import {
  MAIN_FILE,
  type IncludedFile,
  type PaperSources,
  type Role,
} from "./domain/paper-sources.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { Span } from "./domain/tex-document.ts";
import type { CommittedFiles } from "./ports/committed.ts";
import type { BibReader } from "./ports/bib-reader.ts";
import type { BibDisk, BibPaper } from "./ports/latex.ts";
import {
  locations,
  readPaper,
  type PaperDeps,
  type Unread,
} from "./tex-paper.ts";

/** What reading a paper's sources needs: the disk, the LaTeX reader, git's index, the bibtex reader. */
export interface SourcesDeps extends PaperDeps {
  readonly committed: CommittedFiles;
  readonly bib: BibReader;
}

/** A directory with no main file: not an empty paper. */
export interface NoMain {
  readonly kind: "no-main";
  readonly dir: string;
}

const decoded = (b: Uint8Array): string => new TextDecoder().decode(b);

/** The paper's files without its bibliography: what Q1 needs, and all `bodyFiles` reads. */
export interface PaperFiles {
  readonly dir: AbsolutePath;
  readonly main: AbsolutePath;
  readonly includes: readonly IncludedFile[];
  readonly assembled: PaperSource;
}

/** The role of an included file: where its include stands, and where it was found. */
function roleOf(found: AbsolutePath, own: AbsolutePath, inBody: boolean): Role {
  if (found !== own) return "package-input";
  return inBody ? "body" : "preamble";
}

/**
 * The files of the paper whose main file is `main` with the text `text`: every file its includes
 * bring in, nested ones too, once each, in the order TeX reads them.
 */
export function paperFiles(
  main: AbsolutePath,
  text: string,
  deps: PaperDeps,
): PaperFiles {
  const dir = callerPath(dirname(main));
  const assembled = readPaper(main, text, deps);
  const body = deps.latex.documentBody(text);
  const inBody = (via: Span | null): boolean =>
    via !== null &&
    (body === null || (via.start >= body.start && via.end <= body.end));
  const includes = assembled.segments
    .filter((s) => s.file !== assembled.main)
    .filter((s, i, all) => all.findIndex((o) => o.file === s.file) === i)
    // A spliced file was found, so it has a first location: the one TeX opens.
    .flatMap((s): readonly IncludedFile[] =>
      locations(dir, s.file, deps.files)
        .slice(0, 1)
        .map((path) => ({
          path,
          rel: s.file,
          text: s.source,
          role: roleOf(path, callerPath(join(dir, s.file)), inBody(s.via)),
        })),
    );
  return { dir, main, includes, assembled };
}

/**
 * The `.bib` files as bibtex opens them from the paper's directory — a relative name there, an
 * absolute one as it is — and git's index, as the bibliography decision asks.
 */
const bibDisk = (dir: AbsolutePath, deps: SourcesDeps): BibDisk => ({
  bib: (name) => {
    const path = callerPath(resolve(dir, name));
    const b = deps.files.readBytes(path);
    return b === null ? null : { path, text: decoded(b) };
  },
  committed: deps.committed.isCommitted,
  reader: deps.bib,
});

/**
 * The paper as TeX executes it, for the bibliography: the assembled text, each stretch with the file
 * it came from — the file TeX opens, as `paperFiles` finds it.
 */
const bibPaper = (f: PaperFiles, deps: PaperDeps): BibPaper => ({
  main: f.main,
  text: f.assembled.text,
  pieces: f.assembled.segments.flatMap((seg) =>
    (seg.file === f.assembled.main
      ? [f.main]
      : locations(f.dir, seg.file, deps.files).slice(0, 1)
    ).map((path) => ({
      start: seg.start,
      end: seg.end,
      path,
      source: seg.source,
      from: seg.from,
    })),
  ),
});

/** The sources of the paper whose main file is `main`, its text given (an editor's buffer). */
export function sourcesOf(
  main: AbsolutePath,
  text: string,
  deps: SourcesDeps,
): PaperSources {
  const f = paperFiles(main, text, deps);
  const bibliography = deps.latex.bibliography(
    bibPaper(f, deps),
    bibDisk(f.dir, deps),
  );
  return {
    dir: f.dir,
    main: { path: main, rel: basename(main), text },
    includes: f.includes,
    assembled: f.assembled,
    bibliography,
  };
}

/** The sources of the paper in `dir`, read from disk; `no-main` when it has no `paper.tex`. */
export function paperSources(
  dir: string,
  deps: SourcesDeps,
): Result<PaperSources, NoMain> {
  const main = callerPath(join(dir, MAIN_FILE));
  const bytes = deps.files.readBytes(main);
  return bytes === null
    ? err({ kind: "no-main", dir })
    : ok(sourcesOf(main, decoded(bytes), deps));
}

/**
 * The files of the body of the paper whose main file is `filename`, by absolute path — the author's
 * prose, found in the paper's own directory: not a preamble include, not one of paperlint's inputs.
 * `missing` is every include, anywhere, that resolved nowhere.
 */
export function bodyFiles(
  filename: string,
  src: string,
  deps: PaperDeps,
): {
  readonly files: readonly AbsolutePath[];
  readonly missing: readonly Unread[];
} {
  const f = paperFiles(callerPath(filename), src, deps);
  return {
    files: f.includes.filter((i) => i.role === "body").map((i) => i.path),
    missing: f.assembled.missing.map(({ file, target }) => ({ file, target })),
  };
}

/** Why a reader of a paper's sources has nothing: no main file, or no reader wired (the build's default). */
export type SourcesUnread =
  NoMain | { readonly kind: "not-wired"; readonly dir: string };

/** A paper's sources by its directory — what the build's steps are handed by the composition root. */
export type ReadSources = (dir: string) => Result<PaperSources, SourcesUnread>;

/** `paperSources` over `deps`, as a `ReadSources`. */
export const sourcesReader =
  (deps: SourcesDeps): ReadSources =>
  (dir) =>
    paperSources(dir, deps);

/** No reader: the build was not given one. Never "no bibliography" — it says so. */
export const notWiredSources: ReadSources = (dir) =>
  err({ kind: "not-wired", dir });
