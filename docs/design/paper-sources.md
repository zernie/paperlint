# Paper sources — one owner for "which files, which bibliography"

As built in PR #174. Everything that asks which files make up a paper, or which bibliography TeX reads,
asks one module; nothing reads a `.bib` but one adapter. TeX's own answer for each case is recorded
beside the case (§8), and the module is tested against that, not against prose.

## 1. What it answers, and where

| question                                        | entry point                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Q1 — which files make up the paper, each role   | `paperSources(dir, deps)`, `sourcesOf(main, text, deps)` — `src/paper-sources.ts` |
| Q2 — which bibliography TeX reads               | the same value's `bibliography`, decided by the latex adapter                     |
| a path a person gave → the bibliography to read | `bibliographyAt(path, deps)` — `src/paper-sources.ts` (§5)                        |
| every entry TeX reads, with its database        | `entriesOf(bibliography)` — `src/domain/paper-sources.ts`                         |
| what a build's bibtex read, against Q2          | `observed`, `unseenBy` — `src/references.ts` (§6, §7)                             |

`paperSources` reads through ports only: `Files` (the disk), `LatexReader` (parses, and decides the
bibliography by TeX's rules), `BibReader` (the one `.bib` reader) and `CommittedFiles` (git's index).
`sourcesOf` takes the main file's text from the caller, so a lint rule hands it the editor's buffer.

## 2. The values (`src/domain/paper-sources.ts`)

```ts
type Role = "body" | "preamble" | "package-input"; // the file's, across every include of it
interface IncludedFile {
  path;
  rel;
  text;
  role: Role;
}
interface PaperSources {
  dir;
  main: SourceFile;
  includes: IncludedFile[];
  assembled;
  bibliography: Bibliography;
}

type Bibliography =
  | { kind: "none" }
  | { kind: "thebibliography"; declared }
  | { kind: "databases"; databases: NonEmpty<Database> } // every declaration read unconditionally
  | { kind: "undecided"; databases: NonEmpty<Database> }; // depends on a switch: every candidate

type Database = { name; declared } & (
  | { kind: "embedded"; block: EmbeddedBib } // a live block writes it; no committed file differs
  | { kind: "file"; file: BibText } // no block; the .bib in the paper's directory
  | { kind: "conflict"; block: EmbeddedBib; file: BibText } // both, and they differ (§3)
  | { kind: "missing" }
  | { kind: "remote" }
  | { kind: "unresolved" } // nothing to read
);

interface BibText {
  path;
  text;
  body: Span;
  entries: BibEntry[];
  written: WrittenEntry[];
  preamble: string[];
}
interface BibEntry {
  type;
  key;
  span;
  fields: Record<string, string>;
  names: Record<string, BibName[]>;
}
interface WrittenEntry {
  type;
  key;
  fields: Record<string, string>;
} // as bibtex takes it (§4)
interface FoundEntry {
  db: Database;
  bib: BibText;
  entry: BibEntry;
} // what is checked (§6)
```

`texReads(db)` is the text TeX reads for one database: the block, the file, or for `conflict` the
block with `[overwrite]` and the file without. `bibTexts(b)` is every such text once; `entriesOf(b)`
is every entry of those texts, in order, each with its database.

## 3. How Q2 is decided — TeX's reading model

The latex adapter (`src/adapters/latex/bibliography.ts`, `declarations.ts`) decides from the parse
tree, as TeX executes the paper:

- **The assembled paper, in TeX's order.** The main file with every include spliced where it stands;
  each declaration and block is placed back in the file that holds it. Nothing after
  `\end{document}` is read (`liveRoot`).
- **Every run of switched blocks.** A block behind `\ifanon`, `\ifthenelse` or a macro body may or may
  not run; every block that can be the last to write a file is a candidate, and so is the file when
  none writes (`runsOf`). Runs that leave the same block count once.
- **`undecided`** when a declaration is behind a switch or in a macro body, a name is built by a
  macro other than `\jobname`, or two `\bibdata` writers exist (bibtex fails on the second).
