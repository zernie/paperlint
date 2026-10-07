/**
 * `bibliographyAt(path)` — the one answer to "a path a person gave → the bibliography to read", for
 * every script that takes one (`extract-ref-facts`, `bib-authors`, `verify-cites`). A `.bib` is read
 * alone, as named; a `.tex`, or a directory holding `paper.tex`, is the bibliography the last build's
 * bibtex opened for that paper — TeX's answer, from `_build/sources.json` (docs/design/paper-sources.md
 * §1), never read out of TeX source.
 */
import { dirname, extname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { MAIN_FILE, type BibText } from "./domain/paper-sources.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { describeChanges } from "./domain/sources-record.ts";
import type { PaperRecord } from "./paper-record.ts";
import {
  authoredTexts,
  recordedBibliography,
  type RecordedDeps,
} from "./recorded-bibliography.ts";

const decoded = (b: Uint8Array): string => new TextDecoder().decode(b);

// ── a path a person gave → the bibliography to read ─────────────────────────────────────────

/** What a path a person gave comes to: where the paper is, and the texts to read. */
export interface PathBibliography {
  /** The `.bib`'s directory, the `.tex`'s, or the directory named. */
  readonly paperDir: AbsolutePath;
  readonly texts: readonly [BibText, ...BibText[]];
}

/** Why a path a person gave has no bibliography to read. One vocabulary for every caller. */
export type BibliographyUnread =
  /** A `.bib` or `.tex` named that is not there. */
  | { readonly kind: "missing"; readonly path: AbsolutePath }
  /** A file that is neither a `.bib` nor a `.tex`. */
  | { readonly kind: "not-bib-or-tex"; readonly path: AbsolutePath }
  /** Not a file, and no `paper.tex` in it. */
  | { readonly kind: "no-paper"; readonly path: AbsolutePath }
  /** A paper with no current record of a build: what bibtex read is not known (`state` says why). */
  | {
      readonly kind: "not-built";
      readonly dir: AbsolutePath;
      readonly state: Exclude<PaperRecord, { readonly kind: "fresh" }>;
    }
  /** A paper whose last build's bibtex read no database, or whose databases are not on disk now. */
  | {
      readonly kind: "no-database";
      readonly dir: AbsolutePath;
      /** The databases bibtex opened: none when it ran none. */
      readonly opened: readonly string[];
    };

/** The texts of the paper in `dir` the last build's bibtex read, or why there are none. */
function ofPaper(
  dir: AbsolutePath,
  deps: RecordedDeps,
): Result<PathBibliography, BibliographyUnread> {
  const r = recordedBibliography(dir, deps);
  if (r.kind === "unrecorded")
    return err({ kind: "not-built", dir, state: r.record });
  const [first, ...rest] = authoredTexts(dir, r, deps);
  return first === undefined
    ? err({
        kind: "no-database",
        dir,
        opened: r.record.bibtex.ran ? r.record.bibtex.databases : [],
      })
    : ok({ paperDir: dir, texts: [first, ...rest] });
}

/**
 * THE answer to "a path a person gave → the bibliography to read", for every script that takes one: a
 * `.bib` is read alone, as named; a `.tex`, or a directory holding `paper.tex`, is the bibliography the
 * last build's bibtex opened for that paper (`_build/sources.json`) — never a guess by file name, and
 * never read out of TeX source. A paper with no current record is refused: run `npx paperlint build`
 * first. Anything else is refused in the words `bibliographyUnreadWhy` gives.
 */
export function bibliographyAt(
  path: AbsolutePath,
  deps: RecordedDeps,
): Result<PathBibliography, BibliographyUnread> {
  const ext = extname(path).toLowerCase();
  if (ext === ".bib" || ext === ".tex") {
    const bytes = deps.files.readBytes(path);
    if (bytes === null) return err({ kind: "missing", path });
    return ext === ".bib"
      ? ok({
          paperDir: callerPath(dirname(path)),
          texts: [deps.bib.readFile(path, decoded(bytes))],
        })
      : ofPaper(callerPath(dirname(path)), deps);
  }
  if (deps.files.isFile(path)) return err({ kind: "not-bib-or-tex", path });
  return deps.files.readBytes(callerPath(join(path, MAIN_FILE))) === null
    ? err({ kind: "no-paper", path })
    : ofPaper(path, deps);
}

const BUILD = "run `npx paperlint build` first";

/** Why a paper has no current record, in words a person can act on. */
function notBuiltWhy(
  dir: AbsolutePath,
  s: Extract<BibliographyUnread, { readonly kind: "not-built" }>["state"],
): string {
  switch (s.kind) {
    case "none":
      return s.unreadable === null
        ? `${dir} has not been built — ${BUILD}, which records the databases bibtex reads`
        : `the last build's record of ${dir} cannot be used (${s.unreadable}) — ${BUILD}`;
    case "stale":
      return `${dir} changed since the last build (${describeChanges(s.changed)}) — ${BUILD}`;
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
    case "not-built":
      return notBuiltWhy(e.dir, e.state);
    case "no-database":
      return e.opened.length === 0
        ? `bibtex read no database in the last build of ${e.dir} — there is nothing to read`
        : `bibtex opened ${e.opened.join(", ")} in the last build of ${e.dir}, and none of them is on disk now`;
  }
}
