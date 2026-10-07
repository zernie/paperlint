# Paper sources — one owner for "which files, which bibliography"

As built in PR #174. Everything that asks which files make up a paper, or which bibliography TeX reads,
asks one module; nothing reads a `.bib` but one adapter. TeX's own answer for each case is recorded
beside the case (§8), and the module is tested against that, not against prose.

## 1. TeX is the one source of truth

Which files make up the paper, and which bibliography it uses, are answered by TeX, from the last
build — never by reading TeX by hand. There is no static decision: no declaration scan, no
`filecontents` runs, no include ordering. Lint never runs TeX; it reads what the build recorded.

**What the build records — `_build/sources.json`, schema 1.** Written by the compile step, after
the last pdflatex pass and bibtex, from TeX's own files in the paper directory:

| field     | from                      | holds                                                                                                                                                                               |
| --------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputs`  | `paper.fls` (`-recorder`) | every file in the paper directory TeX read, in first-read order, each `role: preamble` or `body` — before or after TeX opens `paper.aux` for writing (`\begin{document}`, measured) |
| `written` | `paper.fls` `OUTPUT`      | the `.bib` files TeX wrote (a `filecontents` block)                                                                                                                                 |
| `bibdata` | `paper.aux` `\bibdata{…}` | the databases bibtex was told to read, after every switch, macro and `\input`                                                                                                       |
| `bibtex`  | `paper.blg`, `paper.bbl`  | the database files bibtex opened, the keys it typeset, its exit and errors                                                                                                          |
| `sha256`  | the files themselves      | every `inputs` file and every opened database TeX did not write, by path and bytes                                                                                                  |

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

| consumer                                                         | reads                                                               | no record / stale                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `bib/reachable-entry`, `paper/author-list`, `paper/cite-exists`  | the entries of the databases bibtex opened, through the `BibReader` | silent (`paper/sources-fresh` speaks)                             |
| `paper/refs-checked`                                             | keys bibtex typeset that the reader did not read (`%`, `@comment`)  | silent                                                            |
| `extract-ref-facts`, `bib-authors`, `verify-cites` (dir, `.tex`) | `bibliographyAt` → the record's databases                           | refused: "run `npx paperlint build` first"                        |
| `bibliographyAt` with a `.bib`                                   | that file alone, unchanged                                          | —                                                                 |
| `paperlint lint`'s files (`paper-includes.ts`), `paper-context`  | the `body` `.tex` files of `inputs`                                 | `paper.tex` only; `paper/sources-fresh` says the rest is unlinted |

An entry in a `.bib` TeX wrote is reported at the `filecontents` block whose body bibtex takes as
the same database (`sameDatabase`) — a lookup of where the text stands, not a decision of what TeX
reads; an entry in any other `.bib` at the top of `paper.tex`, `refs.bib:12:1:` first.

**What stays syntactic.** The prose rules read `paper.tex` with its includes spliced (`readPaper`,
as on main): a projection of the text for rules to read in context, which decides nothing above.
It still resolves `\input{x}` itself; restricting it to the files `inputs` lists is a follow-up if
even that second answer must go.

**Ground truth.** `test/e2e/tex/paper-sources.e2e.ts` runs the build's own record step on each
planted paper and snapshots its `sources.json` as `tex-truth.json`; the unit tests run the
consumers on the fixture with that record. TeX is the expectation and the input at once.

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

**The safety net.** When the static answer has no database at all but the build's bibtex opened
some, the step still records what bibtex read, and `paper/refs-checked` names those databases. A
paper whose bibliography the static reading cannot see (#177, #181) is loud after a build, not
silent.

## 8. Ground truth — `tex-truth.json`

Each planted paper of `fixtures/paper-sources/` carries `tex-truth.json`, written by TeX:
`test/e2e/tex/paper-sources.e2e.ts` builds it with `pdflatex -recorder` and `bibtex` and records
the files opened, the `.bib` files written, the databases bibtex read, the citations, the entries
typeset, and bibtex's exit code and errors. `-u` re-records; a TeX that answers differently fails.
`src/paper-sources.test.ts` compares the module with those files without TeX, and names every key
the post-build check must name (`UNSEEN`, `UNSEEN_DATABASES`). The files are the numbers; this
document does not copy them.

## 9. Decisions

- **Tracked files decide which files are the paper's; their working-tree bytes are read** — the
  author's draft is what TeX builds here, and a build's untracked leftover must not change the answer.
- **"Tracked" asks git's index through a port** (`TrackedFiles`) — "a file exists" would count a
  build's leftover as the paper's; outside a work tree every file counts.
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
