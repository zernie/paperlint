/**
 * WHERE A PAPER'S BIBLIOGRAPHY IS — decided by TeX's reading model from what the paper declares
 * (`declarations.ts`). The decision is here, in the latex adapter, because it is TeX's knowledge; the
 * states it returns are the domain's (`src/domain/paper-sources.ts`), and the databases are read
 * through the bibtex reader the caller hands in (`disk.reader`).
 *
 * The rules, each measured on the planted papers of fixtures/paper-sources (tex-truth.json):
 *
 *   - bibtex takes one `\bibdata`: a paper with two `\bibliography` (`\nobibliography`) commands is
 *     one bibtex fails on, so its bibliography is `undecided`, every database a candidate (v9);
 *   - TeX reads the paper in one pass, an include where it stands: the declarations and blocks are
 *     read off the assembled paper, so an `\input` before the main file's own `\bibliography` comes
 *     first (v17, v18), and an include inside a conditional is conditional (v19);
 *   - blocks writing one file run in order: a block writes when it has `[overwrite]` or no file of that
 *     name exists yet, so the last such block wins over every earlier one (v11), and a committed file
 *     wins over blocks without `[overwrite]` (v1);
 *   - a block behind a switch may or may not run: every block that can be the last to write is a
 *     candidate, and so is the file when none can (v12, v20, v21);
 *   - `\jobname` is the main file's name (v8); a name built by another macro is `unresolved`.
 *
 * Anything TeX may or may not read makes the bibliography `undecided`, with every candidate listed.
 */
import { basename, extname, normalize } from "node:path";
import {
  sameDatabase,
  type BibText,
  type Bibliography,
  type Database,
  type Declared,
  type EmbeddedBib,
} from "../../domain/paper-sources.ts";
import type { Span } from "../../domain/tex-document.ts";
import type { BibReader } from "../../ports/bib-reader.ts";
import type { BibDisk, BibPaper, BibPiece } from "../../ports/latex.ts";
import {
  scanSource,
  type Declaration,
  type SourceScan,
} from "./declarations.ts";
import { isNode, visited } from "./nodes.ts";
import { liveRoot, parseLatex, type ParsedTex } from "./parse.ts";

/** The first live `thebibliography` environment's span, or null — never one after `\end{document}`. */
const theBibliographyOf = (t: ParsedTex): Span | null => {
  const env = visited(liveRoot(t), () => false)
    .filter(isNode)
    .find((n) => n.type === "environment" && n.env === "thebibliography");
  const pos = env?.position;
  return pos === undefined
    ? null
    : { start: pos.start.offset, end: pos.end.offset };
};

/** A database's file name: as declared, with `.bib` when it has none; its name without. */
const fileNameOf = (name: string): string =>
  normalize(name.endsWith(".bib") ? name : `${name}.bib`);
const shownName = (name: string): string =>
  name.endsWith(".bib") ? name.slice(0, -".bib".length) : name;

/** A block, as the decision reads it. */
interface Block {
  readonly bib: EmbeddedBib;
  readonly conditional: boolean;
}

/** A span of the assembled paper, in the file it came from: the stretch its start lies in. */
interface Placed {
  readonly piece: BibPiece;
  readonly span: Span;
}

function placed(paper: BibPaper, span: Span): Placed {
  // Every character of the paper lies in one stretch; the main file stands for an empty paper.
  const piece = paper.pieces.reduce<BibPiece>(
    (found, p) => (p.start <= span.start ? p : found),
    {
      start: 0,
      end: paper.text.length,
      path: paper.main,
      source: paper.text,
      from: 0,
    },
  );
  const at = (offset: number) => piece.from + offset - piece.start;
  return {
    piece,
    span: { start: at(span.start), end: at(Math.min(span.end, piece.end)) },
  };
}

/** What the paper holds for the decision, each place in the file that holds it. */
interface Parsed {
  readonly declarations: readonly At[];
  readonly blocks: readonly Block[];
  readonly theBibliography: Declared | null;
}

/** A scanned block, placed in the file that holds it and read as a database. */
function blockIn(
  paper: BibPaper,
  { block, conditional }: SourceScan["blocks"][number],
  reader: BibReader,
): Block {
  const p = placed(paper, block.span);
  const body = placed(paper, block.body);
  return {
    conditional,
    bib: {
      writes: block.writes,
      overwrite: block.overwrite,
      span: p.span,
      bib: reader.read(p.piece.path, p.piece.source, body.span),
    },
  };
}

function parsedPaper(
  paper: BibPaper,
  jobname: string,
  reader: BibReader,
): Parsed {
  const t = parseLatex(paper.text);
  const scan = scanSource(t, jobname);
  const declaredAt = (span: Span): Declared => {
    const p = placed(paper, span);
    return { file: p.piece.path, span: p.span };
  };
  const thb = theBibliographyOf(t);
  return {
    declarations: scan.declarations.map((d) => ({ d, at: declaredAt(d.span) })),
    blocks: scan.blocks
      .filter(({ block }) => block.writes.endsWith(".bib"))
      .map((b) => blockIn(paper, b, reader)),
    theBibliography: thb === null ? null : declaredAt(thb),
  };
}

