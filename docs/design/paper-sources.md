# Paper sources — TeX answers "which files, which bibliography"

As built in PR #174. Everything that asks which files make up a paper, or which bibliography TeX reads,
reads the record the last build wrote from TeX's own files; nothing in paperlint reads TeX source to
decide either, and nothing reads a `.bib` but one adapter. TeX's own answer for each planted paper is
recorded beside it (§8), and the consumers are tested against that, not against prose.

## 1. TeX is the one source of truth

Which files make up the paper, and which bibliography it uses, are answered by TeX, from the last
build — never by reading TeX by hand. There is no static decision: no declaration scan, no
`filecontents` runs, no include ordering. Lint never runs TeX; it reads what the build recorded.

**What the build records — `_build/sources.json`, schema 1.** Written by the compile step, after
the last pdflatex pass and bibtex, from TeX's own files in the paper directory:

| field     | from                      | holds                                                                                                                                                                               |
| --------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputs`  | `paper.fls` (`-recorder`) | every file in the paper directory TeX read, in first-read order, each `role: preamble` or `body` — before or after TeX opens `paper.aux` for writing (`\begin{document}`, measured) |
| `written` | `paper.fls` `OUTPUT`      | the `.bib` and `.tex` files TeX wrote (a `filecontents` block)                                                                                                                      |
| `bibdata` | `paper.aux` `\bibdata{…}` | the databases bibtex was told to read, after every switch, macro and `\input`                                                                                                       |
| `bibtex`  | `paper.blg`, `paper.bbl`  | the database files bibtex opened, the keys it typeset, its exit and errors                                                                                                          |
| `sha256`  | the files themselves      | every `inputs` file and every database bibtex opened (one TeX wrote too), by path and bytes                                                                                         |

A file TeX wrote is an input only when it is a `.tex`: a `filecontents` block that writes `body.tex` the
body `\input`s puts that text in the PDF, so the file is hashed and spliced like any other (measured:
pass 1 `OUTPUT body.tex` then `INPUT ./body.tex` after `\begin{document}`). Every other file a pass
wrote — `.aux`, `.out`, `.toc`, a block's `.bib` — is TeX's bookkeeping or a database, not an input.
The written `.tex` is not handed to ESLint as a file of its own: its words are the block's, and the
block's body is no prose to the rules, so the text is judged once, where `readPaper` splices it.

Every path is relative to the paper directory and spelled as the directory entries spell it: TeX
logs the name it opened, which on a file system that ignores case is the source's spelling, so the
record takes each segment's spelling from the disk and one paper gets one record on every platform.

A record of its own, not `references.json`: it is written by every build (the references step is
optional and may record "not checked"), it is read by rules that have nothing to do with references,
and it goes stale when the SOURCES change, not when one `.bib` does — one staleness key per file.
`references.json` keeps its verdicts, one per entry of `sources.json`'s databases, and loses its
`bibtex` field.

**Staleness.** A rule recomputes `sha256` over the files the record lists. No record, or a different
hash (a file edited, added to an `\input`, deleted), is one finding of a new rule,
`paper/sources-fresh` — "not built" / "the paper changed since the last build — run
`npx paperlint build`" — and every rule below is silent until a build records the paper again.

**The consumers.**

| consumer                                                         | reads                                                               | no record / stale                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `bib/reachable-entry`, `paper/author-list`, `paper/cite-exists`  | the entries of the databases bibtex opened, through the `BibReader` | silent (`paper/sources-fresh` speaks)                              |
| `paper/refs-checked`                                             | keys bibtex typeset that the reader did not read (`%`, `@comment`)  | silent                                                             |
| `extract-ref-facts`, `bib-authors`, `verify-cites` (dir, `.tex`) | `bibliographyAt` → the record's databases                           | refused: "run `npx paperlint build` first"                         |
| `bibliographyAt` with a `.bib`                                   | that file alone, unchanged                                          | —                                                                  |
| `paperlint lint`'s files (`paper-includes.ts`), `paper-context`  | the `body` `.tex` files of `inputs` TeX did not write               | `paper.tex` only; `paper/sources-fresh` says the rest is unlinted  |
| the prose rules' text (`readPaper`)                              | `paper.tex` with the files of `inputs` spliced where they stand     | `paper.tex` alone; `paper/sources-fresh` says the rest is unlinted |

An entry in a `.bib` TeX wrote is reported at the `filecontents` block whose body bibtex takes as
the same database (`sameDatabase`) — a lookup of where the text stands, not a decision of what TeX
reads; an entry in any other `.bib` at the top of `paper.tex`, `refs.bib:12:1:` first.

**What stays syntactic: where an include stands, and nothing else.** The prose rules read
`paper.tex` with the files of `inputs` spliced in (`readPaper`): a projection of the text for rules to
read in context, which decides nothing above. Which files are spliced is the record's answer — an
include of a file `inputs` does not list (behind `\iffalse`, or past `\end{document}`) contributes
nothing, as it did to TeX, and no include is looked for on disk. Where the macro stands in the text
is the one thing read from the text, because `.fls` records no position: files are spliced in the
order the text names them, which is the order TeX read them, each ended the way TeX ends the last
line of a file it reads (a newline when the file has none — measured: `a\input{f}b` with `f` holding
`foo` typesets "afoo b"). With no record, or a stale one, the text is `paper.tex` alone. A file the
record lists that no include macro in the text stands for (an `\input` inside a macro's body, #177)
is linted as a file of its own and is absent from the whole-paper text.

**Ground truth.** `test/e2e/tex/paper-sources.e2e.ts` runs the build's own record step on each
planted paper and snapshots its `sources.json` as `tex-truth.json`; the unit tests run the
consumers on the fixture with that record. TeX is the expectation and the input at once.

## 4. One bibtex reader

The port is `BibReader` (`src/ports/bib-reader.ts`: `read(path, text, body, inherited?)` for a block,
`readFile(path, text, inherited?)` for a `.bib`). bibtex reads a paper's databases in sequence with one
table of `@string`s, so a `@string` of `abbrev.bib` expands an entry of `refs.bib` under
`\bibliography{abbrev,refs}` (measured; in the other order bibtex warns it is undefined).
`recordedBibliography` reads the databases in the order bibtex opened them, each with the `strings` the
one before it left in force (`inherited`), and reads a block with the `@string`s its database was read
with; each database is still parsed as its own text, so each entry keeps its place in its own file.

The adapter, `src/adapters/bibtex/`, is the only code that knows `@retorquere/bibtex-parser`. It reads each database twice:

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
directory holding `paper.tex`, is the bibliography the last build's bibtex opened for that paper
(`recordedBibliography`) — for a database TeX wrote, the text of the `filecontents` block (or included
file) that holds it, so an entry stands where the author edits it. A refusal is a `BibliographyUnread`
(`missing`, `not-bib-or-tex`, `no-paper`, `not-built`, `no-database`), and `bibliographyUnreadWhy` is
its one sentence; `not-built` covers a missing, unreadable and stale record alike: run
`npx paperlint build` first. Each script keeps its own CLI frame around it.

## 6. The references a build checks

The build's references step (`src/references.ts`) checks entries, not keys: two databases may each
define a key with other metadata.

- **What is checked is `readBibliography`**: the databases the build's bibtex opened, in the order it
  opened them, each once, read by the bibtex reader — a view over `recordedBibliography`, the one reader
  of the record's databases. Without a fresh record the step checks nothing and its note names the
  reason; a database bibtex opened that is not in the paper directory (bibtex found it on its search
  path, `BIBINPUTS`) is named, not skipped. One removed after the build — a `.bib` TeX wrote, then a
  clean — makes the record stale: every database bibtex opened is hashed.
- **One verdict per entry, in order.** The `CheckReferences` port returns verdict `i` for entry `i`;
  the adapter runs verify-cites and bib-authors per entry and pairs them by position.
- **`_build/references.json`, schema 3**: `bib {sources, sha256}`, `status`, `entries`. `sources` are
  the database names as bibtex names them and `sha256` covers their text. Lint lays the verdicts on the
  entries of the same databases and reports each at its entry (`entryReports`); a record that is not one
  verdict per entry, in order, about the bytes the databases hold now, is not about this bibliography
  (`paper/refs-fresh`).

## 7. The post-build check — where bibtex reads differently

bibtex has no comment syntax and recovers from malformed text as no parser does, so the reader does
not emulate it. Each difference has an owner:

| shape                                                          | answered by                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| malformed: an entry or brace never closed, `%` inside an entry | the build — bibtex exits 2, and `paperlint build` fails with its lines |
| an entry behind `%`, or inside `@comment{…}`                   | `paper/refs-checked`, from the keys bibtex typeset                     |
| `@`, `)` or `{"}` inside a quoted field                        | the reader, which reads it as bibtex does                              |

`paper/refs-checked` names every key bibtex typeset (`paper.bbl`) that no entry of the databases it
opened has (`unseenKeys`; keys compare case-insensitively, as bibtex's do), and every database bibtex
opened that is not in the paper directory.

## 8. Ground truth — `tex-truth.json`

Each planted paper of `fixtures/paper-sources/` carries `tex-truth.json`, written by TeX:
`test/e2e/tex/paper-sources.e2e.ts` builds it with `pdflatex -recorder` and `bibtex` and snapshots the
record the build writes. `-u` re-records; a TeX that answers differently fails. The unit tests of the
consumers lay that file at `_build/sources.json` (`test/recorded-fixture.ts`). The accepted papers of
`fixtures/accepted-papers/` carry theirs the same way (`test/e2e/tex/accepted-papers-record.e2e.ts`).
The files are the numbers; this document does not copy them.

## 9. Decisions

- **The record, not a reading** — which files and databases a paper has is what TeX did on the last
  build; a static reading of the text agrees only on the cases its author thought of.
- **No record, no verdict** — a rule that needs the record is silent without a current one, and one
  rule (`paper/sources-fresh`) says so once; a stale answer is worse than none.
- **Prose rules splice only the files the record lists** — an include behind `\iffalse` contributes
  nothing; without a record the text is `paper.tex` alone and `paper/sources-fresh` says the rest went
  unlinted.
- **A lookup of where a text stands is not a decision of what TeX reads** — `filecontents` blocks are
  found in the text only to put a finding on the line that holds an entry (`sameDatabase`).
- **One verdict per entry, not per key** — a key does not identify an entry; a verdict that cannot say
  which entry it is about reports at the wrong one.
- **"Same database" is what bibtex takes** — raw bytes and the final `@string` map are a proxy that
  misses a `@string` redefined after use; the text between entries reaches no `.bbl`.
- **One `.bib` reader, fenced by lint** — three readers grew before there was one; the parser's name
  may appear in one folder only.
- **One path → bibliography function** — three scripts each resolved it by hand, each with its own
  refusals.
- **Recorded TeX truth, not hand-written expectations** — the consumers' tests compare with what TeX
  did, so a wrong belief about TeX cannot be written into both the code and its test.
- **The post-build check, not emulation** — no parser recovers as bibtex does; bibtex's own output
  is compared instead.

## 10. Scope: what this PR does not decide

- A finding for a `filecontents` block without `[overwrite]` (#176).
- A listed body file that no include macro in the text stands for (an `\input` inside a macro's body,
  #177): linted as a file of its own, absent from the whole-paper text.
- `eslint --cache`: `bib/reachable-entry` depends on files other than the linted one, so a cached
  result can be stale after a `.bib` changes. `paperlint lint` does not cache.
- Reading past `\end{document}` in `headings.ts`, `layout.ts` and `rendered.ts` (#178).
- A file a `filecontents` block writes under another extension than `.tex` (a `.pgf` the body
  `\input`s) is not an input: its text reaches the PDF, but the record neither hashes nor splices it.
- A database TeX wrote is read from the file it left on disk, which the record does not hash: edited
  after a build, that file is not detected as stale.
- Two copies compared where bibtex and the parser differ in what no check reads: a `@preamble` is
  compared as written, so a `@string` it uses that is redefined between the copies is not seen; and
  `keywords` are compared as the parser splits, dedupes and sorts them — it does so for that field
  name unconditionally, with no option to keep it as written.
- Q3 (one projection of the live text, replacing `paper-typography`'s `skippedRanges` and
  `texToMdast`'s own parse), the hooks, and an enforcement rule for Q1–Q3: later PRs.
