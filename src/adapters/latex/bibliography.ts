/**
 * WHERE A PAPER'S BIBLIOGRAPHY IS — decided by TeX's and bibtex's rules from what each source
 * declares (`declarations.ts`). The decision is here, in the latex adapter, because it is TeX's
 * knowledge (finding 9 of the design's refutation, docs/design/paper-sources.md §7); the states it
 * returns are the domain's (`src/domain/paper-sources.ts`).
 *
 * The rules, each measured on the planted papers of fixtures/paper-sources (tex-truth.json):
 *
 *   - bibtex reads the databases of the FIRST `\bibliography` (`\nobibliography`); a second one is an
 *     error it reports and ignores (v9);
 *   - blocks writing one file run in order: a block writes when it has `[overwrite]` or no file of that
 *     name exists yet, so the last such block wins over every earlier one (v11), and a committed file
 *     wins over blocks without `[overwrite]` (v1);
 *   - a block behind a switch may or may not run: its database is both candidates (v12);
 *   - `\jobname` is the main file's name (v8); a name built by another macro is `unresolved`.
 *
 * Anything TeX may or may not read makes the bibliography `undecided`, with every candidate listed.
 */
import { basename, extname, normalize } from "node:path";
import {
  sameEntries,
  type BibText,
  type Bibliography,
  type Database,
  type Declared,
  type EmbeddedBib,
} from "../../domain/paper-sources.ts";
import type {
  BibDisk,
  BibliographyReading,
  BibSource,
} from "../../ports/latex.ts";
import { bibFileText, bibText } from "./bibtex.ts";
import { scanSource, type Declaration } from "./declarations.ts";
import { isNode, visited } from "./nodes.ts";
import { parseLatex, type ParsedTex } from "./parse.ts";

/** The first live `thebibliography` environment's span, or null. */
const theBibliographyOf = (t: ParsedTex): Declared["span"] | null => {
  const env = visited(t.root, () => false)
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

/** A block of one source, as the decision reads it. */
interface Block {
  readonly bib: EmbeddedBib;
  readonly conditional: boolean;
}

/** What one source of the paper holds for the decision. */
interface Parsed {
  readonly path: BibSource["path"];
  readonly declarations: readonly Declaration[];
  readonly blocks: readonly Block[];
  readonly theBibliography: Declared["span"] | null;
}

function parsedSource(s: BibSource, jobname: string): Parsed {
  const t = parseLatex(s.text);
  const scan = scanSource(t, jobname);
  return {
    path: s.path,
    declarations: scan.declarations,
    blocks: scan.blocks
      .filter(({ block }) => block.writes.endsWith(".bib"))
      .map(({ block, conditional }) => ({
        conditional,
        bib: {
          writes: block.writes,
          overwrite: block.overwrite,
          span: block.span,
          bib: bibText(s.path, s.text, block.body),
        },
      })),
    theBibliography: theBibliographyOf(t),
  };
}

/** What deciding one name needs. */
interface Decide {
  readonly name: string;
  readonly declared: Declared;
  readonly file: BibText | null;
  readonly committed: BibText | null;
}

/**
 * The database a run of `blocks` (in TeX's order) leaves: each writes when it has `[overwrite]` or no
 * file exists yet; TeX reads what was written last, or the committed file when no block wrote.
 */
function afterBlocks(d: Decide, blocks: readonly EmbeddedBib[]): Database {
  const shown = shownName(d.name);
  const [first] = blocks;
  if (first === undefined)
    return d.file === null
      ? { kind: "missing", name: shown, declared: d.declared }
      : { kind: "file", name: shown, declared: d.declared, file: d.file };
  const winner = blocks.reduce<EmbeddedBib | null>(
    (w, b) => (b.overwrite || (w === null && d.committed === null) ? b : w),
    null,
  );
  const block = winner ?? first;
  return d.committed !== null && !sameEntries(block.bib, d.committed)
    ? {
        kind: "conflict",
        name: shown,
        declared: d.declared,
        block,
        file: d.committed,
      }
    : { kind: "embedded", name: shown, declared: d.declared, block };
}

/** One declared name: its database, and — when a block for it sits behind a switch — the other candidate. */
function decided(
  d: Pick<Decide, "name" | "declared">,
  blocks: readonly Block[],
  disk: BibDisk,
): readonly Database[] {
  const fileName = fileNameOf(d.name);
  const found = disk.bib(fileName);
  const file = found === null ? null : bibFileText(found.path, found.text);
  const at: Decide = {
    ...d,
    file,
    committed: file !== null && disk.committed(file.path) ? file : null,
  };
  const mine = blocks.filter((b) => normalize(b.bib.writes) === fileName);
  const sure = afterBlocks(
    at,
    mine.filter((b) => !b.conditional).map((b) => b.bib),
  );
  return mine.some((b) => b.conditional)
    ? [
        sure,
        afterBlocks(
          at,
          mine.map((b) => b.bib),
        ),
      ]
    : [sure];
}

interface At {
  readonly d: Declaration;
  readonly at: Declared;
}

/** Every declaration bibtex reads: all but a `\bibliography` after an unconditional first one (v9). */
const readByBibtex = (declared: readonly At[]): readonly At[] => {
  const writesBibdata = (d: Declaration) =>
    d.macro === "bibliography" || d.macro === "nobibliography";
  const first = declared.findIndex(
    ({ d }) => writesBibdata(d) && !d.conditional,
  );
  return declared.filter(
    ({ d }, i) => first < 0 || i <= first || !writesBibdata(d),
  );
};

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
  parsed: readonly Parsed[],
  disk: BibDisk,
): { readonly databases: readonly Database[]; readonly undecided: boolean } {
  const blocks = parsed.flatMap((p) => p.blocks);
  const declared = readByBibtex(
    parsed.flatMap((p) =>
      p.declarations.map((d) => ({ d, at: { file: p.path, span: d.span } })),
    ),
  );
  const perName = declared.flatMap((a) => candidates(a, blocks, disk));
  return {
    databases: perName.flat(),
    undecided:
      declared.some(({ d }) => d.conditional) ||
      perName.some(
        (c) => c.length > 1 || c.some((d) => d.kind === "unresolved"),
      ),
  };
}

/**
 * The bibliography of a paper whose sources (the main file first, then its own includes) are
 * `sources`, and every block they hold that writes a `.bib`. A `.bib` is looked up where bibtex runs,
 * the paper's directory (`disk.bib`); a file there counts against a block only when it is committed
 * (`disk.committed`) — see the domain module.
 */
export function decideBibliography(
  sources: readonly BibSource[],
  disk: BibDisk,
): BibliographyReading {
  // The main file comes first: `\jobname` is its name.
  const jobname = sources
    .slice(0, 1)
    .map((s) => basename(s.path, extname(s.path)))
    .join("");
  const parsed = sources.map((s) => parsedSource(s, jobname));
  const blocks = parsed.flatMap((p) => p.blocks.map((b) => b.bib));
  const { databases, undecided } = databasesFrom(parsed, disk);
  const [first, ...rest] = databases;
  if (first !== undefined)
    return {
      bibliography: {
        kind: undecided ? "undecided" : "databases",
        databases: [first, ...rest],
      },
      blocks,
    };
  const thb = parsed.find((p) => p.theBibliography !== null);
  const bibliography: Bibliography =
    thb?.theBibliography == null
      ? { kind: "none" }
      : {
          kind: "thebibliography",
          declared: { file: thb.path, span: thb.theBibliography },
        };
  return { bibliography, blocks };
}