- **Names off the parse tree.** A declaration's names, a block's file name and options, an include's
  braced path: comments dropped, groups flattened, `\jobname` only as exactly that macro
  (`argumentPieces`).
- **Committed bytes.** A block without `[overwrite]` writes its file only when none exists, and after
  one build TeX's own copy exists. So the block is `embedded` unless a file of that name in git's
  index holds something else: `conflict`. "Same" means bibtex takes the same from both (§4). For a
  name some block writes, the run where no block does sees only a committed file too: an uncommitted
  one is a build's leftover (`missing`, and the post-build check names what bibtex read from it). A
  `.bib` no block writes is the paper's, committed or not.
- **Where bibtex looks.** A database is resolved in the paper's directory (an absolute name as it is);
  the build sets no `BIBINPUTS`.

## 4. One bibtex reader

The port is `BibReader` (`src/ports/bib-reader.ts`: `read(path, text, body)` for a block,
`readFile(path, text)` for a `.bib`). The adapter, `src/adapters/bibtex/`, is the only code that
knows `@retorquere/bibtex-parser`. It reads each database twice:

- **`entries`** — LaTeX read into text (`{\"u}` → `ü`, `\url{x}` → a link), names split into parts,
  `@string`s expanded where they are used. What the checks judge.
- **`written`** — `raw: true`, every field verbatim, no outer braces dropped: each field as bibtex
  takes it, `@string`s expanded where used, LaTeX as written. What `sameDatabase` compares, with the
  `@preamble` commands, so `{\"o}` and `ö` stay two values, as they are in the `.bbl`.

