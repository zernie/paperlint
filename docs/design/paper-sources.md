# Paper sources — one owner for "which files, which bibliography, which text"

Design study, 2026-10-06. Branch `claude/paper-sources-design`, cut from
`claude/drop-markdown-papers` at `097ea3f`. **No production code changes.** Every number below was
measured on that commit; the commands are in [Appendix B](#appendix-b--how-the-measurements-were-taken).

## 0. Summary

**The class.** Many places in paperlint answer three questions for themselves:

- **Q1 — which files make up a paper.** `paper.tex` and what its `\input` / `\include` / `\subfile`
  bring in, subfolders included.
- **Q2 — where the bibliography is.** An inline `filecontents` block, a `.bib` on disk, or neither.
- **Q3 — which bytes are live.** Prose a reader sees, and markup TeX executes, as opposed to
  comments, `\iffalse … \fi`, verbatim, `filecontents` bodies, macro definitions and the preamble.

Five Codex rounds on PR #171 found this class one copy at a time: round 3, the inline bibliography
in `extract-ref-facts` (fixed in `1be5300`) and captions read only from `figures/*.tex` (`bf2a8e1`);
round 4, captions inside comments (`097ea3f`); round 5, still open, `bib-authors.mjs` choosing a
`.bib` before the inline one (comment 4198299174), and `paper-status-gates` missing
`sections/*.tex` (comment 4198299188).

**The headline finding is about Q2, and it changes what "fixing" round 5 means.** The order these
reviews converged on — inline `filecontents` first, then `refs.bib`, then `build/custom.bib` — is
not what TeX does. LaTeX's `filecontents` does **not** overwrite a file that already exists unless
it is given `[overwrite]` (LaTeX News 30: _"by default nothing is written if a file with the given
name exists anywhere in the search tree"_; measured below). On four planted variants, TeX's own
choice agrees with `paperlint build` **once**, with `extract-ref-facts` **once**, and with the
"wrong" `bib-authors.mjs` **three times**. Doing what comment 4198299174 asks — inline first in
`bib-authors` too — would make it agree with the build and disagree with TeX in the most common
state of a paper: one built at least once from a block without `[overwrite]`.

**Inventory.** 33 sites answer Q1, Q2 or Q3 themselves (table in §1.3): 20 of them are wrong on at
least one planted fixture. A prototype lint rule (§4) finds 53 occurrences in 23 non-test files of
the current tree, and catches every site from rounds 3–5 on the code as it stood before each fix.

**The design.** One module, `paperSources(dir)` (§3): `src/domain/paper-sources.ts` decides (pure),
`src/paper-sources.ts` reads through the existing `Files` and `LatexReader` ports. It returns the
paper's files with their roles, the bibliography as a discriminated union **decided by TeX's own
rules** (including the state "the inline block is shadowed by a stale file"), and the live text of
each file from **one** projection — the parse tree that already cuts `\iffalse`. A post-build fact,
TeX's own `.fls` and `.aux`, lets a rule check the static answer against what TeX actually read.
A custom rule forbids answering any of the three outside the module. It lands as one PR, tests
first; it rides on #171's existing major version bump.

**Two consumers the module has to serve, besides paperlint's own code.** (a) A paper's own checks:
a consumer project's per-paper build script used to run six checks after the PDF existed (a
delivered-PDF number check, a hard results gate, an uncited-entry check, TeXtidote, prose-lint on
the PDF text, an artifact-URL check), and the move to `paperlint build` dropped all six, because a
paper has no way to declare a check. §3.9 adds a `checks` key in the paper's `paperlint.json`, run
by the build after the PDF exists, fed from the module; three of the six become built-in rules
instead. (b) A non-JavaScript consumer: the same project carries a hand-written regex LaTeX→markdown
converter in a Python reproduction script, which splits `\cite{a, b}` without trimming and crashes
on the space. §3.10 makes the module's answer a JSON file the build writes and a shipped script
prints, so such converters can be deleted.

## 1. Inventory

### 1.1 Method

1. Searched by **mechanism**, not by name: every non-test `.ts` / `.mjs` / `.sh` under `src/`,
   `lib/`, `hooks/`, `eslint-rules/` and `skills/` (167 files) for path literals naming `.tex` /
   `.bib`, regexes over `filecontents`, `\input`, `\caption`, `\cite` or `%`, calls to
   `getParser`, and readers of `sourceCode.raw`. Each hit was read in context.
2. Ran a prototype of the proposed lint rule (Appendix A) over the same tree and over the pre-fix
   versions of the round 3 and round 4 files.
3. Built planted fixtures and established the ground truth **with TeX itself** — `pdflatex
-recorder`, `bibtex`, the `.fls`, `.blg` and `pdftotext` of the PDF — then ran every suspicious
   site on them, through its real entry point (CLI, ESLint, or the hook runtime with a real
   payload).

### 1.2 The canonical answers that exist today

| question | owner today                                                                                                                                                                                                                               | agrees with TeX?                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | `includesOf` (src/adapters/latex/includes.ts:50), `assemblePaper` (src/domain/paper-source.ts:185), `readPaper` / `bodyFiles` (src/tex-paper.ts:35, :70), `paperBodies` (src/paper-includes.ts:51)                                        | **yes** on every fixture: comments, `\iffalse`, macro bodies and `versions/` are excluded, `sections/` is included                             |
| Q2       | `bibliographyOf` (src/references.ts:76) over `bibRange` (eslint-rules/paper-typography.ts:95); after a compile, `bibInput` (src/build.ts:296) reads `\bibdata` from `paper.aux`                                                           | `bibliographyOf`: **1 of 4** variants. `bibInput`: yes by construction (it reads what bibtex reads), but only the build's latexmk loop uses it |
| Q3       | **two projections.** The parse tree in `src/adapters/latex/` (cuts `\iffalse` at parse, `conditionals.ts`; prunes `hidden.ts`) and the ESLint language's `texToMdast` (eslint-rules/latex-language.ts:306), which does not cut `\iffalse` | the tree: yes. `texToMdast`: no for `\iffalse`, so every rule and script built on it inherits that                                             |

### 1.3 Every site

"Agrees" is against TeX's ground truth on the fixtures of §1.4, not against the order the reviews
assumed. `✗` = measured wrong on a fixture; `≈` = agrees today but holds its own copy of the fact
(a drift risk, not a defect); `✓` = consumer of a canonical owner.

| #   | site                                                                                                                                                                                                                                          | Q      | what it does                                                                                                                                        | agrees                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `src/references.ts:68-86` `bibliographyOf`                                                                                                                                                                                                    | Q2     | inline block of `paper.tex`, else `refs.bib`; never reads `\bibliography{…}`, ignores `[overwrite]`                                                 | ✗ v1 v3 v4                                                                    |
| 2   | `eslint-rules/paper-typography.ts:95-105` `bibRange`                                                                                                                                                                                          | Q2, Q3 | first regex match of a `filecontents` block writing a `.bib`; not comment-aware                                                                     | ✗ v4 (returns the commented-out block)                                        |
| 3   | `src/reference-rules.ts:74, :93, :192-201`                                                                                                                                                                                                    | Q2     | consumes #1; `entryOffset` re-finds `@type{key,` by regex; decides "external" by `source !== "paper.tex"`                                           | ✗ inherits #1                                                                 |
| 4   | `eslint-rules/bib-reachable-entry.ts:52`                                                                                                                                                                                                      | Q2     | judges only the inline block (`bibRange(raw)`); a `.bib` on disk is never read                                                                      | ✗ v1 (judges the block TeX does not read), v3 (silent on `paper.bib`)         |
| 5   | `skills/paper-pipeline/scripts/extract-ref-facts.mjs:406-428` `SOURCE_ORDER` / `resolveSource`                                                                                                                                                | Q2     | `paper.tex` if `bibRange` finds a block → `refs.bib` → `build/custom.bib` (nothing writes the last one any more)                                    | ✗ v1 v3; v4 returns `paper.tex` with **zero entries and exit 0**              |
| 6   | `skills/verify-citations/scripts/bib-authors.mjs:54-107` `bibTextFrom`                                                                                                                                                                        | Q2     | in a directory: `paper.bib`, else the only `.bib`, else `paper.tex`; in a `.tex`: its own copy of the `filecontents` regex, then sibling `refs.bib` | ✗ v2 only (round 5 comment 4198299174)                                        |
| 7   | `skills/verify-citations/scripts/verify-cites.mjs:1215-1219`                                                                                                                                                                                  | Q2     | reads the path it is given; `.bib` by extension                                                                                                     | ✓ no answer of its own                                                        |
| 8   | `hooks/paper-status-gates.hook.mjs:121-124, :154`                                                                                                                                                                                             | Q1     | `<root>/<paper>/[^/]*\.tex$` — one level only                                                                                                       | ✗ silent on `sections/intro.tex` (round 5 comment 4198299188; same on `main`) |
| 9   | `hooks/paper-skills-nudge.hook.mjs:100, :133`                                                                                                                                                                                                 | Q1     | any `.tex` under the root                                                                                                                           | ✗ fires on `versions/…review.tex`, a frozen snapshot                          |
| 10  | `hooks/paper-skills-nudge.hook.mjs:115` (message text)                                                                                                                                                                                        | Q2     | tells the agent "refs.bib is overwritten on build"                                                                                                  | ✗ true only with `[overwrite]`                                                |
| 11  | `hooks/paper-edit-guard.hook.mjs:377-400` `isPaperSource` / `isFrozenSnapshot`                                                                                                                                                                | Q1, Q2 | any `.tex` under the root except `versions/*`; a `.bib` is not a source                                                                             | ≈ for `.tex`; ✗ `sed -i … refs.bib` allowed although TeX reads it (v1, v3)    |
| 12  | `skills/grade-paper-writing/prose-lint.mjs:368-375` `captions`                                                                                                                                                                                | Q3     | regex `\\caption\{` over raw text, filtered by `texToMdast`                                                                                         | ✗ measures a caption inside `\iffalse`; misses `\caption[short]{…}`           |
| 13  | `skills/grade-paper-writing/prose-lint.mjs:347-358` `figureFiles`                                                                                                                                                                             | Q1     | for a rendered `.txt`: every `figures/*.tex` beside it                                                                                              | ≈ (the `.txt` path has no `paper.tex` to ask; should still ask the module)    |
| 14  | `skills/grade-paper-writing/prose-lint.mjs:446, :484`                                                                                                                                                                                         | Q1     | "is this argument a paper source" = `endsWith(".tex")`                                                                                              | ≈                                                                             |
| 15  | `skills/harden-paper/check-numbers.sh:17-29`                                                                                                                                                                                                  | Q1, Q3 | reads only `paper.tex`; awk drops whole-line `%` and the `filecontents` block                                                                       | ✗ misses `42\%` in `sections/intro.tex`                                       |
| 16  | `skills/harden-paper/check-release-claims.sh:18-23`                                                                                                                                                                                           | Q1, Q3 | greps only `paper.tex`; drops whole-line comments                                                                                                   | ✗ misses "We release the harness" in `sections/intro.tex`                     |
| 17  | `eslint-rules/tex-build.ts:152-170` `future-promise`                                                                                                                                                                                          | Q3     | own `%` stripper per line; reads preamble, verbatim, `filecontents`, `\iffalse`                                                                     | ✗ fires on a promise inside `\iffalse`                                        |
| 18  | `eslint-rules/tex-build.ts:48-49` `REVIEW_MODE_RE`                                                                                                                                                                                            | Q3     | `^[^%\n]*` prefix as its comment model                                                                                                              | ≈ (a `\documentclass[review]` inside `\iffalse` would count; not planted)     |
| 19  | `eslint-rules/tex-build.ts:261-275` `acm-frontmatter-override`                                                                                                                                                                                | Q3     | same per-line `%` stripper                                                                                                                          | ≈ (same `\iffalse` exposure as #17; not planted)                              |
| 20  | `eslint-rules/paper-typography.ts:123-135` `skippedRanges` (section-word, figure-ref-style)                                                                                                                                                   | Q3     | comments from the projection + `bibRange` + cleveref definitions                                                                                    | ✗ `section-word` fires inside `\iffalse` **and inside `verbatim`**            |
| 21  | `eslint-rules/paper-typography.ts:240-249` leading-zero walk                                                                                                                                                                                  | Q3     | its own `getParser().parse` and its own hidden-environment list                                                                                     | ✗ fires on `.05` inside `\iffalse` (verbatim correctly skipped)               |
| 22  | `eslint-rules/latex-language.ts:306` `texToMdast`, `:236-237` `CODEISH`                                                                                                                                                                       | Q3     | the ESLint projection: blanks comments, preamble, code environments, `filecontents`                                                                 | ✗ no `\iffalse` (root cause of #12, #17, #20)                                 |
| 23  | `src/build.ts:46, :190-214` `parseTex` / `documentclassOf`                                                                                                                                                                                    | Q3     | its own unified-latex parse of `\documentclass` (the adapter has `documentClassOf`)                                                                 | ≈ (no `\iffalse` cut; not planted)                                            |
| 24  | `src/build.ts:92` `PAPER_MARKERS` vs `lib/paper-config.ts:50` `PAPER_MARKERS`                                                                                                                                                                 | Q1     | "is this directory a paper": build's list has `paperlint.json`, lib's does not                                                                      | ✗ two answers (adjacent question: paper identity)                             |
| 25  | `src/build.ts:95` `MAIN`, `src/new-paper.ts:49` `SOURCE_FILE`, `src/references.ts:80`, `src/paper-includes.ts:56, :78`                                                                                                                        | Q1     | the main file's name, spelled in five places                                                                                                        | ≈                                                                             |
| 26  | `basename(context.filename) !== "paper.tex"` in `src/register-bands.ts:263`, `src/tex-venue-rules.ts:516, :602`, `src/talk-rules.ts:648`, `src/venue-rules.ts:830`, `eslint-rules/pdf-last-page-balance.ts:264`, `src/reference-rules.ts:192` | Q1     | "is this file the paper's main file" — seven copies                                                                                                 | ≈                                                                             |
| 27  | `src/cli.ts:435, :494`, `eslint-rules/papers.ts:145`                                                                                                                                                                                          | Q1     | ESLint globs for the main file and the fragments                                                                                                    | ≈ (globs are legitimately ESLint's input; see allow-list)                     |
| 28  | `src/paper-includes.ts:39` `isFragment`                                                                                                                                                                                                       | Q1     | only `.tex` includes go to ESLint (#153)                                                                                                            | ≈ (a decision, belongs in the module)                                         |
| 29  | `src/build.ts:296-313` `bibInput`                                                                                                                                                                                                             | Q2     | post-compile: databases from `\bibdata` in `paper.aux`, hashed for the latexmk loop                                                                 | ✓ TeX's answer                                                                |
| 30  | `eslint-rules/paper-context.ts:20-25`                                                                                                                                                                                                         | Q1     | carries `bodyFiles`' answer to the rules in `settings`                                                                                              | ✓                                                                             |
| 31  | `src/paper-prose.ts:43`, `src/register.ts:134`, `src/register-bands.ts:243`, `src/claim-provenance.ts:207`, `src/tex-venue-rules.ts:503, :610`, `src/heading-case.ts:247` (linted per fragment)                                               | Q1, Q3 | consumers of `readPaper` / the tree                                                                                                                 | ✓                                                                             |
| 32  | `src/adapters/latex/*` (`includes.ts:50`, `conditionals.ts`, `hidden.ts:20-37`, `prose.ts`)                                                                                                                                                   | Q1, Q3 | the tree-side owner                                                                                                                                 | ✓ (owner)                                                                     |
| 33  | outside this repo: a consumer project's hash-sweep hook                                                                                                                                                                                       | Q1     | hashes `<paper>/paper.tex` only, to catch writes made past Edit/Write                                                                               | ✗ a `sections/*.tex` write made by `python3 - <<PY` is not seen               |

**Count: 33 sites; 20 measured or shown wrong (✗), 9 holding a copy of a fact (≈), 4 consumers or
owners (✓).** Two more defects surfaced that are not this class but sit on the same lines and
belong in the same PR, because the module replaces the code they are in: the optional-argument
caption (#12) and `section-word` inside `verbatim` (#20).

### 1.4 Fixtures and the divergences, measured

**Fixture P** (`papers/p1/`): `paper.tex` with an inline `filecontents*{refs.bib}` (no
`[overwrite]`) and a stale `refs.bib` beside it; `\input{sections/intro}`; `% \input{sections/dead}`;
`\iffalse \input{sections/parked} … \fi` holding a 57-word caption and the sentence "The harness
will be released at camera-ready."; a commented `% \cite{commented2020}` and promise; a figure with
`\caption[Short]{…57 words…}`; `sections/intro.tex` with `42\%`, "We release the harness", and a
57-word caption; `sections/dead.tex` and `sections/parked.tex` each with a 57-word caption; and
`versions/2026-01-01-review.tex`.

**TeX's ground truth for P** (`pdflatex -recorder`, `bibtex`, `pdftotext`):

```
INPUT paper.tex
INPUT sections/intro.tex            <- not dead.tex, not parked.tex
Database file #1: refs.bib          <- the STALE file; the inline block was not written:
LaTeX Info: File `refs.bib' already exists on the system.
            Not generating it from this source.
typeset captions: "Included caption …", "Optional-arg caption …"   (two)
"will be released at camera-ready": not typeset
```

**Bibliography variants** (each built with `pdflatex` + `bibtex`; "TeX" is `.blg`'s database and
`.bbl`'s items):

| variant                                                               | TeX reads                                            | `bibliographyOf` (build) | `extract-ref-facts`              | `bib-authors` |
| --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ | -------------------------------- | ------------- |
| v1: `filecontents*{refs.bib}` + stale `refs.bib` (as P)               | `refs.bib` (stale; `\cite{inline2024}` is undefined) | inline ✗                 | inline ✗                         | `refs.bib` ✓  |
| v2: same with `[overwrite]`                                           | inline (`refs.bib` rewritten)                        | inline ✓                 | inline ✓                         | `refs.bib` ✗  |
| v3: no block, `\bibliography{paper}`, `paper.bib`                     | `paper.bib`                                          | null ✗                   | null ✗                           | `paper.bib` ✓ |
| v4: block **commented out** (`% \begin{filecontents*}…`) + `refs.bib` | `refs.bib`                                           | commented block ✗        | `paper.tex`, 0 entries, exit 0 ✗ | `refs.bib` ✓  |

Note on v1: the build's answer matches the author's _intent_ (the block is where they edit), and
that is exactly why it is dangerous — paperlint checks the references the author wrote while the
PDF prints the ones from the stale file. The right verdict for v1 is neither "inline" nor
"refs.bib"; it is a finding: _the inline bibliography is not what TeX reads_.

**Hooks**, driven through `vigiles hook-runtime run-program` with real payloads, `paperlint.json`
`{}`:

| path edited / command                                       | `paper-status-gates` | `paper-skills-nudge` | `paper-edit-guard`  |
| ----------------------------------------------------------- | -------------------- | -------------------- | ------------------- |
| `papers/p1/paper.tex` (Edit)                                | fires                | fires                | —                   |
| `papers/p1/sections/intro.tex` (Edit)                       | **silent** ✗         | fires                | —                   |
| `papers/p1/versions/2026-01-01-review.tex` (Edit)           | silent               | **fires** ✗          | —                   |
| `sed -i s/a/b/ papers/p1/sections/intro.tex`                | —                    | —                    | deny (RC=2) ✓       |
| `sed -i s/a/b/ papers/p1/versions/…review.tex`              | —                    | —                    | allow ✓             |
| `sed -i s/a/b/ papers/p1/refs.bib`                          | —                    | —                    | allow (✗ for v1/v3) |
| `python3 - <<'PY' … open('…/paper.tex','a') … PY`           | —                    | —                    | allow (hole 1)      |
| `node -e "require('fs').appendFileSync('…/paper.tex','x')"` | —                    | —                    | allow (hole 1)      |
| `git checkout HEAD~1 -- papers/p1/paper.tex`                | —                    | —                    | allow               |

**Q3 sites on P and on a small `\iffalse` / `verbatim` file:**

```
prose-lint --flags-only P/paper.tex   (RC=1, 2 findings)
  paper.tex: caption sentence of 59 words — "Parked caption …"        <- inside \iffalse: not typeset
  sections/intro.tex: caption sentence of 59 words — "Included caption …"
  (the typeset "Optional-arg caption" is not reported: \caption[Short]{…} never matches)
tex/future-promise on P/paper.tex
  14:13 «will be released at camera-ready»                            <- line 14 is inside \iffalse
paper/leading-zero, paper/section-word on: \iffalse … .05 in \S\ref{sec:a} … \fi + verbatim with \S\ref{b}
  5:15 leading-zero, 5:22 section-word                                 <- inside \iffalse
  8:10 section-word                                                    <- inside verbatim
check-numbers.sh P / check-release-claims.sh P
  (no number lines) / (no release-verb lines matched)                  <- both lines are in sections/intro.tex
```

The canonical tree-side functions on the same P: `bodyFiles` → `['sections/intro.tex']`;
`paperProse(...).files` → `['paper.tex', 'sections/intro.tex']`; the body contains neither
"released" nor "Parked". The tree is right; the copies are not.

## 2. Prior art and our own past decisions

**Ours** (read before proposing; what each one constrains):

- `CLAUDE.md` rule 2 (a check over an AST is a lint rule), rule 4 (empty input is not clean — v4's
  silent zero violates it), rule 6/10 (no cwd, one owner for _where_), rule 8 (no regex in a block
  comment). The install-path-literals rule (`eslint-rules/install-path-literals.ts`) is the
  precedent for §4: a fact with one owner, held by a rule that flags every other place naming it.
- `src/CLAUDE.md`: hexagonal on two axes; domain is pure, app takes ports, no I/O defaults; parse at
  the boundary into types that cannot hold an invalid state. The module must sit on that grid.
- `src/domain/paper-source.ts` header: _"No macro is expanded … a file that cannot be found is left
  out and named in `missing`."_ Kept as is: this design adds roles and the bibliography, not
  expansion.
- `eslint-rules/latex-language.ts` known boundaries #4 ("one file at a time" — solved by
  `paper-includes.ts`, #144) and #10 ("nested `filecontents` untested"). The projection is called
  "a SECOND TRUTH about the document" in its own header; §3.4 removes the third.
- `src/paper-includes.ts` (#153): only `.tex` includes are handed to ESLint. Kept, moved into the
  module as a role.
- Root `CLAUDE.md`, "Hooks ship as `.mjs`": a hook may import nothing but `vigiles/hook`; a
  duplicated constant is CHECKED by the harness (part VII), not removed. §3.6 reuses that.
- `docs/prior-art/multi-mode-tools.md`: "we need another command" is usually a missing config
  declaration. So no new CLI verb is proposed; the tool the sweep hook runs (§3.7) is a shipped
  script, like `hooks/paper-status-gates.sh`.
- `docs/prior-art/nondeterministic-checks.md`: prefer a **recorded fact** to an inferred one. §3.5
  records what TeX read.
- `skills/render-paper/SKILL.md:83-85` documents the `[overwrite]` convention; four of the build
  e2e fixtures and both `paper-typography` fixtures do not use it. The convention exists in prose
  only.
- A consumer project's own measurements of the guard's holes recommended moving its hash sweep
  into paperlint (§3.7).
- **#59 and `IGNORED_SCRIPTS`** (`src/build.ts:102`, `docs/configuration.md` "A `build.sh` … is
  IGNORED"): the build stopped running a paper's `build.sh`. #59's own target said the opposite of
  "no per-paper behaviour": _"the special cases should be declared as data or handled by an
  override"_. Declared checks (§3.9) are that data — an argv in a strict settings schema, run at a
  fixed point, never a script that replaces the build.
- `docs/prior-art/blocking-vs-advisory.md`: _severity is data on the finding; failing is the
  runner's decision_. A declared check therefore carries `severity`, not a `gate` flag.
- The facts the build already records: `_build/paper.facts.json` has `pageTexts` and `links`
  (`src/pdf-facts.ts:134-136`), and the reference check commits raw responses, never verdicts, in
  `repro/references-cache.json` (root `CLAUDE.md`, rejected `paperlint refs`). An artifact-URL check
  is the same shape as the reference check, so it reuses that shape.
- `ProsePiece` (`src/domain/tex-document.ts:147`) marks a citation as `{ kind: "owner", owner:
"citation" }` with **no keys**. Every consumer that needs the keys — an uncited-entry check, the
  consumer's converter — re-parses the LaTeX today. The keys belong in the piece.

**External** (checked 2026-10-06):

- **LaTeX kernel, `filecontents`** — LaTeX News 30
  (<https://github.com/latex3/latex2e/blob/develop/base/doc/ltnews30.tex>): _"by default nothing is
  written if a file with the given name exists anywhere in the search tree"_; `[overwrite]` /
  `[force]` write anyway; `[nosearch]` looks only in the current directory. "Anywhere in the search
  tree" matters here: the build puts paperlint's inputs directory on `TEXINPUTS`
  (`src/build.ts` `inputsStep`), so the module must resolve a `.bib` through `texSearchPath`, as
  `readPaper` already does for includes. Measured locally on TeX Live 2023 (log lines in §1.4).
- **latexmk** (manual, CTAN): _"-recorder … results in a file of extension .fls containing a list of
  the files that these programs have read and written. Latexmk will then use this file to improve
  its detection of source files"_; it is latexmk's default. The mature build tool answers Q1 by
  asking TeX after a run, not by parsing before it.
- **TexLab** (<https://github.com/latex-lsp/texlab>): _"There is no need for magic comments like
  `%!TEX root` and TexLab should figure out the dependencies of a file on its own."_ The editor-time
  tool answers Q1 statically, from the include graph. [Which macros it follows was not verified.]

The pattern: a **static** answer before the build (editor time, lint time) and a **recorded**
answer after it, from TeX itself. paperlint already has both halves — `includesOf` statically,
`bibInput` from `.aux` — and never compares them. The regret both tools document is the same one
measured here: a static answer that drifts from what TeX reads.

## 3. The design

### 3.1 One module, two layers

| file                             | layer   | holds                                                                                                                                                     |
| -------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/paper-sources.ts`    | domain  | the types; `decideBibliography` (TeX's `filecontents` rules as a pure function); `isSourcePath` (the path predicate hooks copy)                           |
| `src/paper-sources.ts`           | app     | `paperSources(dir, deps)`: reads through `Files` and `LatexReader`, parses once, returns the value                                                        |
| `src/adapters/latex/` (extended) | adapter | `liveRanges` (the one Q3 projection), `captions`, `citations`, `bibliographyDecls`, `filecontentsBlocks` — all from the tree that already cuts `\iffalse` |

The name is `paperSources` because the value answers "what is this paper made of" and nothing else:
not its settings (`readPaperSettings`), not its venue, not its build state.

### 3.2 The API

```ts
// src/domain/paper-sources.ts
export type Role =
  | "main" // paper.tex
  | "body" // included inside \begin{document}: the author's prose
  | "preamble" // included before \begin{document}: macros, not prose
  | "package-input"; // found only on paperlint's inputs path (paper-guards.tex): not the author's

export interface SourceFile {
  readonly path: AbsolutePath;
  readonly rel: string; // as the include names it, relative to the paper directory
  readonly role: Role;
  readonly lintable: boolean; // a .tex file: the only ones handed to ESLint (#153)
  readonly text: string;
}

export interface EmbeddedBib {
  readonly in: AbsolutePath; // the file holding the block (usually paper.tex)
  readonly writes: string; // the file name in the block's argument
  readonly overwrite: boolean; // [overwrite] or [force]
  readonly range: Span; // the block in `in`
  readonly body: string;
  readonly bodyStart: number;
}

export interface BibFile {
  readonly path: AbsolutePath;
  readonly text: string;
}

/** One database a `\bibliography{a,b}` / `\addbibresource{…}` declares, decided as TeX would. */
export type Database =
  | {
      readonly kind: "embedded";
      readonly name: string;
      readonly block: EmbeddedBib;
    } // block is written this run
  | { readonly kind: "file"; readonly name: string; readonly file: BibFile } // no block for it
  | {
      readonly kind: "shadowed"; // block without [overwrite], file exists: TeX reads the FILE
      readonly name: string;
      readonly block: EmbeddedBib;
      readonly file: BibFile;
    }
  | { readonly kind: "missing"; readonly name: string }; // declared, neither block nor file

export type Bibliography =
  | { readonly kind: "none" } // no \bibliography, no thebibliography
  | {
      readonly kind: "thebibliography";
      readonly in: AbsolutePath;
      readonly range: Span;
    }
  | {
      readonly kind: "databases";
      readonly databases: readonly [Database, ...Database[]];
    };

export interface PaperSources {
  readonly dir: AbsolutePath;
  readonly main: SourceFile;
  readonly files: readonly [SourceFile, ...SourceFile[]]; // main first, then includes in TeX order
  readonly missing: readonly Unread[]; // includes that resolved nowhere
  readonly assembled: PaperSource; // the existing spliced text + origin map
  readonly bibliography: Bibliography;
}

// src/paper-sources.ts
export function paperSources(
  dir: string,
  deps: PaperDeps, // { files: Files; latex: LatexReader }, the existing type
): Result<PaperSources, { readonly kind: "no-main"; readonly dir: string }>;

/** The live bytes of one file: a length-preserving projection, from the tree. */
export function live(file: SourceFile, deps: PaperDeps): LiveText;
export interface LiveText {
  readonly prose: string; // what a reader sees, blanked elsewhere (offsets kept)
  readonly markup: string; // what TeX executes: comments, \iffalse, verbatim, filecontents blanked
}

/** The paper's prose as a structure, from the tree — the one Q3 answer a consumer reads. */
export function prose(sources: PaperSources, deps: PaperDeps): PaperProse;

// src/domain/tex-document.ts, the mark pieces gain what they mark:
/** A citation key as written, trimmed, non-empty; minted only by the adapter (`Opaque`). */
export type CiteKey = Opaque<string, "CiteKey">;
export type ProsePiece =
  | { readonly kind: "text"; readonly segment: Segment }
  | {
      readonly kind: "citation";
      readonly command: string; // cite, citep, textcite, …
      readonly keys: readonly [CiteKey, ...CiteKey[]]; // `\cite{a, b}` → ["a", "b"]
      readonly span: Span;
    }
  | { readonly kind: "reference"; readonly label: string; readonly span: Span }
  | { readonly kind: "link"; readonly url: string; readonly span: Span }
  | { readonly kind: "math"; readonly tex: string; readonly span: Span };

export interface PaperProse {
  readonly passages: readonly Passage[]; // body, abstract to back matter, as today
  readonly headings: readonly Heading[]; // level, title, label, file, line
  readonly captions: readonly Caption[]; // `\caption[short]{long}` — both, from the parser
  readonly tables: readonly Table[]; // rows of cells as text, with caption and label
  readonly emphasis: readonly Emphasis[]; // the existing `bodyEmphasis`
  readonly citations: readonly Citation[]; // every live \cite / \nocite, keys parsed
  readonly links: readonly Link[]; // every live \url / \href target
}
```

`CiteKey` is the round-5-shaped bug made unrepresentable: the split and the trim happen once, in the
adapter, where the parser hands over the argument; a key with a space in it cannot be constructed,
so no consumer can crash on one. `tables` is new to the adapter (the prose walk skips floats today);
it is what the consumer's converter hand-parses.

**Parsed once at the boundary.** `paperSources` is the only function that reads `paper.tex`, an
include or a `.bib`; everything downstream takes the value. Its states are a union, so a consumer
of `bibliography` has to say what it does with `shadowed` and `missing` — the `switch` is checked
exhaustive by `switch-exhaustiveness-check`, already on in this repo. Today's
`Bibliography | null` lets every caller decide on its own what null means; that is how v3 became
"no bibliography — nothing to check".

### 3.3 Q2: the decision is TeX's, written down once

`decideBibliography(decls, blocks, exists)` — `decls` are the `\bibliography` / `\addbibresource`
names in **live** markup, `blocks` the live `filecontents` blocks, `exists(name)` asks the TeX
search path:

| declared `X`            | live block writing `X.bib` | `[overwrite]` | `X.bib` exists | result                                                             |
| ----------------------- | -------------------------- | ------------- | -------------- | ------------------------------------------------------------------ |
| yes                     | yes                        | yes           | any            | `embedded`                                                         |
| yes                     | yes                        | no            | no             | `embedded` (first build writes it)                                 |
| yes                     | yes                        | no            | yes            | **`shadowed`** — TeX reads the file; finding `bib/inline-shadowed` |
| yes                     | no                         | —             | yes            | `file`                                                             |
| yes                     | no                         | —             | no             | `missing` — finding (the build will fail)                          |
| none, `thebibliography` | —                          | —             | —              | `thebibliography`                                                  |
| none                    | any                        | —             | —              | `none` (a block nothing declares is a stray file write)            |

Every Q2 consumer then reads **the text TeX reads**: for `shadowed`, the file; the finding tells the
author their edits to the block are not in the PDF and that `[overwrite]` (or deleting the file)
fixes it. `bib-authors`, `extract-ref-facts`, the reference check and `bib/reachable-entry` all
answer from the same value, and an entry's line points into whichever file holds it — the block's
lines in `paper.tex` for `embedded`, the `.bib` for `file` and `shadowed`.

### 3.4 Q3: one projection

The tree in `src/adapters/latex/` already does the hard parts (`\iffalse` cut at parse time,
comments as nodes, definitions and code environments pruned). The proposal:

1. The adapter gains `liveRanges(parsed)` → the dead spans (comments, `\iffalse` branches,
   verbatim-like environments, `filecontents` bodies, definition bodies) and, separately, the
   non-prose spans (preamble, math, key arguments). `LiveText` is built from them.
2. `texToMdast` is rebuilt on `parseLatex` and `liveRanges` instead of its own `getParser()` call,
   so the ESLint projection gets `\iffalse` for free and stays length-preserving. This fixes #12,
   #17, #20 at the root.
3. `paper-typography` drops `skippedRanges` and its own walk (#20, #21): it reads `LiveText.markup`
   for markup rules and the tree's runs for `leading-zero`.
4. `tex-build`'s per-line `%` strippers (#17-19) read `LiveText.markup`.
5. `prose-lint` asks the tree for captions (`LatexReader.captions`, optional argument handled by
   the parser's signature for `\caption`), not a regex (#12).
6. `check-numbers.sh` and `check-release-claims.sh` (#15, #16) become TypeScript reading
   `paperSources` (the repo's TypeScript rule; a shell script cannot ask the module).

### 3.5 Static answer vs recorded answer

`paperlint build` adds `-recorder` to `PDFLATEX_FLAGS` and, after the last pass, records in
`_build/sources.json` (§3.8) the local files from `paper.fls` and the databases from `\bibdata`
(already parsed by `bibInput`), beside the static answer. A rule `paper/sources-agree` (on `paper.tex`, like the reference rules)
compares that record with `paperSources(dir)` and reports any file TeX read that the static answer
lacks, or the other way round. This is the seam the root `CLAUDE.md` already prescribes — _a script
produces facts into a JSON file, and ESLint judges that file_ — and it is the only check that will
notice the next way the static answer drifts from TeX (an `\import`, `\includeonly`, a macro-built
path), instead of waiting for a reviewer to find it.

### 3.6 Who may import what

| caller                                            | how it reaches the module                                                                                                | why                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/*.ts` (app), `src/cli.ts`                    | relative import                                                                                                          | app → app is allowed by `boundaries/dependencies`                                                                                                                                                                                                |
| `src/adapters/*`                                  | never                                                                                                                    | an adapter may not import app; the adapter is the module's dependency, not its user                                                                                                                                                              |
| `eslint-rules/*.ts`                               | `#src/paper-sources` (and `#src/domain/paper-sources` for types)                                                         | `boundaries` covers only `src/**`; `#src/*` resolves to the `.ts` under `--conditions=paperlint-source` and to `dist/*.js` when installed                                                                                                        |
| `skills/**/*.mjs`                                 | `#src/paper-sources`                                                                                                     | already the pattern (`prose-lint.mjs` imports `#src/paper-prose`); in a consumer it resolves to `dist/`, which `files` ships                                                                                                                     |
| a consumer's own code (e.g. its sweep)            | a new subpath export `"./paper-sources": { "types": "./dist/paper-sources.d.ts", "default": "./dist/paper-sources.js" }` | the catch-all `"./*": "./*"` would hand out the raw `.ts`, and Node does not strip types under `node_modules`; the published build is the contract                                                                                               |
| `hooks/*.hook.mjs`                                | **nothing**; a verbatim copy of `isSourcePath`, checked by the harness                                                   | a hook may import only `vigiles/hook` (capability surface; root `CLAUDE.md`). `hooks.harness.ts` part VII already checks copied constants; a new part runs one case table against the domain function and each hook's copy — behaviour, not text |
| a hook that needs more than a path predicate      | `run()` a shipped tool resolved with `require.resolve('paperlint/hooks/<tool>.mjs')`, which imports the published build  | precedent: `paper-status-gates.hook.mjs` → `paper-status-gates.sh`                                                                                                                                                                               |
| a paper's declared check (any language)           | the facts files of §3.8, by path in its argv or `PAPERLINT_BUILD_DIR`                                                    | §3.9                                                                                                                                                                                                                                             |
| a non-JavaScript consumer (a Python repro script) | the same facts files after a build, or `skills/paper-pipeline/scripts/paper-sources.mjs <dir> --json` before one         | §3.10                                                                                                                                                                                                                                            |

`isSourcePath(root, rel)`: true for a `.tex` or `.bib` file anywhere under `<root>/<paper>/`,
except under `versions/`, `repro/`, `_build/` and `node_modules/`. It is an over-approximation of
Q1 on purpose: a hook decides per event, in milliseconds, and cannot afford a parse per Bash
command; a nudge firing on a scratch `.tex` costs nothing, a guard silent on `sections/` costs the
gates. It fixes #8 (subfolders), #9 (snapshots) and #11 (`.bib` writes) with one definition.

### 3.7 `paper-edit-guard`'s three holes

The guard's holes — a Python heredoc, `node -e`, and `git checkout -- paper.tex` all allowed
(measured in §1.4) — are about **which command writes**. This design is about **which files are the
paper**. For the guard they are orthogonal: `isSourcePath` widens what it protects, it does not
close a hole, and the guard's own header is right that an interpreter's writes are undecidable from
the command line.

They meet in the fix a consumer project already proved: its sweep hook hashes the paper's files after
every Bash command and runs the gates when bytes moved, whatever moved them — heredoc, `node -e`,
`git checkout` alike. Its one defect is a Q1 copy (#33: `paper.tex` only). Moved into paperlint, the
sweep is a `PostToolUse(Bash)` react that `run()`s a shipped tool; the tool asks
`paperSources(dir)` for `files` plus the bibliography's file, hashes them into
`.paperlint/source-hashes.json`, and prints the gate surface on a change. Hole 3 (no PreToolUse for
a subagent's calls) is narrowed, not closed: the next main-thread Bash call or `Stop` sees the
bytes. **The sweep is the follow-up PR, not this one**: it is a new hook with its own delivery
questions, and it should consume the module rather than land with it.

### 3.8 The facts files: the module's answer, written down

The build already turns work that is not a lint into a JSON fact the rules judge
(`paper.facts.json`, `references.json`). The module's answer joins them, written once per build
after the PDF exists, each with `schema` and the sha256 of every input it was derived from (so a
reader can tell a stale file, as `refs-fresh` does for references):

| file                    | holds                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_build/sources.json`   | `files` (rel, role, lintable, sha256), `missing`, `bibliography` (the union of §3.2 with paths, not texts), and `recorded` (the `.fls` files and `\bibdata` databases of this build)                                                                                                |
| `_build/prose.json`     | `PaperProse` (§3.2) serialised: passages as pieces (`text` / `citation` with `keys` / `reference` with `label` **and its number from `paper.aux`** / `link` / `math`), headings with their numbers, captions, tables, emphasis, citations, links; every item with `file` and `line` |
| `_build/paper.flat.tex` | `assembled.text`: the whole paper as one file, for a tool that reads one file (TeXtidote); `_build/paper.flat.map.json` maps its lines back to the source files                                                                                                                     |
| `_build/references.bib` | the text TeX reads for each database (a materialised block for `embedded`, a copy for `file` and `shadowed`), so a tool that wants "the `.bib`" gets the one TeX used                                                                                                               |

`reference` numbers are why this is written after the build rather than computed by the shipped
script alone: `\ref{sec:x}` → `3.2` is TeX's answer, sitting in `paper.aux` as `\newlabel`. Before a
build, the script (§3.10) leaves `number` absent — a state of the field, not a guess.

### 3.9 Paper-declared checks

**The gap.** A consumer project's per-paper build script ran six checks after building; `paperlint
build` runs none of them and a paper cannot ask it to. Not every one of the six should become a
declaration: a check that every paper would want is a built-in rule, and only the paper-specific
ones are declared.

| the old check                                   | decision                                                                                                                                                                                                                                                                                                                                                                                                         | input from the module                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| uncited bibliography entry                      | **built-in rule `bib/uncited-entry`** (on `paper.tex`, reported at the entry). Generic, binary, and only possible now: it needs Q2 (the database TeX reads) and Q3 (live citation keys) from one place. `\nocite{*}` silences it; `\nocite{k}` cites `k`                                                                                                                                                         | `bibliography`, `citations`                                |
| artifact URL survives into the PDF and resolves | **built-in, two rules.** `pdf/link-rendered`: every live `\url` / `\href` target is among the PDF's links (`paper.facts.json` `links` already has them) — catches a URL lost to anonymisation macros or a broken `\href`. `pdf/link-resolves`: the build asks each URL once, commits the raw responses in `repro/links-cache.json` (the reference check's shape: responses, never verdicts), and the rule judges | `links`; `paper.facts.json` `links`                        |
| rendered numbers present in the delivered PDF   | **split.** Built-in `pdf/prose-numbers`: every number in live prose appears in the PDF text — catches a macro that rendered empty and a `??`. The paper-specific half (each number equals the artifact's output) stays **declared**: only the paper knows its truth source                                                                                                                                       | `prose.json` numbers with lines; `pageTexts`               |
| results gate, hard (`\|\| exit 1`)              | **declared**, `severity: "error"`: it runs the paper's own reproduction; nothing about it is generic                                                                                                                                                                                                                                                                                                             | none required; `prose.json` if it compares numbers         |
| TeXtidote on the full paper                     | **declared**, `severity: "warn"`: an external Java tool paperlint does not install; the module supplies the whole paper as one file                                                                                                                                                                                                                                                                              | `paper.flat.tex` (+ the line map)                          |
| prose-lint on the rendered PDF text             | **shipped check by name**, `{ "use": "prose-lint" }`: prose-lint is paperlint's own script, so the declaration names it and the build resolves it — no install path in the consumer's config (rule 10)                                                                                                                                                                                                           | `prose.json` (the body), or `pageTexts` with `"on": "pdf"` |

**The declaration** — a new key of the paper's `paperlint.json`, validated strictly like every other
(`SETTINGS_KEYS`; an unknown field is an error naming the known ones):

```jsonc
{
  "checks": [
    {
      "name": "results",
      "run": [
        "python3",
        "repro/paper_numbers.py",
        "--check",
        "{prose}",
        "{pdf}",
      ],
      "severity": "error",
      "timeout": 300,
    },
    {
      "name": "textidote",
      "run": ["textidote", "--check", "en", "{flat}"],
      "severity": "warn",
    },
    { "name": "prose", "use": "prose-lint", "on": "pdf", "severity": "warn" },
  ],
}
```

- **When**: a build step `checks` after `measure` and `references`, so the PDF, `paper.facts.json`
  and the facts files of §3.8 exist. A failed compile skips it and says so — a check that ran on no
  PDF must not look like a pass (rule 4).
- **How**: `run` is an argv, executed without a shell, cwd = the paper directory, with a timeout
  (default 120 s). Placeholders are the only way paths reach it: `{dir}`, `{pdf}`, `{sources}`,
  `{prose}`, `{flat}`, `{bib}`, `{facts}`; an unknown placeholder is a settings error at parse time,
  not a literal passed to the program. `PAPERLINT_BUILD_DIR` is set too, for a program that reads
  more than one file.
- **How a check gets the prose without parsing LaTeX**: it reads `{prose}` — the same `PaperProse`
  every paperlint rule uses, with citations as key lists, references as labels and numbers, tables
  as cells. A check that re-parses `paper.tex` is possible (it is the author's program) but has no
  reason to exist; the consumer's converter is the measured example of what that costs (§3.10).
- **What is recorded**: `_build/checks.json` — per check, the exit code, the first 4 KB of
  stdout/stderr, the duration, and the sha256 of each input file it was given. Raw outcomes, never
  verdicts, as with the references.
- **Who decides failure**: a rule `paper/declared-checks` on `paper.tex` reports each failed check at
  its declared severity and reports a recorded result whose inputs changed since as stale (the
  `refs-fresh` pattern). `paperlint build` exits non-zero when an `error` check failed — the old
  `|| exit 1` — and `paperlint lint` shows the same finding without re-running anything.
- **Why this is not `build.sh` coming back**: the build is still paperlint's; a check cannot change
  how the paper is compiled, only judge the result, at one fixed point, with declared inputs. That
  is #59's "declared as data", and the strict schema is what keeps it from growing into a script
  runner.

### 3.10 A non-JavaScript consumer: delete the converter, read the JSON

The consumer's `tex_view` is a regex LaTeX→markdown converter inside a Python reproduction script:
it splits `\cite{a, b}` keys without trimming (Codex found the crash on the space), and hand-parses
references, sections, tables and emphasis. Every one of those is a Q3 answer the adapter already
computes from a real parser — or will, with `tables` and keyed citations (§3.2).

So the module's prose is reachable without JavaScript, in two ways and one format:

1. **After a build**: `_build/prose.json` and `_build/sources.json` (§3.8). A reproduction script
   that runs after `paperlint build` (as a declared check, or in CI) just reads them; reference
   numbers are filled from `paper.aux`.
2. **Before a build**: `node <resolved>/skills/paper-pipeline/scripts/paper-sources.mjs <paper-dir>
--json` prints the same document to stdout (reference numbers absent). It is a shipped script
   like `extract-ref-facts.mjs`, resolved through `require.resolve('paperlint/…')` or `npx`; not a
   new CLI verb, per `docs/prior-art/multi-mode-tools.md`.

The JSON is versioned (`schema`) and specified by a JSON Schema shipped beside it
(`schemas/prose.schema.json`), so a Python consumer can validate it once at its own boundary.
Rendering markdown from it is a dozen lines in any language, and none of them parses LaTeX: a
`citation` piece is `[@a; @b]`, a `reference` piece its `number`, a heading `#` × level plus its
title, a table its rows. The converter's bug class is then gone on both sides: keys arrive split and
trimmed, and no regex over LaTeX is left in the consumer.

### 3.11 Rejected alternatives

- **Fix each site toward "inline first"** (what the round 5 comment asks): makes v1 wrong in
  `bib-authors` and leaves the order living in four places.
- **`no-restricted-syntax` selectors instead of a custom rule**: flat config replaces a rule's
  options per file, and `eslint-rules/*.ts` already set `no-restricted-syntax` for three other
  bans (`eslint.config.mjs:838-847`); a new block would either drop them or need every list merged
  by hand. A selector also cannot inspect the cooked text of a `RegExp(template)` argument.
- **Ask TeX only** (`.fls` as the single answer): there is no `.fls` before the first build, and
  lint, the editor and the hooks run before it.
- **One hook-side resolver via `provide(… paperlint sources --json)`** on every Bash call: a Node
  start and a parse per command, for a speed bump.
- **Expand macros to resolve `\input{\dir/x}`**: the domain module's header already rejects it; the
  recorded answer (§3.5) reports the gap instead.
- **Run `build.sh` again for per-paper checks**: it replaces the build, not just judges it — the
  thing #59 removed. A declared check cannot touch the compile.
- **`run` as a shell string**: a `run()` string goes through a shell (measured in
  `paper-status-gates.hook.mjs`), so a path with a space or a `$(…)` changes the command; an argv
  with typed placeholders does not.
- **Run declared checks from `paperlint lint`**: lint must stay a pure judgement over files
  (editor-time, no programs, no network). The build runs, records; lint judges the record.
- **A `paperlint prose` verb for non-JS consumers**: a verb is a second surface for one answer; a
  facts file the build already writes plus a shipped script cover both moments (after and before a
  build) without one.
- **Make all six old checks declarations**: three of them are the same for every paper and would be
  re-declared, with drifting argv, in each one — a fact in N places, the class this document is
  about.

## 4. Enforcement

### 4.1 The rule

`internal/paper-sources-owner`, a custom rule in `eslint-rules/paper-sources-owner.ts`, wired like
`install-path-literals` for every `**/*.{ts,mts,mjs,js}` under `src/`, `lib/`, `hooks/`,
`eslint-rules/`, `skills/` and `bin/`, tests and harnesses excluded. It reports:

1. a string literal with no whitespace that is `.tex` or `.bib`, ends in `paper.tex`, or ends in
   `.bib` — a path, not a sentence (messages that mention a file are left alone);
2. a regular expression — literal, or `RegExp(…)` over a string or a template whose quasis are
   read — whose source matches a `.tex`/`.bib` path, `filecontents`, `\input`/`\include`/`\subfile`,
   `\caption`/`\cite`, or a LaTeX-comment stripper;

plus `no-restricted-imports` of `@unified-latex/*` outside the owners (Q3: a second parser is a
second projection).

### 4.2 It would have caught rounds 3–5

The prototype in Appendix A, run on the code **as it stood before each fix**:

| round | site                                                   | prototype finding                                                                     |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 3     | `extract-ref-facts.mjs` at `1be5300^`, line 400        | `` `refs.bib` names a paper source by path `` and `` `build/custom.bib` … ``          |
| 3     | `prose-lint.mjs` at `bf2a8e1^`, lines 349, 356         | `` `.tex` names a paper source `` (the `figures/` scan); "caption/cite macro pattern" |
| 4     | `prose-lint.mjs` at `097ea3f^`, line 364               | "this regex is a caption/cite macro pattern (Q3)"                                     |
| 5     | `bib-authors.mjs` (current), lines 86, 91, 94, 98, 101 | `.bib` / `.tex` / `refs.bib` literals and "a .tex/.bib path pattern"                  |
| 5     | `paper-status-gates.hook.mjs` (current), line 122      | "this regex is a .tex/.bib path pattern" (the `RegExp` template)                      |

It still fires on line 375 of the **current** `prose-lint.mjs` — correctly: the round 4 fix kept the
regex, and with it the optional-argument miss.

On the current tree it reports **53 occurrences in 23 files**. The shell sites (#15, #16) and the
consumer's sweep (#33) are outside its reach; §3.4 step 6 removes the two shell sites.

### 4.3 Allow-list

| file                                                                                | why it may answer                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/paper-sources.ts`, `src/paper-sources.ts`                               | the owner                                                                                                                                                             |
| `src/adapters/latex/**`                                                             | the parser's adapter: it knows LaTeX's syntax, the module asks it                                                                                                     |
| `eslint-rules/latex-language.ts`                                                    | the ESLint language must name the environments it projects; after §3.4 it builds on `liveRanges` and keeps only the projection                                        |
| `hooks/*.hook.mjs`, **only inside a function named `isSourcePath`**                 | cannot import (§3.6); the copy is checked behaviourally by the harness. The rest of a hook file is linted like any other                                              |
| `src/cli.ts`, `eslint-rules/papers.ts` — glob strings in ESLint `files` / `ignores` | ESLint's input is a glob; the glob values come from a constant exported by the module (`MAIN_FILE_GLOB`), so the literal lives in the owner and these files import it |
| `src/build.ts` `pdflatexArgs` / `JOB`                                               | the compile command names the main file to TeX; it imports `MAIN` from the module                                                                                     |
| `lib/skill-eval-fixture.ts`                                                         | fixture data: a file tree to write, not a question about a paper (a line disable with the reason)                                                                     |
| `skills/verify-citations/scripts/verify-cites.mjs:1219`                             | dispatches on the extension of a path the user typed; it decides input format, not where a bibliography is                                                            |

### 4.4 What it does not catch

A path built from pieces (`join(dir, "paper" + ext)`), a name read from config, and a decision
made by calling the wrong canonical function (`paperProse` where `live` was meant). The first two
are the "five forms of a reference" problem the consumer's notes record; the rule narrows the
class, the types and §3.5's recorded check carry the rest.

## 5. Migration plan — one PR, tests first

Order matters: each step's tests go red first, on the planted fixtures of §1.4 committed under
`fixtures/paper-sources/` (P and v1–v4, each with its TeX ground truth recorded as JSON produced by
a TeX run, so the expected values were not written by the hand that writes the module).

1. **Fixtures + ground-truth test**: `test/e2e/tex/paper-sources.e2e.ts` builds P and v1–v4 with
   TeX and asserts `paperSources` equals the `.fls` / `.blg` answer. Red: the module does not exist.
2. **Domain**: `decideBibliography`, `isSourcePath`, types. Unit tests per table row of §3.3.
3. **Adapter**: `liveRanges`, `captions`, `bibliographyDecls`, `filecontentsBlocks` (tree-based;
   `filecontents` comment-aware by construction — v4).
4. **App**: `paperSources`, `live`. Step 1 goes green.
5. **Q2 consumers**, each with its own red test on v1–v4: `src/references.ts` (`bibliographyOf`
   becomes a view of `paperSources(dir).bibliography`), `src/reference-rules.ts`,
   `eslint-rules/bib-reachable-entry.ts` (reads every database, reports in the file that holds the
   entry), `extract-ref-facts.mjs` (`SOURCE_ORDER` deleted; v4 must not exit 0 with zero entries),
   `bib-authors.mjs` (`bibTextFrom` deleted). New rule `bib/inline-shadowed` with its docs page.
6. **Q3 consumers**: `texToMdast` on the tree (red test: `\iffalse` content blank), then
   `paper-typography` (#20, #21, incl. `section-word` in `verbatim`), `tex-build` (#17-19),
   `prose-lint` captions (#12, both halves: `\iffalse` silent, `\caption[…]{…}` measured).
7. **Q1 consumers**: `paper-includes.ts` (`isFragment` → `lintable`), the seven `basename` checks →
   `isMainFile`, `MAIN` / `SOURCE_FILE` / globs → one constant, `PAPER_MARKERS` → one list
   (decide whether `paperlint.json` marks a paper; `lib/paper-config.ts` and `src/build.ts`
   disagree today).
8. **Shell → TypeScript**: `check-numbers`, `check-release-claims` (red: P's `sections/intro.tex`
   numbers and release sentence).
9. **Hooks**: `isSourcePath` copies in the three hooks; the harness's new case table (paper.tex,
   `sections/intro.tex`, `versions/…`, `repro/x.tex`, `refs.bib`, a path outside the root); the
   nudge's `[overwrite]` sentence corrected (#10).
10. **Build**: `-recorder`, the facts files of §3.8 (`sources.json`, `prose.json`,
    `paper.flat.tex` + map, `references.bib`) with `schemas/*.schema.json`, and `paper/sources-agree`
    with its docs page. Red first: a build of P writes no `prose.json`; the `\cite{a, b}` fixture
    must come out as `keys: ["a", "b"]` (the consumer's crash, as a test).
11. **Prose for non-JS consumers**: `skills/paper-pipeline/scripts/paper-sources.mjs --json`, tested
    by running it with `python3 -c 'import json,sys; json.load(sys.stdin)'` on its output and
    validating against the shipped schema — the consumer's side, in the test.
12. **Built-in rules for the generic old checks**: `bib/uncited-entry`, `pdf/link-rendered`,
    `pdf/link-resolves` (with the `links` build step and `repro/links-cache.json`), `pdf/prose-numbers`
    — each with both halves on fixtures and its docs page; `pdf/link-resolves` and
    `pdf/prose-numbers` validated on the accepted papers in `fixtures/accepted-papers/` (the root
    rule for venue-shaped checks), the rest on P.
13. **Declared checks**: the `checks` settings key in `lib/paper-config.ts` `SETTINGS_KEYS` and the
    paper schema, the `checks` build step, `_build/checks.json`, `paper/declared-checks`, and
    `"use": "prose-lint"`. Red first: a paper declaring a failing `error` check builds with exit 0
    today.
14. **Enforcement last**: `internal/paper-sources-owner` + `no-restricted-imports` at `error`.
    It must report zero on the tree, which is the proof every site moved; the mutation check is to
    revert one consumer and see it fire.
15. `package.json` `exports`: `"./paper-sources"`; `docs/configuration.md` gains `checks`.

**Outside this repository, after release** (the consumer's own follow-up): declare its two
paper-specific checks (`results`, TeXtidote) and `prose-lint` in each paper's `paperlint.json`;
drop its own uncited-entry and URL checks in favour of the built-in rules; delete `tex_view` and
read `_build/prose.json`; move its hash sweep (§3.7) once paperlint ships it.

**Semver.** Breaking, and declared as such (`BREAKING CHANGE:` footer):

- `bibRange` disappears from `eslint-rules/paper-typography` — public through the
  `"./eslint-rules/*.mjs"` export. (A re-export for one release would avoid it; not worth it inside
  a major.)
- `_build/references.json` `bib.source` changes from `"paper.tex" | "refs.bib"` to the path TeX
  reads, so `REFERENCES_SCHEMA` goes to 2; a v1 file reads as `stale` and the next build rewrites it.
- Different answers on real papers: a shadowed inline bibliography is now checked as the file and
  reported; a `\bibliography{paper}` paper gets its references checked for the first time; the
  three rules on `\iffalse` content fall silent. The new findings alone would be minor under
  ESLint's own policy ("a bug fix in a rule that results in ESLint reporting more linting errors"),
  but the export and schema changes are not.
- CLI of `bib-authors.mjs` / `extract-ref-facts.mjs`: same arguments, different file chosen for v1,
  v2 and v4 — announced in the release notes.
- `ProsePiece`'s `owner` variant splits into `citation` / `reference` / `link`; it is internal
  (`src/domain`), but `paperProse`'s output reaches `prose-lint`, which renders marks from it.
- **Additive, not breaking**: the `checks` settings key (a paper without it builds as before), the
  facts files, `paper-sources.mjs`, the four new built-in rules (new findings; under ESLint's policy
  a minor change), the `./paper-sources` export.

#171 already carries `feat!` commits (`8be391b`, `ecea877`, `aa009ec`), so this rides on the same
major; landing it as a separate PR after #171 merges would need its own.

## 6. What could I be wrong about

1. **That TeX's answer is the one paperlint should give.** For v1 an author may reasonably expect
   paperlint to check what they edit. The design answers "check what TeX reads, and say loudly that
   the edits are not in it" — but if most consumers delete `refs.bib` before each build (a
   `latexmk -C` habit, a CI checkout without build products), `shadowed` would be rare and the
   finding would mostly fire on local working copies. Measure on the consumer's papers before
   setting `bib/inline-shadowed` to `error`.
2. **That one projection can serve both prose rules and markup rules.** `texToMdast` is
   length-preserving and blanks by policy (OPAQUE lists, heading synthesis); the tree's walks are
   not length-preserving. Rebuilding `texToMdast` on `liveRanges` assumes every dead region maps to
   a contiguous source span — true for comments, `\iffalse` and environments, unverified for
   `\verb|…|` and nested `filecontents` (the language's own boundary #10). If it fails, the
   fallback is two projections from **one** dead-span list, still one owner of "what is dead".
3. **The count and the coverage of the rule — and of the six old checks.** 33 sites came from
   mechanism searches and reading;
   the prototype only knows the shapes I wrote down. A site that answers Q1 by walking directories
   (`readdirSync(dir).filter(…)` with a variable extension) or Q3 with a hand-rolled character loop
   would be missed by both — `figureFiles` was found by reading, and the prototype only saw it
   through its `.tex` literal. The recorded-vs-static check (§3.5) is the safety net precisely
   because the rule is not. Likewise the six old checks were taken from a description, not from
   running the consumer's old script: what its "delivered-PDF number check" compared (source
   numbers vs PDF text, or PDF text vs the artifact's output) decides how much of it
   `pdf/prose-numbers` can absorb; read that script before step 12.

## 7. Independent refutation

_Appended verbatim below once returned._

## Appendix A — prototype of the rule

Run as `node probe.mjs <cwd> <files…>` with an ESLint instance whose only rule is this one
(TypeScript files through `typescript-eslint`'s parser). Not shipped; kept here so the counts in
§4.2 can be reproduced.

```js
const PATHY = (s) =>
  typeof s === "string" &&
  !/\s/.test(s) &&
  (s === ".tex" ||
    s === ".bib" ||
    /(^|\/)paper\.tex$/.test(s) ||
    /\.bib$/.test(s));
const TEXY_RE = [
  [/\\\\\.(tex|bib)|\\\.(tex|bib)/, "a .tex/.bib path pattern"],
  [/filecontents/, "a filecontents (inline bibliography) pattern"],
  [/\\\\(input|include|subfile)\b/, "an include-macro pattern (Q1)"],
  [/\\\\(caption|cite)/, "a caption/cite macro pattern (Q3)"],
  [/\[\^\\\\\]\)%|\^\[ \\t\]\*%|\^\[\^%/, "a LaTeX-comment stripper (Q3)"],
];
const why = (src) => TEXY_RE.find(([re]) => re.test(src))?.[1];
const ALLOW = (f) =>
  /src\/domain\/paper-sources\.ts$|src\/paper-sources\.ts$|src\/adapters\/latex\//.test(
    f,
  );
export default {
  rules: {
    "paper-sources-owner": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          path: "`{{v}}` names a paper source by path — ask paperSources(dir)",
          re: "this regex is {{why}} — ask paperSources(dir)",
        },
      },
      create(context) {
        if (ALLOW(context.filename)) return {};
        const reCheck = (node, src) => {
          const w = why(src);
          if (w) context.report({ node, messageId: "re", data: { why: w } });
        };
        return {
          Literal(node) {
            if (node.regex) return reCheck(node, node.regex.pattern);
            if (PATHY(node.value))
              context.report({
                node,
                messageId: "path",
                data: { v: node.value },
              });
          },
          "NewExpression[callee.name='RegExp'], CallExpression[callee.name='RegExp']"(
            node,
          ) {
            const a = node.arguments[0];
            if (a?.type === "TemplateLiteral")
              reCheck(node, a.quasis.map((q) => q.value.raw).join("…"));
            else if (a?.type === "Literal" && typeof a.value === "string")
              reCheck(node, a.raw);
          },
        };
      },
    },
  },
};
```

## Appendix B — how the measurements were taken

- **Ground truth**: a copy of each fixture, `pdflatex -recorder -interaction=nonstopmode paper.tex`,
  `bibtex paper`, two more `pdflatex` passes; `grep '^INPUT' paper.fls`, `grep 'Database file'
paper.blg`, `grep bibitem paper.bbl`, `pdftotext paper.pdf -`. TeX Live 2023 (pdfTeX 1.40.25).
- **Q2 sites**: `bibliographyOf(nodeFiles, dir)` and `resolveSource` + `loadEntries` imported under
  `--conditions=paperlint-source`; `bib-authors.mjs <dir> --json`, field `file`.
- **Hooks**: `node node_modules/vigiles/dist/cli.js hook-runtime run-program hooks/<h>.hook.mjs`
  with a PostToolUse `Edit` payload (`tool_input.file_path` absolute) or a PreToolUse `Bash`
  payload, `CLAUDE_PROJECT_DIR` at the fixture root holding `paperlint.json` = `{}`. "Fires" for
  `paper-status-gates` = it reached its `run()` (in the fixture, `require.resolve('paperlint/…')`
  then fails, RC=127, which is the evidence it matched); silent = RC=0 and zero bytes.
- **Q3 sites**: `node --conditions=paperlint-source skills/grade-paper-writing/prose-lint.mjs

<P>/paper.tex --flags-only`; ESLint API with the `tex/latex` language and `tex/future-promise`,
  `paper/leading-zero`, `paper/section-word`; the two `.sh` scripts run on `<P>/papers/p1`.
- **Rule prototype**: Appendix A over every tracked `.ts`/`.mjs`/`.js` in `src lib hooks
eslint-rules skills bin scripts` minus tests, harnesses, evals, specs, fixtures, `references/` and
  `repro/`; and over `git show 1be5300^:…extract-ref-facts.mjs`, `git show bf2a8e1^:…prose-lint.mjs`,
  `git show 097ea3f^:…prose-lint.mjs`. Only the rule's own messages were counted (the run also
  printed "rule not found" noise for the repo's disable directives).
