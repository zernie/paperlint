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
import { basename, dirname, extname, join, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { PaperSource } from "./domain/paper-source.ts";
import {
  bibTexts,
  databasesOf,
  MAIN_FILE,
  type BibText,
  type Bibliography,
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
  const spliced = assembled.segments.filter((s) => s.file !== assembled.main);
  // A file's role is the file's, across every include of it: body when any of them is in the body.
  const anyInBody = (file: string): boolean =>
    spliced.some((s) => s.file === file && inBody(s.via));
  const includes = spliced
    .filter((s, i, all) => all.findIndex((o) => o.file === s.file) === i)
    // A spliced file was found, so it has a first location: the one TeX opens.
    .flatMap((s): readonly IncludedFile[] =>
      locations(dir, s.file, deps.files)
        .slice(0, 1)
        .map((path) => ({
          path,
          rel: s.file,
          text: s.source,
          role: roleOf(path, callerPath(join(dir, s.file)), anyInBody(s.file)),
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

// ── a path a person gave → the bibliography to read ─────────────────────────────────────────

/** What a path a person gave comes to: where the paper is, and the texts to read. */
export interface PathBibliography {
  /** The `.bib`'s directory, the `.tex`'s, or the directory named. */
  readonly paperDir: AbsolutePath;
  readonly texts: readonly [BibText, ...BibText[]];
  /** The paper's bibliography as `paperSources` decides it; null for a `.bib` named, read alone. */
  readonly bibliography: Bibliography | null;
}

/** Why a path a person gave has no bibliography to read. One vocabulary for every caller. */
export type BibliographyUnread =
  /** A `.bib` or `.tex` named that is not there. */
  | { readonly kind: "missing"; readonly path: AbsolutePath }
  /** A file that is neither a `.bib` nor a `.tex`. */
  | { readonly kind: "not-bib-or-tex"; readonly path: AbsolutePath }
  /** Not a file, and no `paper.tex` in it. */
  | { readonly kind: "no-paper"; readonly path: AbsolutePath }
  /** A paper whose bibliography has no database on disk. */
  | {
      readonly kind: "no-database";
      readonly main: AbsolutePath;
      readonly bibliography: Bibliography;
    };

/** The paper's texts to read, or why it has none. */
function ofPaper(
  s: PaperSources,
): Result<PathBibliography, BibliographyUnread> {
  const [first, ...rest] = bibTexts(s.bibliography);
  return first === undefined
    ? err({
        kind: "no-database",
        main: s.main.path,
        bibliography: s.bibliography,
      })
    : ok({
        paperDir: s.dir,
        texts: [first, ...rest],
        bibliography: s.bibliography,
      });
}

/**
 * THE answer to "a path a person gave → the bibliography to read", for every script that takes one: a
 * `.bib` is read alone, as named; a `.tex`, or a directory holding `paper.tex`, is the bibliography
 * TeX reads for that paper (`paperSources`) — never a guess by file name. Anything else is refused,
 * in the words `bibliographyUnreadWhy` gives.
 */
export function bibliographyAt(
  path: AbsolutePath,
  deps: SourcesDeps,
): Result<PathBibliography, BibliographyUnread> {
  const ext = extname(path).toLowerCase();
  if (ext === ".bib" || ext === ".tex") {
    const bytes = deps.files.readBytes(path);
    if (bytes === null) return err({ kind: "missing", path });
    return ext === ".bib"
      ? ok({
          paperDir: callerPath(dirname(path)),
          texts: [deps.bib.readFile(path, decoded(bytes))],
          bibliography: null,
        })
      : ofPaper(sourcesOf(path, decoded(bytes), deps));
  }
  if (deps.files.isFile(path)) return err({ kind: "not-bib-or-tex", path });
  const r = paperSources(path, deps);
  return r.ok ? ofPaper(r.value) : err({ kind: "no-paper", path });
}

/** Why a bibliography has no text to read, in words a person can act on. */
function noDatabaseWhy(main: AbsolutePath, b: Bibliography): string {
  switch (b.kind) {
    case "none":
      return `${main} declares no bibliography (no \\bibliography, no \\addbibresource)`;
    case "thebibliography":
      return `${main} writes its references by hand in thebibliography — there is no database to read`;
    case "databases":
    case "undecided":
      return `${main} declares ${databasesOf(b)
        .map((d) => `${d.name} (${d.kind})`)
        .join(", ")}, and none of them is on disk`;
  }
}

/** One sentence: why `bibliographyAt` refused, naming the path and what to give instead. */
export function bibliographyUnreadWhy(e: BibliographyUnread): string {
  switch (e.kind) {
    case "missing":
      return `${e.path} does not exist — nowhere to take a bibliography from`;
    case "not-bib-or-tex":
      return `${e.path} is neither a .bib nor a .tex — name the paper's directory, its .tex, or a .bib`;
    case "no-paper":
      return `no paper.tex in ${e.path} — name the paper's .tex, or a .bib to read it alone`;
    case "no-database":
      return noDatabaseWhy(e.main, e.bibliography);
  }
}