**The fence is lint, not prose.** `eslint.config.mjs` sets `n/no-restricted-import` on
`@retorquere/bibtex-parser` (and its subpaths) for every file but `src/adapters/bibtex/**`
(`test/eslint-bib-parser.test.ts` plants imports in the app, the domain, another adapter and a
skill's script).

## 5. A path a person gave → `bibliographyAt`

`extract-ref-facts`, `bib-authors` and `verify-cites` (its `.bib` input) take a path on the command
line. All three ask `bibliographyAt(path, deps)`: a `.bib` is read alone, as named; a `.tex`, or a
directory holding `paper.tex`, is the bibliography TeX reads for that paper. A refusal is a
`BibliographyUnread` (`missing`, `not-bib-or-tex`, `no-paper`, `no-database`), and
`bibliographyUnreadWhy` is its one sentence. Each script keeps its own CLI frame around it.

## 6. The references a build checks

The build's references step (`src/references.ts`) checks entries, not keys: two candidates of an
`undecided` bibliography may each define a key with other metadata.

- **What is checked is `checkedBibliography(sources, bibtexRead)`**: the bibliography as the build
  observed it (`observed`). For `undecided`, the candidates whose database the build's bibtex opened
  (`paper.blg`) and paperlint can read; when it opened none of them (it did not run), every
  candidate. The verdicts, their hash and the post-build comparison are all about that one set.
- **One verdict per entry, in order.** The `CheckReferences` port returns verdict `i` for entry `i`;
  the adapter runs verify-cites and bib-authors per entry and pairs them by position.
- **`_build/references.json`, schema 3**: `bib {sources, sha256}`, `bibtex {databases, bibitems}`,
  `status`, `entries`. Lint lays the verdicts on the entries checked and reports each at its entry;
  a record that is not one verdict per entry, in order, is not about this bibliography
  (`paper/refs-fresh`).

## 7. The post-build check — where bibtex reads differently

bibtex has no comment syntax and recovers from malformed text as no parser does, so the reader does
not emulate it. Each difference has an owner:

| shape                                                          | answered by                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| malformed: an entry or brace never closed, `%` inside an entry | the build — bibtex exits 2, and `paperlint build` fails with its lines |
| two `\bibliography` commands                                   | the build, as above; statically `undecided`                            |
| an entry behind `%`, or inside `@comment{…}`                   | the post-build check                                                   |
| `@`, `)` or `{"}` inside a quoted field                        | the reader, which reads it as bibtex does                              |

**The post-build check.** The step records the databases `paper.blg` names and the keys `paper.bbl`
typesets. `paper/refs-checked` names, via `unseenBy`, every database the paper does not name and
every key bibtex typeset that the reader did not read from the databases bibtex opened.

## 8. Ground truth — `tex-truth.json`

Each planted paper of `fixtures/paper-sources/` carries `tex-truth.json`, written by TeX:
`test/e2e/tex/paper-sources.e2e.ts` builds it with `pdflatex -recorder` and `bibtex` and records
the files opened, the `.bib` files written, the databases bibtex read, the citations, the entries
typeset, and bibtex's exit code and errors. `-u` re-records; a TeX that answers differently fails.
`src/paper-sources.test.ts` compares the module with those files without TeX, and names every key
the post-build check must name (`UNSEEN`, `UNSEEN_DATABASES`). The files are the numbers; this
document does not copy them.

## 9. Decisions

- **Decided from committed bytes, not the disk** — a static answer must not differ between a fresh
  checkout and a built working copy.
- **`conflict` asks git's index through a port** (`CommittedFiles`) — "a file exists and differs"
  would be the machine-dependent answer again; outside a work tree every file counts.
- **`undecided` is a state of the bibliography** — which databases TeX reads depends on a value the
  reader does not compute; listing every candidate is the only answer that is never silent.
- **The build's observation decides `undecided` after a build** — bibtex's `.blg` says which
  candidate it opened; checking the others would judge entries TeX never read.
- **One verdict per entry, not per key** — a key does not identify an entry; a verdict that cannot
  say which entry it is about reports at the wrong one.
- **"Same database" is what bibtex takes** — raw bytes and the final `@string` map are a proxy that
  misses a `@string` redefined after use; the text between entries reaches no `.bbl`.
- **One `.bib` reader, fenced by lint** — three readers grew before there was one; the parser's name
  may appear in one folder only.
- **One path → bibliography function** — three scripts each resolved it by hand, each with its own
  refusals.
- **A role is the file's** — a file included in the preamble and the body is body prose; its first
  include alone would drop it from lint.
- **Recorded TeX truth, not hand-written expectations** — the module's tests compare with what TeX
  did, so a wrong belief about TeX cannot be written into both the code and its test.
- **The post-build check, not emulation** — no parser recovers as bibtex does; bibtex's own output
  is compared instead.

## 10. Scope: what this PR does not decide

- A finding for a `filecontents` block without `[overwrite]` (#176).
- `\includeonly` and `\endinput`: every include is read, so a block in an excluded file still is.
- An `\input` inside a macro's body: the assembly expands no macro, so that file is not read (#177).
- A `filecontents` block whose file name a macro other than `\jobname` builds: matched to no
  declaration; the post-build check names the database bibtex read.
- multibib's `\newcites` and bibunits' `\putbib`.
- biber: an extensionless `\addbibresource{refs}` is not measured; a remote resource is not fetched.
- kpathsea's search tree: a `.bib` found only there is `missing` statically; the post-build check
  names it.
- `eslint --cache`: `bib/reachable-entry` depends on files other than the linted one, so a cached
  result can be stale after a `.bib` changes. `paperlint lint` does not cache.
- Reading past `\end{document}` in `headings.ts`, `layout.ts` and `rendered.ts` (#178).
- Two copies compared where bibtex and the parser differ in what no check reads: a `@preamble` is
  compared as written, so a `@string` it uses that is redefined between the copies is not seen; and
  `keywords` are compared as the parser splits, dedupes and sorts them — it does so for that field
  name unconditionally, with no option to keep it as written.
- Q3 (one projection of the live text, replacing `paper-typography`'s `skippedRanges` and
  `texToMdast`'s own parse), the hooks, the build's `.fls` facts and an enforcement rule for Q1–Q3:
  later PRs.
