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

**The independent review (§7) returned `DOES NOT HOLD`** on the first version of this Q2 policy:
after one build, TeX's own copy of the block is an "existing file" too, so every paper without
`[overwrite]` would read as shadowed, and differently on a fresh checkout. Re-measured with TeX, it
holds; §7.2 revises Q2 to be decided from committed bytes (a `bib/filecontents-overwrite` rule with
an autofix), with the stale-file case left to the recorded `.fls` fact.

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

> ⚠️ **Superseded by §7.2.** The independent review showed this table reports `shadowed` for every
> paper built once without `[overwrite]` (TeX's own output counts as an existing file), and that the
> answer depends on the machine. §7.2 decides Q2 from committed bytes and moves `shadowed` to the
> recorded `.fls` fact. The table is kept as the reviewed version.

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

One independent agent (a separate Claude session, Opus, framed to break the design: eight named
attacks, a forced `HOLDS` / `HOLDS WITH CAVEATS` / `DOES NOT HOLD` verdict, and a "where my review may
be wrong" section) reviewed `9593b1c`. Its report follows **verbatim**; the only edit is that its
headings are one level deeper so they nest under this section, and its title line is dropped. Its
own copy is on branch `claude/paper-sources-refutation` (`29cbbc6`). §7.2 is the author's response.

### 7.1 The report

Review of `docs/design/paper-sources.md` at `9593b1c` (branch `claude/paper-sources-design`),
2026-10-06. Everything below was read from the code at that commit or measured in this container.
**No TeX is installed here** (`which pdflatex bibtex lualatex tectonic` prints nothing), so no claim
that needs a TeX run was re-measured. Those claims are marked where they come up.

### Verdict: DOES NOT HOLD

Most of the design holds up: one owner for Q1/Q2/Q3, a discriminated union for the bibliography,
one dead-span list, a static answer checked against a recorded one, and a rule that keeps the class
from growing back. The part it rests on most does not hold. That part is §3.3's decision table and
the policy "check what TeX reads, and report `bib/inline-shadowed`". The table has no row for a
`.bib` that TeX itself wrote from the block on an earlier build. So after one `paperlint build`,
every paper whose block has no `[overwrite]` is reported as `shadowed`, even when the file holds the
same text as the block. That covers 7 of the repo's 8 build fixtures that use `filecontents`, and
both `paper-typography` fixtures. The decision also reads a file that is not tracked by git. So for
the same commit, the answer is `embedded` on a fresh CI checkout and `shadowed` on a working copy
that has been built. Lint verdicts then depend on the machine, and findings point into a generated
file that `render-paper` tells authors to gitignore. Q2 has to be decided again before the module is
built on it. The rest of the findings are changes, not blockers.

### Findings

#### 1. Every built paper becomes `shadowed`. The table cannot tell a stale file from TeX's own output. (blocks the design)

**Claim attacked:** §3.3. In the row `declared · block · no [overwrite] · file exists → shadowed`,
the block is reported as "not what TeX reads".

**Evidence.**

- The build runs pdflatex in the paper directory, with no `-output-directory`:
  `src/build.ts:338-341` (`spawnOptions`: `cwd: ctx.paperDir`) and `:316-323` (`pdflatexArgs`). So
  on the first pass, `\begin{filecontents*}{refs.bib}` writes `<paper>/refs.bib`.
- On the next lint or build, `exists("refs.bib")` is true. The table gives `shadowed`, and
  `bib/inline-shadowed` fires. Nothing in §3.2–§3.3 compares the file with the block.
  `grep -n -i "identical\|same content\|equal\|compare" docs/design/paper-sources.md` finds no
  content comparison (the only hits are §3.5's file-list comparison and unrelated lines).
- How many papers this hits:
  `grep -rn "begin{filecontents" fixtures/build-e2e fixtures/paper-typography` gives 9 blocks, all
  `\begin{filecontents*}{refs.bib}` with no option: anon-ack, anon-bib, anon-author, anon-macro,
  anon-pdfauthor, aidc, anon-href, clean-paper, messy-paper. The only `[overwrite]` in the fixtures
  is `fixtures/accepted-papers/agenticdev-acm26/paper.tex:2`. §2 says "four of the build e2e
  fixtures" lack it; the count is seven.
- A plain byte comparison would not fix it either:
  - Non-starred `filecontents` writes a header comment into the file.
  - TeX drops trailing spaces from input lines, so the file it writes is not the block's bytes.

  Any "in sync" test has to normalise for both. Neither effect was measured here (no TeX).

- §5 step 1 inherits the defect. It asks that `paperSources` equal the `.fls`/`.blg` answer. For
  any fixture without `[overwrite]` and with no stale file, the static answer is `embedded` before
  the build and `shadowed` after it, so the test's result depends on when it calls the module.

**Change needed:** see finding 2. A row that compares normalised contents (`in-sync`) is the
minimum, but it does not fix finding 2.

#### 2. "What TeX reads" depends on the machine. Decide Q2 from committed bytes. (blocks the design)

**Claim attacked:** §3.3's policy, and §6.1's hope that `shadowed` "would mostly fire on local
working copies".

**Evidence.**

- `skills/render-paper/SKILL.md:83-87` tells authors that the block is the source of truth, that it
  is written with `[overwrite]`, and to "Consider `.gitignore`-ing the generated `refs.bib`".
- Take a paper that follows that advice, but whose block lacks `[overwrite]`:
  - **Fresh CI checkout:** no `refs.bib`, so the block is written and the state is `embedded`.
  - **Author's working copy:** built once, so the state is `shadowed`.

  Same commit, two answers, two sets of findings. ESLint judges `paper.tex`, and the file that flips
  the verdict is neither linted nor tracked.

- In the `shadowed` state, §3.3 sends every Q2 finding to lines of `refs.bib`. That file is
  generated, possibly gitignored, and the next fresh build ignores it. An author who fixes an entry
  there changes their local PDF, while the CI build reverts the fix.
- The submitted PDF is the one built from the committed tree, which is the block. So "what the
  author edits" is the more stable answer here, not the less correct one.

**Change needed.** Make the decision a function of the committed source:

- **A static rule on `paper.tex`'s own bytes** (for example `bib/filecontents-overwrite`): a block
  without `[overwrite]` is a finding, with an autofix that adds the option. The rule is
  deterministic, safe for the ESLint cache, and already the documented convention. With it, the
  `shadowed` state never arises, and Q2 consumers read the block. That is both what the author edits
  and what TeX reads on every machine.
- **Keep `shadowed` only for the tracked case:** both the block and a git-tracked `.bib` exist, and
  they differ.
- Leave the stale local file to the post-build recorded check (§3.5).

#### 3. "`bib-authors` is right 3 of 4" is a coincidence of the fixtures. (minor)

**Evidence:** `skills/verify-citations/scripts/bib-authors.mjs:57-107`. Given a directory, it takes
`paper.bib`, then the only `.bib`, then the first `.bib` in sort order, and only then falls back to
the `.tex`. It never reads `\bibliography{…}`. Two variants show how it can go wrong:

- A paper with `\bibliography{barovox}` and a leftover `refs.bib`: it picks `barovox.bib` or
  `refs.bib` by alphabet, not by declaration.
- A built v1-style paper whose `refs.bib` equals the block (finding 1): it reads the generated copy.

That it agrees with TeX in v1, v3 and v4 should not be read as evidence for its order. The design
deletes `bibTextFrom` anyway, so this only changes how §0 argues.

#### 4. The `Database` union is missing states, and allows invalid ones. (needs a change)

**Claim attacked:** §3.2 / §3.3, that the union is complete and the types are "parsed once at the
boundary into types that cannot hold an invalid state" (`src/CLAUDE.md:43`).

- **Switches.** `src/adapters/latex/conditionals.ts:14-15`: "Only `\iffalse` is decided. `\iftrue`,
  `\if\venue1` and every switch made with `\newif` … both of their branches stay." The repo's own
  corpus has such a paper: `fixtures/accepted-papers/llm-splained-acsac25/paper.tex:115-145` loads
  `biblatex` three times behind `\conference`. A `\bibliography` or `\addbibresource` behind a switch
  gives several databases with no way to choose between them. The union needs an `undecided` state.
  Measured with `parseLatex` + `includesOf`: a `\newif\ifdraft\draftfalse … \ifdraft
\input{sections/parked} \fi` still lists `sections/parked`. §3.5's `sources-agree` would report
  that file on every build, on a switch the author set on purpose.
- **biblatex with biber.** The same paper uses `backend = biber` and three
  `\addbibresource{bibs/….bib}` (`paper.tex:149-151`). Biber papers write no `\bibdata` to `.aux`,
  and `paperlint build` runs only `bibtex` (`src/build.ts:409`). So §3.5's recorded databases are
  empty for these papers, and `sources-agree` would report every declared resource. A
  `recorded: unavailable (biber)` state is needed.
- **`\addbibresource[location=remote]{https://…}`.** `exists()` is false, so the state is `missing`,
  "the build will fail". That is wrong for a remote resource.
- **`[nosearch]`.** The doc quotes it (§2: "looks only in the current directory") but does not model
  it. `EmbeddedBib` carries only `overwrite`. Verified in the source:
  `latex3/latex2e base/doc/ltnews30.tex:293-297`.
- **Two search paths.** `filecontents`' existence check searches the TeX inputs path, which the
  build sets as `TEXINPUTS` (`src/build.ts:254-271`). bibtex searches `BIBINPUTS`, which the build
  does not set. If a `refs.bib` is found on `TEXINPUTS` but not by bibtex, the block is not written
  and bibtex fails. `exists(name)` merges the two paths into one.
- **`\bibliography` inside a macro definition.** For example
  `\newcommand\refs{\bibliography{refs}}`: the definition is pruned (`hidden.ts`), so before a build
  the state is `none`. That is the same "nothing to check" silence §3.2 blames on `null`. Only the
  post-build check notices.
- **Invalid states that can still be constructed:**
  - `shadowed` with `block.overwrite === true`;
  - `embedded` whose `block.writes` does not match `name`;
  - `main` stored twice (`main` and `files[0]`), so the two can disagree;
  - `lintable: boolean`, which only repeats the path's extension;
  - `role: "main"` allowed on any element of `files`.

#### 5. Q3 inside the `.bib`: bibtex has no comment character, and the parser does. (needs a change)

**Claim attacked:** §3.3, "Every Q2 consumer then reads **the text TeX reads**".

**Evidence.** Measured with the repo's own parser:

```
$ node .probe.mjs   # @retorquere/bibtex-parser on "% @article{dead2020,…}\n@article{live2021,…}"
["live2021"]
```

As far as I know (not measured here), classic BibTeX ignores everything outside `@…{…}` and does not
treat `%` as a comment. A `%`-prefixed `@article` is therefore still read and can still be cited.
The repo has met this behaviour from the other side: `skills/render-paper/check-render.sh:176-177`
records that a `%` inside an entry "eats the whole record".

The ESLint projection makes the `%` lines of a `filecontents` body into comment nodes
(`eslint-rules/latex-language.ts:69, :384-392`). So three readers of one bibliography disagree about
which entries exist: bibtex, the parser, and the projection.

**Change needed:** one of two things.

- The module answers "which entries are live" the way bibtex does.
- Or there is a finding for a `%` line that starts an entry.

#### 6. Inventory: sites it missed, and one row marked ✓ that is only half right. (needs a change)

**Claim attacked:** §1.3, "33 sites".

Missed:

- `skills/render-paper/check-render.sh:109-110`: a **third compile path**,
  `pdflatex -interaction=nonstopmode "$BASE.tex"` without bibtex. It also writes the `refs.bib` that
  finding 1 is about.
- `skills/render-paper/check-render.sh:207-209, :251-252`: `grep -qE '^[^%]*\\documentclass…'` on
  `paper.tex` only. This is a Q3 copy like #18 (blind to `\iffalse`, first match wins).
- `eslint-rules/latex-language.ts:372-373`: `src.indexOf("\\begin{document}")` decides where the
  preamble ends. It takes the first occurrence, even one inside a comment, `\iffalse`, verbatim or a
  `filecontents` body. §3.2's `Role: "preamble" | "body"` and §3.4's "non-prose spans (preamble)"
  rest on this answer.
- `eslint-rules/pdf-last-page-balance.ts:183`: `reportLine` takes the first `\documentclass` line.
  `llm-splained` has three behind a switch. `fixtures/accepted-papers/README.md` already records the
  same defect for `tex/template`.

Marked ✓ but only half right:

- **#29 `bibInput` (`src/build.ts:296-313`).** `\bibdata` is TeX's answer for the _names_. The
  _paths_ are paperlint's own guess: `join(paperDir, d.endsWith(".bib") ? d : `${d}.bib`)`, with no
  `BIBINPUTS` and no `kpsewhich`. For a database bibtex finds elsewhere, `bibHash` is null, and §3.5
  would compare against a resolution that is not TeX's.

Plan gap:

- `src/build.ts:46, :192` imports `@unified-latex` (#23). It is not on §4.3's allow-list and not in
  §5 step 7. So step 14's "must report zero on the tree" cannot pass as planned.

The prototype count reproduces: Appendix A run over the tracked non-test `.ts/.mjs/.js` under
`src lib hooks eslint-rules skills bin scripts` gives **58 in 28 files**. 5 of those files are
`skills/paper-pipeline/*.eval.mjs`, which Appendix B excludes. Without them the count matches the
doc's 53 in 23. §4.1's globs exclude only "tests and harnesses", so as specified the shipped rule
would also lint the evals.

#### 7. Enforcement: `no-restricted-imports` has the same problem the doc rejects `no-restricted-syntax` for, and the rule skips template literals. (needs a change)

**Claims attacked:** §4.1, §3.11.

- The argument against `no-restricted-syntax` is correct. `eslint.config.mjs:446, :624, :842` set
  it in three blocks, and :850-864 is placed last to keep its options.
- §4.1 then proposes `no-restricted-imports` for `@unified-latex/*`. That rule is already set twice:
  `:798` (`{ paths: ONE_COLLECTION_LIBRARY }`) and `:813`, which restates `ONE_COLLECTION_LIBRARY`
  by hand next to `NO_SKILLS`. A third block with the new pattern would replace one of those for
  `src/`, `eslint-rules/` and `lib/`, and drop the lodash ban, unless every list is merged by hand.
  That is the cost §3.11 calls disqualifying. Put the import ban inside the custom rule too.
- Appendix A checks `Literal` and the `RegExp(…)` argument, not `TemplateLiteral`. It therefore
  misses:
  - `eslint-rules/papers.ts:145` (`` `${root}/*/paper.tex` ``);
  - `src/domain/paper-source.ts:69` (`` `${t}.tex` ``);
  - `src/build.ts:302` (`` `${d}.bib` ``).

  §4.4 names `join(dir, "paper" + ext)`, but not this more common form.

- It would flag legitimate code: `src/new-paper.ts` (scaffolding writes a new `paper.tex`, which
  asks nothing about an existing paper) is reported and is not on the allow-list.

#### 8. §3.5's "local files from `paper.fls`" has no filter, and bibtex records nothing. (needs a change)

**Not measured (no TeX).** `-recorder` logs every file pdflatex opens: `.aux`, `.toc`, `.out`,
`.bbl`, every figure, `paper-guards.tex` and other inputs-path files. As far as I know it also logs
the `\IfFileExists` probe that `filecontents` makes for `refs.bib`.

"Any file TeX read that the static answer lacks" is then noisy unless the comparison is limited to
the files the static answer could contain (`.tex` reached by include). bibtex has no recorder, so
the `.bib` paths never appear in `.fls`. The Q2 half of the recorded answer is only `\bibdata`
names, plus the `.blg` `Database file #n:` lines if they are read.

What helps: if `.fls` does record an `OUTPUT refs.bib` line when the block is written, it would
decide `embedded` vs `shadowed` exactly. That fits finding 2 better than any static check of the
file on disk. Measure it before relying on it.

#### 9. Layering: an ESLint rule calling the app use case becomes a composition root. (needs a change)

**Claim attacked:** §3.6, row `eslint-rules/*.ts → #src/paper-sources`.

Today no rule in `eslint-rules/` imports an app module. `eslint-rules/paper-context.ts` receives
`bodyFiles`' answer through `settings`, and `src/cli.ts` computes it: the root builds the adapters
and wires the ports (`src/CLAUDE.md:22`). `paperSources(dir, deps)` has "no I/O defaults"
(`src/CLAUDE.md:20`), so a rule that calls it must build `nodeFiles` and `latexReader` itself, and
would parse the whole paper and its includes again per rule and per file.

Follow the `paper-context` precedent: compute once in the root and carry the value in `settings`.
Or memoise by directory and hashes.

Minor and arguable: `decideBibliography` encodes the LaTeX kernel's `filecontents` behaviour. Under
`src/CLAUDE.md:10-14` ("Axis A … a file belongs to an adapter when it would change if `<tool>`
disappeared"), that is adapter knowledge, not domain.

#### 10. Hooks: the harness part the plan relies on has moved, and `.bib` in the guard goes past its stated purpose. (needs a change)

- **Where the duplicate check lives.** `hooks/hooks.harness.ts:595-606` is part VII, and it is now a
  comment only: "That duplication is checked in `lib/paper-config.harness.mjs`". That harness
  compares constant values (`lib/paper-config.harness.mjs:38-47, :95-121`); it does not test
  behaviour. The plan itself is feasible: hooks already `export const` (for example
  `hooks/paper-edit-guard.hook.mjs:111-153`, `export const papersRoot`), so `isSourcePath` can be
  exported and run against a case table. But §3.6's "part VII already checks copied constants" is
  stale, and the case table belongs in `lib/paper-config.harness.mjs` next to the other copies.
  Otherwise it repeats the scope mistake recorded at `hooks.harness.ts:601-606`.
- **`.bib` in the edit guard.** The guard's stated purpose (`paper-edit-guard.hook.mjs:368-375`) is
  "to stop a paper's PROSE being edited past the PostToolUse checks". No such check reads a `.bib`.
  With `.bib` added to the argv leg (`MUTATORS`, `:319-328`), `cp ~/Downloads/library.bib
papers/p1/refs.bib` and `mv` of a bibliography are denied. That is ordinary work: exporting from a
  reference manager.
- **Generated files.** `isSourcePath` would also claim the `refs.bib` that pdflatex generates from
  the block (finding 1). That file is a build product, not a source.
- **Already covered.** The redirect leg already denies `>` into any file under the root
  (`redirectsInto`, `:299-309`).

So the real gain is `sed -i` on a tracked `.bib`. Weigh that against the denials.

#### 11. Declared checks: the build-fails rule contradicts the doc's own principle and the references precedent. (needs a change)

**Claim attacked:** §3.9, "`paperlint build` exits non-zero when an `error` check failed".

**Evidence.**

- §3.11 rejects running checks from lint with "The build runs, records; lint judges the record".
- The references step, the precedent §3.9 copies, is "OPTIONAL and NEVER FAILING" (`src/build.ts:569-570`).
- `docs/prior-art/nondeterministic-checks.md` says a check whose verdict can change without the file
  changing must not block. Two of the proposed checks are exactly that: a results gate that runs a
  reproduction, and `pdf/link-resolves`, which uses the network (§3.9 gives it no severity policy).

Make the build record the outcome and let `paperlint lint` (or the CI entry point) fail on it, which
matches `blocking-vs-advisory.md` point 2.

A second gap: a check runs with `cwd` = the paper directory, after `measure`, with no sandbox. It
can rewrite `_build/paper.facts.json`, `references.json`, or a `tables/*.tex` (a reproduction script
that regenerates tables is the common case). "A check cannot change how the paper is compiled" is
true, but it can still change what the rules judge. Hash the sources and facts before and after
each check and report a check that changed them.

The #59 / `IGNORED_SCRIPTS` attack failed; see below.

#### 12. `prose.json` reference numbers from `paper.aux` are token lists, not numbers. (minor)

**Not measured.** The first group of `\newlabel{…}{{…}…}` is whatever TeX wrote, for example:

- `\relax`-prefixed values;
- hyperref's five-field form;
- cleveref's extra `@cref` labels with `[section][2][3]3.2`;
- formatted subfigure or `enumerate` labels.

§3.8 should say how a `number` is rendered from it, which labels are skipped, and that
`@cref` twins are ignored.

#### 13. Migration: "one PR" crosses every layer, and the semver list misses user-visible changes. (needs a change)

- §5 touches lint rules, skills, hooks, a new build step, the settings schema, two JSON schemas,
  shell→TS rewrites, and five or more new rules, each with a docs page and accepted-paper
  validation. Root `CLAUDE.md` rule 9.2 says: "More than one [layer or channel] is a conversation,
  not a commit."
- Putting all of it inside #171 (already at review round 5) so that it rides on `8be391b` /
  `ecea877` / `aa009ec` (verified: all three are `feat!`) ties a large design to a release-note
  convenience.
- A natural split, each part green on its own:
  1. module + Q2 consumers (with finding 2's decision);
  2. Q3 projection;
  3. hooks;
  4. build facts and declared checks;
  5. enforcement.
- **Not listed in §5's semver section:**
  - the guard denying commands it allows today (finding 10);
  - `status-gates` firing on more paths;
  - `-recorder` writing `paper.fls` into every paper directory. The build runs in place, and this
    repo's `.gitignore` (and probably a consumer's) does not list `*.fls`, so every built paper gets
    a new untracked file (rule 11).
- Step 1's "red: the module does not exist" commits a failing e2e test. That is fine if steps 1–4
  land together, but the per-step "green" claim does not hold for that commit. Step 1's assertion
  is also time-dependent (finding 1).

### Attacks that failed

- **`filecontents` semantics.** The LaTeX News 30 quote is real (`ltnews30.tex:283-297`), including
  `[force]` and `[nosearch]`. The design's reading of the kernel is right; the defect is in what it
  builds on top of it (findings 1 and 2).
- **The parse tree's `\iffalse` cut against awkward input**, measured with `parseLatex`,
  `includesOf` and `headingsOf`:
  - a parked half-figure (`\iffalse \begin{figure} … \fi`) keeps the following `\section` and
    `\input`;
  - the `{\iffalse}\fi` brace trick keeps the following text;
  - `\verb|50%|` stays one `verb` node over offsets 45–55, and the text after it survives.

  I found no realistic, error-free construct where the tree's spans and a blanking projection would
  disagree. The ones I found (`\fi` inside verbatim inside `\iffalse`) are TeX errors anyway.

- **The `no-restricted-syntax` rejection** (§3.11) is correct as stated.
- **The prototype's counts reproduce** (finding 6 explains the difference).
- **`checks` vs #59.** The design follows #59's "declared as data" and `IGNORED_SCRIPTS` stays
  intact. `docs/configuration.md:450-453` is about scripts that replace the build, and a declared
  check does not. No new verb is proposed, which is consistent with `multi-mode-tools.md`.
- **The `feat!` commits #171 is said to carry exist** (`git log -1` on each).
- **Hooks importing a function copy is feasible**: the shipped hooks already have named exports
  alongside `export default`.

### Where my own review may be wrong

- **No TeX in this container.** These were not measured:
  - that `filecontents` without `[overwrite]` leaves a file written by an _earlier pass of the same
    block_ alone (it follows from the quoted kernel rule, but I did not run it);
  - the header and trailing-space differences (finding 1);
  - what `-recorder` logs for `\IfFileExists` and for a written `filecontents` file (finding 8);
  - the `\newlabel` forms (finding 12);
  - every ✓/✗ in the design's §1.4 tables. I did not re-run them.
- **BibTeX and `%` (finding 5)** is from memory of BibTeX's behaviour, not from a bibtex run. The
  parser half was measured.
- **Finding 2** assumes some consumers gitignore the generated `refs.bib`, as `render-paper`
  advises. I could not see the consumer project's papers or `.gitignore`. If every consumer commits
  `refs.bib`, finding 2 shrinks to finding 1.
- **Not read:** the Codex comments on PR #171 (4198299174, 4198299188), the consumer's sweep hook,
  and the old per-paper build script that §3.9's six checks come from. Findings on §3.9–§3.10 judge
  the design text only.
- **Hooks and the full test suite** were not run.
- **Finding 9's domain-vs-adapter point** is a reading of `src/CLAUDE.md` Axis A that the author
  may reasonably read the other way, since the domain already holds `tex-document.ts`.

### 7.2 Response: re-measured with TeX, and what changes

The reviewer had no TeX; this container does (TeX Live 2023). Its three TeX-dependent claims were
re-run on a fresh paper — a `filecontents*{refs.bib}` without `[overwrite]`, an entry line ending in
three spaces, and a `%`-prefixed `@misc{dead2020,…}` inside the block, `\cite`d:

```
build 1  paper.fls: OUTPUT refs.bib
         paper.log: LaTeX Info: Writing file `./refs.bib'.
         refs.bib : "@misc{a2024, title={A Title},$"     <- the three trailing spaces are gone
bibtex   paper.bbl: \bibitem{a2024}  \bibitem{dead2020}  <- the %-prefixed entry IS read
build 2  paper.fls: INPUT ./refs.bib / INPUT refs.bib
         paper.log: File `refs.bib' already exists on the system. Not generating it from this source.
```

- **Finding 1 holds.** On the second build of an unchanged paper TeX says exactly what it said for
  the stale file in v1, and the §3.3 table reports `shadowed`. The trailing-space loss confirms that
  a byte comparison cannot tell "TeX's own output" from "stale".
- **Finding 8 holds, in the useful direction.** `.fls` says `OUTPUT refs.bib` when the block was
  written and `INPUT ./refs.bib` when the file pre-existed — the post-build fact decides
  `embedded` vs `shadowed` exactly, per build, without comparing contents.
- **Finding 5 holds.** bibtex has no comment character: `% @misc{…}` is a live entry. Three readers
  disagree today — bibtex (live), `@retorquere/bibtex-parser` (dropped), the ESLint projection (a
  comment node, which is how `% eslint-disable-next-line bib/reachable-entry` works).

**The Q2 decision, revised (accepting findings 1 and 2).** Q2 is decided from committed bytes; the
machine's state is a post-build fact, not an input to the static answer:

1. New rule `bib/filecontents-overwrite` on `paper.tex`: a live `filecontents` block writing a `.bib`
   without `[overwrite]` / `[force]` is a finding, with an autofix adding `[overwrite]` (the
   convention `render-paper` already documents; 9 fixtures in this repo need it). With the option,
   the block is what TeX reads on every machine, so the static answer is `embedded` and is true.
2. The static `Database` union loses the "file exists on this disk" input: `embedded` (a live block
   for the declared name), `file` (no block; a `.bib` that is **tracked**, or found on the search
   path), `conflict` (a block AND a git-tracked `.bib` of that name whose parsed entries differ —
   the only static `shadowed`), `missing`, and `undecided` for a declaration behind a `\newif`
   switch (finding 4). `remote` for `\addbibresource[location=remote]`.
3. `shadowed` moves to the recorded answer (§3.5): `INPUT` of the block's target with no `OUTPUT`
   in `paper.fls` means this build's PDF did not use the block. `paper/sources-agree` reports it,
   at `warn`, as a fact about this working copy.
4. Entry liveness follows bibtex (finding 5): the module's entry list treats `%` lines inside a
   block as live entries for Q2, and a separate finding reports a `%` that starts an entry — the
   disable-directive syntax keeps working because the directive is a whole line that is not an
   `@` entry.

**Accepted as changes, folded into the migration plan when it is executed:** finding 4's states and
the constructible invalid states (`main` only as a field, `files` = the rest; `lintable` derived;
`shadowed` gone from the static union); finding 6's four missed sites (`check-render.sh` ×2,
`latex-language.ts:372` `indexOf("\\begin{document}")`, `pdf-last-page-balance.ts:183`) and
`bibInput`'s path guess (resolve with `kpsewhich`); finding 7 — the `@unified-latex` import ban
moves inside the custom rule, the rule reads template literals, `src/new-paper.ts` is allow-listed,
and `*.eval.mjs` is excluded; finding 9 — rules receive `PaperSources` through `settings` from the
root, as `paper-context` does, and `decideBibliography` moves to the latex adapter; finding 10 —
`.bib` stays out of the edit guard (the redirect leg already covers `>`), and the hooks' case table
lives in `lib/paper-config.harness.mjs`; finding 11 — a declared check never fails the build:
`paperlint build` records, `paperlint lint` (and CI) fails on an `error` check, and the build hashes
sources and facts before and after each check and records a check that changed them; finding 12 —
`number` is the first group of `\newlabel` rendered as text, `@cref` twins skipped, `\relax`
stripped; finding 13 — the work splits into the five PRs it lists, in that order, each green, and
the semver list adds the new `paper.fls` file (to be written under `_build/` via `-recorder` with
`-output-directory`, or listed in the scaffolded `.gitignore`) and the hooks firing on more paths.

**Not accepted:** none outright. Finding 3 is right that `bib-authors`' agreement with TeX was a
coincidence of its order; §0's "right 3 of 4" stays as a measurement, not as an argument for that
order.

**Verdict after response:** the reviewer's `DOES NOT HOLD` stands for the design as committed at
`9593b1c` (the §3.3 table). The revised Q2 above has not been through a second refutation.

## 8. PR 1 as built — module and Q2 consumers

The first of the five PRs of finding 13: the module (Q1, Q2) and every Q2 consumer moved onto it.
Q3 (`texToMdast`, `liveRanges`, captions), the hooks, the build facts and the enforcement rule are
PRs 2–5. Where the build differs from §3 and §7.2, and why:

1. **TeX's answer is recorded, not asserted by hand.** `test/e2e/tex/paper-sources.e2e.ts` builds each
   planted paper of `fixtures/paper-sources/` (P, v1–v4, and v5: a `%`-prefixed entry) with
   `pdflatex -recorder` and `bibtex` and compares `tex-truth.json` byte for byte;
   `src/paper-sources.test.ts` compares the module's answer with that file, so it runs without TeX.
   (§5 step 1 asked one e2e test to do both.) The run calls pdflatex directly: `paperlint build`
   gains `-recorder` only in PR 4.
2. **"Committed" asks git's index, through a port.** §7.2's `conflict` needs to know whether a `.bib`
   is tracked. `CommittedFiles` (`src/ports/committed.ts`) is answered by git
   (`ls-files --error-unmatch`, `src/adapters/git/`); outside a work tree every file counts as
   committed — the disk is the only state. This is not the commit a rule may not name (`GIT_IN_A_RULE`): the index
   names files, and a shallow checkout has all of them.
3. **`file` needs no tracking, and is looked up where bibtex runs.** §7.2(2) reads "a `.bib` that is
   tracked, or found on the search path". bibtex reads `BIBINPUTS`, which the build does not set, so
   a database is resolved in the paper's directory only (finding 4's "two search paths").
4. **`undecided` is a state of the bibliography, not of one database**, and covers a declaration in a
   macro's body (`\newcommand{\refs}{\bibliography{refs}}`) as well as one behind a switch. A
   redefinition OF `\bibliography` (the accepted ACM paper's `\let` and `\renewcommand`) declares
   nothing.
5. **bibtex's own reading, measured with bibtex 0.99d:** an entry behind `%` is read; `@comment` is
   skipped as a word, so an entry inside its braces is read. An entry left open is read with what it
   has, and the next `@` at brace depth 0 starts the next entry; an `@` inside a field is text (§9 —
   this item first said an unclosed entry is not read, which the second refutation showed wrong). A
   `%` at the start of each line inside an entry does not drop the record (as `check-render.sh`
   says): the entry is printed and its fields after the `%` are lost (`to sort, need author or key
in dead2020`). §7.2(4)'s finding is `bib/commented-entry` (warn).
6. **An entry in a `.bib` file is reported at its declaration.** §5 step 5 says `bib/reachable-entry`
   "reports in the file that holds the entry"; ESLint lints `paper.tex`, not the `.bib`. A finding
   about such an entry is reported at the `\bibliography` naming it, with `refs.bib:12:1:` in front
   (the `reportInPaper` precedent), and a disable directive on the line above the entry in the `.bib`
   is honoured. The reference rules (`paper/author-list`, `paper/cite-exists`) do the same.
7. **The `bib` rules are built by the root with their ports** (`src/bib-rules.ts`, as
   `src/reference-rules.ts` is), not imported from `eslint-rules/` (§3.6) nor carried in `settings`
   (finding 9). `eslint-rules/bib-reachable-entry.ts` is gone; `bibRange` is no longer exported and
   is used only by `paper-typography`'s `skippedRanges`, which PR 2 replaces.
8. **Each rule reads the paper again, so the parse is memoised.** Measured on the accepted ACM paper:
   0.9 s per `paperSources`, seven calls per lint (four reference rules, three `bib` rules). The latex
   adapter keeps parse trees by source text, least recently used first out, up to 512 KiB of source
   (`parseLatex`); after the first parse a call costs 30–130 ms. (It first kept 64 trees, which in
   an editor held 64 versions of the same file — §9, finding 5; then 8, which thrashed on a paper
   with ten includes.)
9. **`references.json` schema 2 has `bib.sources`, a list** — a paper may declare several databases.
   A schema-1 record reads as no record (`paper/refs-checked` warns until the next build), not as
   `stale` as §5 says.
10. **Reading the declared `.bib` files changes what the corpus reports.** On
    `fixtures/accepted-papers/`, four papers have their `.bib` read for the first time:
    `bib/reachable-entry` reports 92, 55, 11 and 75 entries, and `paper/refs-checked` one warning
    each. Of the entries split by the committed `paper.bbl`, 84 are cited (real) and 94 are uncited
    entries of shared libraries — the rule has always judged every entry of the database. Limiting it
    to cited keys needs the keyed citations of Q3 (PR 2). 89 entries carried their only link as
    `howpublished = {\url{…}}`, which the rule did not count; it does now.
11. **Not moved here**: Q2 site #10 (the nudge's `[overwrite]` sentence) and #11 (`.bib` in the edit
    guard) are hooks, PR 3; #29 (`bibInput`'s path guess) is the build, PR 4.

## 9. Second independent refutation (of PR 1 at `b8c92c9`)

A second independent agent, framed to break the claim that `paperSources` names exactly the
databases TeX reads, reviewed PR 1 with pdfTeX 1.40.25 and BibTeX 0.99d. Its report follows
**verbatim**. The only edits: its title line is dropped, and its headings are one level deeper so they
nest here. §9.2 is the author's response.

### 9.1 The report

Target claim: "for any paper, `paperSources(dir)` names exactly the bibliography database(s) TeX/bibtex
actually reads, decided from committed bytes; every consumer (build references step,
extract-ref-facts, bib-authors, reference rules, bib/reachable-entry) uses it;
`bib/filecontents-overwrite` (error, autofix) and `bib/commented-entry` (warn) are correct and silent
on the 6 accepted corpus papers."

Ground truth: pdfTeX 3.141592653-2.6-1.40.25 + BibTeX 0.99d (TeX Live 2023/Debian), `pdflatex -recorder`,
then `bibtex`, reading `.aux` (`\bibdata`), `.fls`, `.log`, `.blg` and the keys in `.bbl`. No biber in
the container, so nothing below about biber is measured. The worktree was not modified (`git status`
clean at the end); all experiments ran on copies in a scratch directory.

### Verdict: DOES NOT HOLD (as stated)

The universal claim fails on reproducible inputs, and one of §8's bibtex measurements is wrong:

- bibtex **does** read an unclosed entry, and every entry after it. The module's scanner drops all
  of them, so `bib/reachable-entry` and `bib/commented-entry` go silent for the rest of the file
  (finding 1). The PR's own test string, run through bibtex, contradicts the test's assertion.
- `\bibliography{\jobname}` with a `filecontents{\jobname.bib}` block is reported as `none`. Every
  consumer then says "no bibliography", which is the silent pass the design was written to remove
  (finding 2).
- The guarantee `bib/filecontents-overwrite` is meant to give ("with it, `shadowed` never arises")
  does not cover a block in an `\input` file. The module reads such blocks; the rule only looks at
  `paper.tex` (finding 3).
- The autofix is idempotent and inserts bytes only. On the next build, though, it overwrites a
  committed or untracked hand-maintained `.bib`, and the paper then compiles differently
  (finding 4).

None of these needs a redesign. The committed-bytes decision, the `[overwrite]` rule and the parse
memo are sound on the corpus. With findings 1–4 fixed (and 5–6, which are cheap), I would expect
**HOLDS WITH CAVEATS**: the notes in 7–17 are scope limits to write down, not defects to block on.

### Harness used for every TeX comparison

`tex.sh <dir>` builds a copy in place:

```bash
cd "$1" && pdflatex -recorder -interaction=nonstopmode paper.tex >/dev/null 2>&1
bibtex paper >/dev/null 2>&1
grep -o '\\bibdata{[^}]*}' paper.aux; grep -E '\.bib$' paper.fls | sort -u
grep -E 'Writing file|already exists' paper.log
grep -E 'Database file|couldn.t open|Illegal|Warning--|skipping' paper.blg
grep -o '\\bibitem\(\[[^]]*\]\)\?{[^}]*}' paper.bbl | sed 's/.*{//;s/}//'   # TeX's keys
```

`probe.ts <dir>` (run with `node`, Node 22 strips types) prints the module's answer. It calls
`paperSources(dir, {files: nodeFiles, latex: latexReader, committed: gitCommitted(spawnProcess(),
process.env)})`, then prints `bibliography.kind`, and for each `databasesOf(...)` its kind and name,
plus `texReads(db)` with the path and entry keys (`(%)` marks an entry with `percent`).

Each case runs the probe on the pristine directory, then `tex.sh` on a copy. Cases with
`\nocite{*}` make TeX print every entry it read. Lint runs are
`node <worktree>/src/cli.ts lint .` from the paper directory.

### Findings

#### 1. bibtex reads an unclosed entry and everything after it; the module reads nothing after it — should-fix (and the §8.5 claim is wrong)

§8.5 / `src/adapters/latex/bibtex.ts:11` say "an entry that is never closed is not read". The test
`bibliography.test.ts:117` asserts `entries("@misc{a,}\n@misc{open, title={x}\n") → ["a"]`.

Reproduction: the test's own string as `refs.bib`, with `paper.tex` =
`\documentclass{article}\begin{document}\nocite{*}\bibliographystyle{plain}\bibliography{refs}\end{document}`.

| case                                                                           | TeX `.bbl` keys       | module `texReads` keys |
| ------------------------------------------------------------------------------ | --------------------- | ---------------------- |
| the test's string (`.blg`: `Illegal end of database file`)                     | `a, open`             | `a`                    |
| `a1` closed; `a2unclosed` missing its final `}`; `a3`, `a4` after a blank line | `a1,a4,a3,a2unclosed` | `a1`                   |
| same, but the open brace is in a field: `title={Two {Unbalanced}, …}`          | `a2brace,a1,a4,a3`    | `a1`                   |

bibtex reports "I'm skipping whatever remains of this entry". It keeps the entry with the fields it
had read, and resynchronises at the next `@`. The module's scanner (`bibEntries`) instead stays
inside the open entry until end of file.

Effect, through the CLI. In this `refs.bib`, `a3` has no url and `a4` sits behind `%`:

```
@misc{a1, title={A}, author={A, B}, year={2020}, url={https://e.org/a1}}
@misc{a2unclosed, title={Two}, author={A, B}, year={2020}, url={https://e.org/a2}

@misc{a3, title={Three}, author={A, B}, year={2020}}
% @misc{a4, title={Four}, author={A, B}, year={2020}}
```

`paperlint lint` prints 1 problem, `paper/refs-checked`. It gives no `bib/reachable-entry` for `a3`
and no `bib/commented-entry` for `a4`. TeX prints `a4, a3, a2unclosed`. A malformed `.bib` is the
moment these rules matter most, and it is where they go silent.

`extract-ref-facts` (the `@retorquere/bibtex-parser` path) recovers on its own and reads
`a1,a2unclosed,a3,a4` here. It still loses a `%`-prefixed entry that the scanner never reached,
because `bibtexView` blanks only the `%` signs the scanner found. In note 16's mixed file, `k6pct` is
lost this way, so the readers still disagree.

Fix: on an `@` inside an open entry at depth 0, or on any `@` at the start of a line, close the
entry the way bibtex does and start the next one. The existing test needs to flip.

#### 2. A declaration whose argument is a macro is `none`, not `undecided`: the `\jobname` idiom reads as "no bibliography" — should-fix

Reproduction:

```latex
\documentclass{article}
\begin{filecontents*}[overwrite]{\jobname.bib}
@misc{jkey, title={J}, author={Doe, J}, year={2024}}
% @misc{jdead, title={D}, author={Doe, J}, year={2020}}
\end{filecontents*}
\begin{document}
Text~\cite{jkey}.
\bibliographystyle{plain}\bibliography{\jobname}
\end{document}
```

- **TeX:** `\bibdata{paper}`, `.fls: OUTPUT paper.bib`, `Database file #1: paper.bib`, `.bbl: jkey`.
- **Module:** `none`. `namesOf` (`bibliography.ts:100-110`) returns null for any argument holding a
  macro. That was meant for `\bibliography{#1}` inside a redefinition, but it also drops `\jobname`
  and `\bibliography{\bibfile}`.
- **Consumers:** `extract-ref-facts` answers `"paper.tex declares no bibliography (no
\bibliography, no \addbibresource)"`, which is false. The references step answers
  `"no bibliography — nothing to check"`. Lint reports nothing about `jkey` (no url) or `jdead`
  (behind `%`), and no `refs-checked` warning. Before `--fix` the only finding is
  `bib/filecontents-overwrite`.

`\jobname.bib` is the standard idiom in biblatex/natbib minimal examples. Fix: a declaration with
a non-literal argument goes to `undecided`, or a new `unresolved` state that consumers must surface.
Resolve `\jobname` → `paper` outright, since the main file is fixed as `paper.tex`.

#### 3. `bib/filecontents-overwrite` does not see blocks in included files; the module reads them — should-fix

§7.2(1) says that with the rule, "the `shadowed` state never arises". The module collects blocks from
`paper.tex` and every own include (`sourcesOf` → `decideBibliography`). The rule reads only
`deps.latex.filecontents(raw)` of `paper.tex` (`bib-rules.ts:333`), and `isMain` returns early for any
other file.

Reproduction, in a git repo:

- `paper.tex`:
  `\documentclass{article}\input{bibblock}\begin{document}Text~\cite{fresh}.\bibliographystyle{plain}\bibliography{refs}\end{document}`
- `bibblock.tex`, committed: `\begin{filecontents*}{refs.bib}` … `@misc{fresh,…}` … `\end{filecontents*}`,
  with no `[overwrite]`.
- `.gitignore` lists `refs.bib`, and a `refs.bib` from an earlier build holds `@misc{stale,…}`.

What each side says:

- **Module:** `embedded:refs [block ow=false]`, reading `bibblock.tex`, keys `fresh`.
- **TeX:** `.log` says `File 'refs.bib' already exists on the system`; `.fls` shows `INPUT ./refs.bib`;
  the `.blg` warns `I didn't find a database entry for "fresh"`; the `.bbl` is empty.
- **Lint:** 2 warnings (`refs-checked`, and `reachable-entry` on `bibblock.tex:2:1: fresh`), and **no
  `bib/filecontents-overwrite`**.

The module and every consumer read `fresh`. This machine's PDF has no reference, and nothing in the
static lint says why.

Fix: run the rule over the blocks of every own include. Report them the way `reachable-entry` already
reports into other files, at the include, with `file:line:` in front. Or have the rule walk
`PaperSources.includes`.

#### 4. The autofix is byte-safe and idempotent, but after the next build it overwrites a committed or hand-maintained `.bib` — should-fix

Byte behaviour (git repo, three blocks, then `lint --fix` twice):

```
< \begin{filecontents*}{refs.bib}            > \begin{filecontents*}[overwrite]{refs.bib}
< \begin{filecontents} [noheader] {other.bib} > \begin{filecontents} [overwrite,noheader] {other.bib}
< \begin{filecontents}[]{third.bib}          > \begin{filecontents}[overwrite,]{third.bib}
second --fix: no diff (idempotent). `[overwrite,]` compiles; LaTeX writes the file.
```

That part holds. The problem is what the fix makes the next build do.

- **(a) Committed `.bib` (the `shadowed` message case).** `refs.bib` is committed and holds `real1`
  and `real2`. A stale block in `paper.tex` holds `oldblock`. The paper cites `real1`. Before the
  fix, TeX reads `refs.bib` and `real1` resolves. Then `lint --fix` and one build: `.fls` shows
  `OUTPUT refs.bib`, the `.blg` warns `I didn't find a database entry for "real1"`, and `git status`
  shows ` M refs.bib`. The committed file is overwritten with the stale block, and the PDF changes.
  The fix chose the block, while the conflict message itself says the two disagree and the author
  may have meant the file.
- **(b) Untracked hand-maintained `.bib` (the `noOverwrite` message case).** `refs.bib` is
  untracked; it is, say, a fresh export from a reference manager holding `zotero1`, the key the
  paper cites. Its sha256 was `36f547ec…` before. After `lint --fix` and one build it is
  `954d09d0…`, and its contents are now `oldblock`. **Unrecoverable:** git never had the file.

ESLint's guidance is that an autofix must not change what the code does. This one changes which
bibliography is typeset and can delete data on the next build.

Fix: make it an autofix only when no file of that name exists, or when the existing file equals the
block (`sameEntries`). Otherwise use `hasSuggestions` with two suggestions: "add `[overwrite]` (the
block wins)" and "delete the block (the file wins)".

#### 5. The parse memo holds up to 63 old versions of `paper.tex` in an editor session: 186 MiB for a 48 KiB paper — should-fix (cheap)

The cache key is correct: the full source text, so any edit is a miss. Correctness also held:
`JSON.stringify(parseLatex(src).root)` was identical before and after calling every `LatexReader`
method twice, on all 6 accepted papers and on `p1`. Each method returned identical results on the
second call, and `parseLatex(src) === parseLatex(src)`. No consumer mutates the shared tree.

But `parse.ts`'s comment says a long editor session "holds a paper's worth of trees, not every
version". What it holds is up to 64 versions of the same file, because each keystroke is a new key:

```
node --expose-gc heap.ts agenticdev-acm26/paper.tex   → src 48 KiB; heap retained by 63 memoised edits: 186 MiB
node --expose-gc heap.ts barovox-acsac24/paper.tex     → src 5 KiB;  …: 17 MiB
```

`heap.ts` runs `parseLatex(src + " ".repeat(i))` for i = 1..63, then measures heap after `gc()`.

Timing does match §8.8: cold 0.49–0.88 s per `paperSources`, warm 30–130 ms. An edited buffer
costs 110–400 ms, which is one reparse.

Fix: a much smaller memo (e.g. 8 entries, LRU), or one keyed by path that keeps only the latest
text.

#### 6. An absolute path in `\bibliography` is `missing` — should-fix (one line)

`\bibliography{<abs>/shared/lib,../shared/rel}`:

- **TeX:** `Database file #1: <abs>/shared/lib.bib`, `#2: ../shared/rel.bib`; `.bbl: abskey,relkey`.
- **Module:** `missing:<abs>/shared/lib`, `file:../shared/rel`.

The cause is `bibDisk.bib` in `src/paper-sources.ts`, which uses `join(dir, name)`; join does not
honour an absolute second argument. Use `resolve`. A personal global library at an absolute path is
a common setup. With this bug the references step drops that database ("not on disk").

### Notes: real divergences, scope to state rather than block on

7. **Two `\bibliography` commands.** `\bibliography{one}` then `\bibliography{two}`. bibtex reads only
   `one.bib` (`.blg`: `Illegal, another \bibdata command`, rc=2). The module reads both. A finding
   for a second declaration would be cheap.
8. **`\bibliography` after `\end{document}`.** TeX writes no `\bibdata`. The module reports
   `file:refs`. Also, `\includeonly{body}` that excludes the file holding an `[overwrite]` block:
   TeX writes nothing and bibtex fails with `couldn't open database file main.bib`, while the module
   reports `embedded`. Q1 does not model `\includeonly` or `\endinput`.
9. **`\ifthenelse{\boolean{anon}}{\bibliography{anon}}{\bibliography{real}}`.** TeX reads `anon.bib`
   only. The module returns `databases` (certain) with both: `opensConditional` excludes
   `ifthenelse` explicitly, and nothing else marks its arguments conditional. Consumers treat it like
   `undecided` (they check both), but the state claims a certainty it lacks.
10. **Two blocks writing `refs.bib`, the first without `[overwrite]`, the second with it.** TeX reads
    the second (`second`). The module takes the first (`blocks.find`) and reads `first`. LaTeX's
    rule is "last write wins once the file exists".
11. **A block behind a false `\newif` switch, with `[overwrite]`, plus a committed `refs.bib`.** TeX
    reads the file (`committed1`). The module returns `databases` / `conflict` with
    `texReads = block` (`draftonly`). `undecided` is computed from declarations only; blocks behind a
    switch are always counted live.
12. **Unmodelled declarations.** `\nobibliography{refs}` (bibentry) writes `\bibdata{refs}` and bibtex
    reads `refs.bib`, but the module returns `none`. `\addglobalbib`, `\addsectionbib`, multibib's
    `\newcites` and bibunits' `\putbib` are also absent. biblatex with `backend=bibtex` and
    `\addbibresource{refs}` (no extension) matched: TeX's `\bibdata{paper-blx,refs}`, module
    `file:refs`. Whether biber accepts the extensionless name is not measured (no biber here).
13. **kpathsea search.** `\bibliography{library}` with `library.bib` only under
    `$TEXMFHOME/bibtex/bib/` and `BIBINPUTS` unset: bibtex reads it (`Database file #1: library.bib`,
    key in the `.bbl`), and the module says `missing`. §8.3's reason ("bibtex reads `BIBINPUTS`,
    which the build does not set") overlooks that kpathsea searches TEXMFHOME by default. The answer
    is right for CI and wrong for a personal `~/texmf` library. Also, the `file` / `missing` state
    reads the disk without asking `CommittedFiles`, so "decided from committed bytes" holds for
    `conflict` only.
14. **What the `CommittedFiles` port is ("index", not "commit") and when its answer flips.**
    - A staged-but-uncommitted `.bib` counts as committed (`true` for a freshly `git add`ed file).
    - A path whose directory is missing, such as outside a sparse cone, gets exit 128 and counts as
      committed. That is harmless, because `disk.bib` is null first.
    - Inside a git worktree it is correct.
    - With `GIT_DIR=.git` in the environment (what a git hook sees at the repository root) and the
      paper in a subdirectory, `git -C <paperdir>` resolves `.git` relative to the paper and exits
      128 (`fatal: not a git repository: '.git'`). Every file then counts as committed, and the same
      paper flips from `embedded` (reading the block) to `conflict` (reading the file). Reproduced.

    Impact is low. The port only decides `conflict` vs `embedded`, and that changes `texReads` only
    for a block without `[overwrite]`, which `bib/filecontents-overwrite` flags at `error` either
    way. So the port changes a message and what is read before the author fixes the error.

    Cost: about 5–10 ms per spawn, one spawn per `paperSources` call only when a block and a file
    of the same name both exist. That is every built paper with a block: 7 spawns per lint, measured.
    It is acceptable, but given the low impact, consider deleting the port and saying "a file of
    that name exists" in the message instead.

15. **The ESLint result cache.** The `bib` rules' output depends on files other than the linted one
    (`.bib`, includes, git's index). `paperlint lint` passes no `--cache`, so it is fine there. But
    a user running `eslint --cache` with the documented `buildConfig` gets stale results when only
    `refs.bib` changes. The reference rules already have this property; it is worth one line in the
    docs.
16. **The readers still disagree on two shapes.** Mixed file
    (`@comment{ @misc{k2inComment,…} }`, an unclosed `k4`, `% @misc{k6pct,…}`, and others):
    - bibtex: `k1,k2inComment,k4unclosed,k5,k6pct,k7,k8paren,k9,k10`;
    - module scanner: `k1,k2inComment` (finding 1);
    - extract-ref-facts: `k1,k4unclosed,k5,k7,k8paren,k9,k10`. The parser drops the `@comment`-wrapped
      entry that bibtex reads, and `k6pct` is lost because the scanner never reached it.

    `bib-authors`' `parseBib` reads `@comment{ @misc{k2inComment,` as one entry with type `comment`
    and key `@misc{k2inComment`. Also, `% see @misc{x,…}` (a `%` with text before the `@`) is an entry
    to bibtex, but `percentBefore` returns null, so `bib/commented-entry` is silent and
    `bibtexView` leaves the `%` in, so the parser drops it.

17. **`paper-typography`'s `bibRange`** (`eslint-rules/paper-typography.ts:102`) is a non-global
    regex: it skips only the first `.bib` block, and it matches a commented-out block. This is a Q3
    site, scheduled for PR 2.

### Attacks that failed (the claim held)

- **Multi-database `\bibliography{a,b}`**, with `a` a file and `b` an `[overwrite]` block: TeX and the
  module both read `a.bib` and `b.bib`, keys `akey`, `bkey`.
- **Subdirectory `\bibliography{bib/refs}`** and **`\bibliography{refs.bib}`** (with extension), and
  `../shared/rel`: they match.
- **`\bibliography` inside `\iffalse`** and **inside a `comment` environment**: both sides say `none`.
- **A `filecontents` name without `.bib` (`{refs}`)**: TeX writes `./refs` and bibtex cannot open
  `refs.bib`; the module says `missing`. They match.
- **A block in an `\input` file with a stale file**, outside git (every file counts as committed): the
  module returns `conflict` → the file (`stale`), and TeX reads `stale`. They match. (Inside git,
  finding 3 applies.)
- **The legacy `\usepackage{filecontents}`**: no `[overwrite]` default in TeX Live 2023. TeX keeps the
  existing file, and the module returns `conflict` → the file. They match.
- **TeX's `filecontents` write** keeps UTF-8 byte for byte and turns a tab into a space. The built copy
  equals the block under `sameEntries`, so an `[overwrite]` paper stays `embedded` after a build.
- **The autofix bytes:** insert-only, idempotent, and `[ … ]` with spaces handled. `[]` becomes
  `[overwrite,]`, which compiles.
- **The parse memo's correctness:** the key is the full text, and the tree is not mutated (finding 5
  is about memory only).
- **The 6 accepted papers:** `bib/filecontents-overwrite` and `bib/commented-entry` are silent on all 6. `bib/reachable-entry` reports 92, 55, 11 and 75, as §8.10 says. The `leaking-queries` paper is
  `none`, matching TeX: it has no `\bibdata`, because it uses `\@input{paper.bbl}`.
- **§8.5, the other three bibtex claims, re-measured:**
  - `% @misc{…}` is read (`dead2020`, `k6pct` in the `.bbl`);
  - `@comment{ @misc{k2inComment,…} }` → the inner entry is read;
  - `@Comment{k3text, …}` without an `@` inside is skipped;
  - a `%` line inside an entry keeps the entry and drops the fields after it (`to sort, need author
or key in k7`).
- **Consumers.** I searched `src/`, `eslint-rules/`, `skills/`, `bin/`, `lib/`, `hooks/` and
  `scripts/`, and every hit was checked.
  - Nothing outside the module decides Q2, except the declared later-PR sites: the nudge hook (PR 3)
    and `bibInput` (PR 4, which reads TeX's own `.aux`).
  - These hits read the recorded `.blg` / `.bbl`, or only skip blocks (Q3): `check-render.sh`,
    `check-numbers.sh`, `prose-lint.mjs`, `paper-prose.ts`, `latex-language.ts`.
  - These take an explicit path: `verify-cites.mjs`, and `check-deanon.sh` (artifact scan).
- **The PR's tests:** `vitest run` on `paper-sources`, `bib-rules`, `bibliography` and `git`:
  61 tests passed. `e2e-tex paper-sources.e2e.ts`: 6 passed.

### Where this review may be wrong

- Every TeX measurement is one TeX Live (2023/Debian) with plain `bibtex`. Behaviour on bibtex8/bibtexu,
  on biber, and on another LaTeX kernel date (the `filecontents` options) is not measured.
- On findings 5 and 14, "should-fix" versus "note" is a judgement call. Neither changes what TeX
  reads.
- Finding 4(a) assumes the committed file is the one the author means. When the block is the
  intended source, the fix is right, and that is why I suggest a suggestion and not a deleted fix.

### 9.2 Response: each finding fixed with a test first, TeX as ground truth

Every finding and note was first written as a failing test. Where TeX's answer was in question, the
shape was added as a planted paper (`fixtures/paper-sources/v6`–`v16`) with its `tex-truth.json`
recorded by `test/e2e/tex/paper-sources.e2e.ts`, and `src/paper-sources.test.ts` compares the
module with that file. For an `undecided` bibliography it checks that TeX's choice is among the
candidates.

| paper                                           | TeX reads → `.bbl`                  | module before                           | module now                                    |
| ----------------------------------------------- | ----------------------------------- | --------------------------------------- | --------------------------------------------- |
| v6 unclosed entry                               | `refs.bib` → a1, a2unclosed, a3, a4 | a1 only                                 | a1, a2unclosed, a3, a4 (a4 behind `%`)        |
| v7 field brace never closed                     | `refs.bib` → a1, a2brace, a3, a4    | a1 only                                 | a1, a2brace, a3, a4                           |
| v8 `\jobname`                                   | `paper.bib` (the block) → jkey      | `none`                                  | `embedded:paper` → jkey, jdead                |
| v9 two `\bibliography`                          | `one.bib` → onekey                  | one, two                                | `one` only                                    |
| v10 `\ifthenelse`                               | `anon.bib` → anonkey                | `databases` (anon, real)                | `undecided` (anon, real)                      |
| v11 two blocks, the second `[overwrite]`        | the second block → second           | the first block                         | the second block                              |
| v12 `[overwrite]` block behind a false `\newif` | `refs.bib` → committed1             | `conflict` → the block                  | `undecided`: `file` or `conflict` → the block |
| v13 `% see @misc{…}`, `@comment{ @misc{…} }`    | pt1, k2inComment, ok1               | pt1 not marked; the parser dropped both | pt1 marked `%`; the parser reads all three    |
| v14 `\nobibliography{refs}`                     | `refs.bib` → nobkey                 | `none`                                  | `file:refs`                                   |
| v15 `\bibliography` after `\end{document}`      | none                                | `file:refs`                             | `none`                                        |
| v16 block in an `\input` file                   | `refs.bib` (committed, stale)       | `conflict` → `refs.bib` (already right) | unchanged; the rule now reports the block     |

**1. Unclosed entries.** Measured further than the report did, with `\nocite{*}` on 20 shapes. An
`@` at brace depth 0 inside an open entry starts the next entry (`title={T} @misc{y`, a field
whose brace is never closed, an entry never closed). An `@` at depth ≥ 1 is text even at the start
of a line: `abstract={one⏎@line two}` keeps one entry. So the report's "or on any `@` at the start
of a line" does not hold, and only depth 0 resynchronises. Two more rules were measured and
modelled. An `@` right after a comma, where bibtex expects a field name, is swallowed with the entry
it starts (`@misc{m1, title={A},⏎@misc{m2…}⏎@misc{m3…}` → m1, m3). An entry still open at the end
of the file is read. **Not modelled:** an entry bibtex reaches by resynchronising is dropped when
nothing follows it in the file. Measured in six shapes and not understood. The module keeps such an
entry, so it reads one entry too many, never one too few. The scanner test at
`bibliography.test.ts` now asserts TeX's answer, and §8.5 is corrected.

**2. `\jobname`.** It is expanded to the main file's name, in a declaration and in a block's file
name. Any other macro in a name gives a new database state, `unresolved`. The bibliography is then
`undecided`, and every consumer names it, never silence. `#1` (a parameter of a definition) is no
declaration where it is written.

**3. Blocks in included files.** `PaperSources.blocks` lists every live block that writes a `.bib`,
in the main file and in its own includes (in TeX's order since §10). `bib/filecontents-overwrite` judges all of them. A block in
an included file is reported at its `\input`, with `bibblock.tex:1:1:` first. There is no fix for it
from `paper.tex`: the edit belongs to that file.

**4. The fix overwrites a file.** The fix is offered only when no file of the block's name exists in
the paper's directory, or when that file holds the block's entries (TeX's own copy). Otherwise the
rule has no fix and offers a suggestion. The suggestion names the file the next build would
overwrite, and the message says which case it is. A committed file gets `shadowed`. A local-only
file gets `wouldOverwrite`, which covers the hand-maintained reference-manager export of 4(b). The
report's second suggestion, "delete the block (the file wins)", is left to the author: a deletion is
not an edit a linter should offer.

**5. The memo.** It is now bounded by the source text it holds, 512 KiB, least recently used out, and
the comment says why. The reviewer's "e.g. 8 entries" was tried first and failed the gate: a corpus
paper with ten includes is read in a cycle by the rules, so with 8 trees every read missed, and the
corpus lint (`accepted-papers.test.ts`) passed its 120 s timeout. With the byte bound that test runs
in about 115 s as before, and, measured with the reviewer's method, 63 edits of the 48 KiB ACM paper
retain 27 MiB, down from 186 MiB. A warm `paperSources` call costs 50–76 ms. `parse.test.ts` holds
the bound both ways: eleven 30 KiB files read in a cycle all stay, and past 512 KiB the least
recently used tree goes first.

**6. Absolute paths.** `resolve`, not `join`.

**Notes 7–17 — what changed, and what is now written down as not modelled:**

- 7 (two `\bibliography`): **fixed**. Only the first unconditional `\bibliography` /
  `\nobibliography` counts (v9).
- 8 (`\bibliography` after `\end{document}`): **fixed** (v15). **Not modelled:** `\includeonly`
  and `\endinput`. The module reads every include, so a block in a file `\includeonly` excludes is
  still `embedded`.
- 9 (`\ifthenelse`): **fixed**. Its three groups are read as conditional (v10).
- 10 (two blocks for one file): **fixed**. The blocks run in order: a block writes when it has
  `[overwrite]` or no file exists yet (v11).
- 11 (a block behind a switch): **fixed**. Its database is both candidates (v12). §10 widens this
  to every block that can be the last to write.
- 12: **fixed** for `\nobibliography` (v14), `\addglobalbib` and `\addsectionbib`. **Not
  modelled:** multibib's `\newcites` and bibunits' `\putbib`. Whether biber accepts an
  extensionless `\addbibresource{refs}` is not measured (no biber).
- 13 (kpathsea): **not modelled**, and now stated. A `.bib` that bibtex finds only through
  kpathsea's default tree (`~/texmf/bibtex/bib/`) is `missing` to the module. The answer is right for
  CI and wrong for a personal library there. `file` and `missing` read the disk and not
  `CommittedFiles`: an untracked `.bib` that a paper declares is still read, because checking a
  bibliography the author has not committed yet is better than skipping it. "Decided from committed
  bytes" therefore holds for a block against a file of the same name, and nowhere else.
- 14 (`CommittedFiles`): **kept**, with git's own variables (`GIT_DIR`, `GIT_WORK_TREE`, …) no longer
  passed to the child process. That was the flip the report reproduced. The reviewer suggests
  dropping the port. Without it, `conflict` would be "a file of that name exists and differs". That
  is the machine-dependent answer the first refutation (§7.1, finding 2) rejected: on a built working
  copy the block would read as shadowed, and on a fresh checkout as embedded. The port is the only
  thing that keeps TeX's own output from counting against the block. Its cost (one `git ls-files` per
  `paperSources`, only when a block and a file of the same name both exist) and its semantics are
  stated where it is defined. "Committed" means in git's index, so a staged file counts.
- 15 (`eslint --cache`): **documented** on the `bib` rule pages. Their findings depend on files
  other than the linted one. `paperlint lint` does not cache.
- 16: **fixed** for `% see @misc{…}` (the `%` and the text after it, up to the `@`, are the entry's
  `percent`) and for `@comment` (its word is a `comments` span). `bibtexView` blanks both, so the
  parser in `extract-ref-facts` and the reader in `bib-authors` read what bibtex reads (v13).
  **Measured and not modelled:** an `@comment{ @misc{…} }` that is the last thing in the file is
  dropped by bibtex (the same end-of-file quirk as finding 1), and the module reads it.
- 17 (`bibRange`): PR 2, as planned.

**Verdict after response:** findings 1–6 are fixed, each red first. Every note is either fixed or
stated above as not modelled. The response has not been through a third refutation.

## 10. Code review on the PR (Codex, on `0543c5f` and `e34e712`)

The automated reviewer left five findings on #174. Each became a planted paper whose `tex-truth.json`
was recorded by `pdflatex -recorder` and `bibtex`, then a failing test, then the fix.

| paper                                                                         | TeX reads → `.bbl`                   | module before                             | module now                                  |
| ----------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------- |
| v17 `\input{bibsetup}` (`\bibliography{first}`) before `\bibliography{later}` | `first.bib` → firstkey               | `file:later`                              | `file:first`                                |
| v18 an include's `[overwrite]` block, then the main file's                    | the main file's block → mainblock    | the include's block                       | the main file's block                       |
| v19 `\ifanon\input{anonbib}\fi` before `\bibliography{real}`                  | `anon.bib` → anonkey                 | `databases`: real                         | `undecided`: anon, real                     |
| v20 `[overwrite]` blocks in `\ifanon … \else … \fi`                           | the first block → anonblock          | `undecided`: missing, the second block    | `undecided`: missing, the first, the second |
| v21 `[overwrite]` blocks behind two independent switches                      | the first block → shortblock         | `undecided`: missing, the second block    | `undecided`: missing, the first, the second |
| v22 `thebibliography` after `\end{document}`                                  | none                                 | `thebibliography`                         | `none`                                      |
| v23 `\input{parked}` after `\end{document}`                                   | inputs: `paper.tex` only             | `parked.tex` a file of the paper          | not a file of the paper                     |
| v24 `@`, `)`, `{"}` inside quoted fields                                      | q1–q5                                | q1–q5 and three entries that do not exist | q1–q5, each entry whole                     |
| v25 committed `refs.bib`, same entry, other `@string`                         | the file (`.bbl` holds "File Venue") | `embedded`: the block                     | `conflict`: the file                        |

**1. Execution order (P1).** The decision read the main file's declarations and blocks, then each
include's: grouped by file. TeX reads one stream. The decision now reads the assembled paper (the main
file with every include spliced where it stands, the text the other rules already parse) and places
each declaration and block back in the file that holds it (`BibPaper`, `BibPiece` in the port). The
class had three members, all fixed by the one change: the order of declarations (v17), the order of
blocks for one file (v18), and the context around an include, so an include inside a conditional is
conditional (v19). Files found only on paperlint's inputs path are read too, as TeX reads them.
**Not modelled:** an `\input` inside a macro's body. The assembly splices no include there (it
expands no macro, `src/domain/paper-source.ts`), so what that file declares is not seen.

**2. Every block that can win (P2).** The candidates were "no switched block runs" and "all run". The
decision now follows every run the blocks can make: a sure block runs, a switched one may or may not.
Runs that leave the same block are one outcome, so there are at most the blocks and one, and the
first is the run where no switched block runs. A sure `[overwrite]` block after switched ones always
wins, so that bibliography is now `databases`, not `undecided`. A switched block without
`[overwrite]` beside a committed file is an outcome of its own: TeX reads the file, and the block is
shadowed (`conflict`).

**3. After `\end{document}`.** `liveRoot` (in `parse.ts`) is the part of a source TeX reads. The
`thebibliography` lookup, the include reader, the block reader and the declaration scan use it. The
class, searched in the adapter: every walk of the whole tree. The include reader was a member (v23,
Q1). `headings.ts`, `layout.ts` and `rendered.ts` also walk past `\end{document}`. They answer other
questions (outline, lists, rendered prose) for other rules, and are left to those rules' owners.

**4. Quoted fields.** Measured with bibtex 0.99d first:

| probe                                                   | bibtex reads                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `note = "mail a@b.org"`                                 | the entry, whole                                                  |
| `note = "x {"} @y"`                                     | the entry, whole                                                  |
| `@misc(p1, note = "a ) b", …)`                          | the entry, whole                                                  |
| `title = {A "quoted @ thing}`                           | the entry, whole                                                  |
| `note = "open @misc{q7…` (never closed)                 | q6 only, to the end of file                                       |
| `note = "a } b"` in a `{…}` entry, and in a `(…)` entry | the entry ends at the `}` ("Unbalanced braces"), the next is read |
| `note = "n" @misc{q11…`                                 | q10, q11 (resync, as before)                                      |
| `@string{em = "x@y.org"}`, `note = "a" # "b@c"`         | as written                                                        |

The scanner keeps a quote state: a `"` at depth 0 opens or closes it; inside it `@` and `)` are
text and braces still nest. A `}` at depth 0 ends the entry in either kind of entry.

Before a fourth hand-written rule, three parsers were run on the eleven measured shapes:

- `@retorquere/bibtex-parser` 10.0.2 (already a dependency) gets quotes, `@string` and `@preamble`
  right. It differs from bibtex on five shapes: an open quote, an unclosed entry followed by
  `% @misc`, an `@` after a comma, `@comment{ @misc{…} }` and `% see @misc{…}`.
- bibtex-tidy and citation-js throw on every malformed shape: neither recovers.

None reproduces bibtex's recovery, so the scanner stays. Nothing in this PR switches parser.

**5. `@string` and `@preamble` in a copy.** `BibText.commands` holds them. Two texts are alike when
their entries and commands are, in order. Text bibtex skips between them still does not count. A
committed `.bib` whose `@string` differs from the block's is a `conflict` (v25), and
`bib/filecontents-overwrite` offers a suggestion, not a fix.

The bib rules' two corpus tests now carry an explicit timeout. Linted by the bib rules alone, the
assembled ACM paper is parsed there and nowhere else (about 2.5 s, 4.5 s under coverage). In
`paperlint lint` the register, claim-provenance and venue rules parse that text too, a memo hit.

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