/** What deciding one name needs. */
interface Decide {
  readonly name: string;
  readonly declared: Declared;
  readonly file: BibText | null;
  readonly committed: BibText | null;
}

/** Where a run of the blocks for one file stands: the block that wrote last, and the first that ran. */
interface Run {
  readonly wrote: EmbeddedBib | null;
  readonly ran: EmbeddedBib | null;
}

/** A block run: it writes when it has `[overwrite]` or no file of that name exists yet. */
const ranBlock =
  (d: Decide) =>
  (r: Run, b: EmbeddedBib): Run => ({
    wrote:
      b.overwrite || (r.wrote === null && d.committed === null) ? b : r.wrote,
    ran: r.ran ?? b,
  });

/** The block a run leaves its mark with: the last that wrote, else the first that ran. */
const markOf = (r: Run): EmbeddedBib | null => r.wrote ?? r.ran;

/**
 * Every run the blocks can make, in TeX's order: a sure block runs, a switched one may or may not, so
 * each may-run doubles the runs. Runs that leave the same mark are one outcome, so there are never more
 * than the blocks and one; the first is the run where no switched block runs.
 */
const runsOf = (d: Decide, blocks: readonly Block[]): readonly Run[] =>
  blocks.reduce<readonly Run[]>(
    (runs, b) => {
      const ran = runs.map((r) => ranBlock(d)(r, b.bib));
      const next = b.conditional ? [...runs, ...ran] : ran;
      return next.filter(
        (r, i) => next.findIndex((o) => markOf(o) === markOf(r)) === i,
      );
    },
    [{ wrote: null, ran: null }],
  );

/** The database a run leaves: the file (or none) when no block ran, else the block, and a conflict with a committed file that differs. */
function databaseOf(d: Decide, r: Run): Database {
  const shown = shownName(d.name);
  const block = markOf(r);
  if (block === null)
    return d.file === null
      ? { kind: "missing", name: shown, declared: d.declared }
      : { kind: "file", name: shown, declared: d.declared, file: d.file };
  return d.committed !== null && !sameDatabase(block.bib, d.committed)
    ? {
        kind: "conflict",
        name: shown,
        declared: d.declared,
        block,
        file: d.committed,
      }
    : { kind: "embedded", name: shown, declared: d.declared, block };
}

/** One declared name: a database for every outcome its blocks can have. */
function decided(
  d: Pick<Decide, "name" | "declared">,
  blocks: readonly Block[],
  disk: BibDisk,
): readonly Database[] {
  const fileName = fileNameOf(d.name);
  const found = disk.bib(fileName);
  const file =
    found === null ? null : disk.reader.readFile(found.path, found.text);
  const at: Decide = {
    ...d,
    file,
    committed: file !== null && disk.committed(file.path) ? file : null,
  };
  const mine = blocks.filter((b) => normalize(b.bib.writes) === fileName);
  return runsOf(at, mine).map((r) => databaseOf(at, r));
}

interface At {
  readonly d: Declaration;
  readonly at: Declared;
}

/** `\bibliography` and `\nobibliography` write `\bibdata`; bibtex takes one. */
const writesBibdata = (d: Declaration): boolean =>
  d.macro === "bibliography" || d.macro === "nobibliography";

/** The candidates of one declared name. */
const candidates = (
  { d, at }: At,
  blocks: readonly Block[],
  disk: BibDisk,
): readonly (readonly Database[])[] =>
  d.names.map((n): readonly Database[] => {
    if (n.kind === "unresolved")
      return [{ kind: "unresolved", name: n.written, declared: at }];
    return d.remote
      ? [{ kind: "remote", name: n.name, declared: at }]
      : decided({ name: n.name, declared: at }, blocks, disk);
  });

/** The databases of the declarations, and whether any of them may or may not be what TeX reads. */
function databasesFrom(
  parsed: Parsed,
  disk: BibDisk,
): { readonly databases: readonly Database[]; readonly undecided: boolean } {
  const declared = parsed.declarations;
  const perName = declared.flatMap((a) => candidates(a, parsed.blocks, disk));
  return {
    databases: perName.flat(),
    undecided:
      declared.some(({ d }) => d.conditional) ||
      declared.filter(({ d }) => writesBibdata(d)).length > 1 ||
      perName.some(
        (c) => c.length > 1 || c.some((d) => d.kind === "unresolved"),
      ),
  };
}

/**
 * The bibliography of `paper` — the main file with its includes spliced where they stand. A `.bib` is
 * looked up where bibtex runs, the paper's directory (`disk.bib`); a file there counts against a block
 * only when it is committed (`disk.committed`) — see the domain module.
 */
export function decideBibliography(
  paper: BibPaper,
  disk: BibDisk,
): Bibliography {
  const parsed = parsedPaper(
    paper,
    basename(paper.main, extname(paper.main)),
    disk.reader,
  );
  const { databases, undecided } = databasesFrom(parsed, disk);
  const [first, ...rest] = databases;
  if (first !== undefined)
    return {
      kind: undecided ? "undecided" : "databases",
      databases: [first, ...rest],
    };
  return parsed.theBibliography === null
    ? { kind: "none" }
    : { kind: "thebibliography", declared: parsed.theBibliography };
}
