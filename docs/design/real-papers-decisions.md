# Real-papers corpus and the bibliography build: the decisions, and why

**Why this file exists.** One working session (2026-11-27, Almaty time) made about 25 decisions
about the real-papers test corpus (`fixtures/real-papers/`) and how `paperlint build` treats a
bibliography. Several were reversed within the hour. The author asked for every fork to be written
down with its reasons, so a later revisit starts from the evidence instead of from the first idea
that comes to mind again.

Evidence levels: **[A]** measured by a command in the session, with its output quoted ·
**[B]** read in this repository's code or docs, with the line · **[C]** stated by a reviewer or
subagent and not re-run · **[D]** inferred.

## Summary

| #   | question                                                 | outcome                                                    | state                       |
| --- | -------------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| 1   | Test the hand-written `record-by-hand.json`, or run TeX? | run TeX and snapshot its record                            | ⏸ corpus PR not started     |
| 2   | How does the corpus get the TeX packages it needs?       | derive them from TeX's own errors                          | ⏸ how they reach CI is open |
| 3   | Images the fixtures do not ship                          | graphicx draft mode, only for papers that fail on a figure | ⏸ not built                 |
| 4   | Install the whole TeX Live?                              | no                                                         | ✅                          |
| 5   | `paperlint build` with packages no preset names          | issue #702 (P0)                                            | ⏸ three fixes, none chosen  |
| 6   | bibtex wipes a shipped `paper.bbl`                       | **latexmk's rule**, PR #718                                | ✅ in draft PR              |
| 7   | biblatex and biber                                       | issue #717 (P1)                                            | ⏸                           |
| 8   | #576 size check, #555, #554                              | paused by the author                                       | ⏸                           |

---

## 1. The corpus record: run TeX, not a hand-written mock

**Question.** 200 of the 206 corpus papers carry `record-by-hand.json`, a hand-written list of the
files TeX would read. The plan for paperlint#576 was a better test of that list.

**Decision (the author).** The author objected: "why not run TeX and avoid hacks?" Run TeX once
per paper and commit TeX's own record as `tex-truth.json`, as the six older accepted papers have.

**Evidence.**

- [B] `fixtures/real-papers/preprints/README.md:99`: "**The record is not TeX's answer.** …
  Nothing was compiled. … what is measured here is measured on a belief about TeX".
- [B] `src/tex-paper.ts:58-68`: a file missing from the record "silently contributes nothing", so
  a wrong record makes lint judge the wrong text without saying so.
- [A] Cost: local `npm test` and `test:changed` +0 s, because they read the committed snapshots.
  The TeX e2e that re-checks them pays one build per paper, ~8.5 min serial for all of them
  (506 s for the successful builds).

**Rejected.** Only testing the mock better (the first plan for #576 part (a)).

## 2. TeX packages the corpus needs

**Question.** The first build of all 206 papers compiled 11.

**Evidence.**

- [A] First-error scan of all 206 papers: compiled 11; a `.sty`/`.cls` not in the tree
  **155**; a figure not in the fixture 38; other 2. Top missing: `tcolorbox` 13,
  `algpseudocode` 11, `makecell` 10, `breakurl` 10, `wrapfig` 9.
- [B] `src/toolchain.ts:14` installs `scheme-basic` plus the packages the venue presets declare
  (`src/cli.ts:347`), and `src/engine.ts:97-101` prefers that tree over the system TeX. The tree
  was never calibrated on the corpus, because the corpus was never compiled.

**Decision (assistant, the author agreed to the order).** Derive the package list from the build's
own errors and never write it by hand: build, read the missing file TeX names, look it up with
`tlmgr search --file`, install, and repeat.

- [A] Five rounds found 62 → 38 → 25 → 10 → 6 new names, and the tree grew 329 → 469 MB.
- [A] Compile counts: start 11 → install loop 17 → draft mode (§3) 156 → font packages ~163.
- [A] A missing package can hide behind another error: 9 papers failed on
  ``! Package fontenc Error: Encoding file `lgrenc.def' not found``.
- [A] The ~43 papers still failing lack a figure or data file even in draft mode (22), have real
  source errors, or need `svglov3.clo` (2), which is in no TeX Live package. These go in a
  `NOT_BUILT` list with their reason, and a test checks that each still fails.

**Open: how the ~150 packages reach CI.** The recommendation, a corpus preset in
`fixtures/real-papers/`, was refuted by an independent review on three counts:

- [C] `paperlint toolchain` would not see it. With no root `paperlint.json`, `papersRoots` falls
  back to `papers` (`lib/paper-config.ts:102`, `src/cli.ts:2210-2220`).
- [C] The CI cache key is `hashFiles('presets/*.jsonc')` (`.github/workflows/ci.yml:390`), so a
  preset outside `presets/` would reinstall every run.
- [C] 90 papers already extend a venue preset, so a corpus preset changes the venues they resolve.

The other option, a `tlmgr` line in the workflow, breaks the rule that a CI step decides nothing.
Nothing has been chosen yet.

## 3. Figures the fixtures do not ship

**First plan, rejected.** A placeholder image for each figure TeX cannot find. [B] The record keeps
every file TeX read (`src/domain/tex-run.ts:94-108`). The placeholders would enter it, and
`changesSince` (`src/domain/sources-record.ts:110`) would flag each one as deleted, so the record
would read as stale and hold the TeX rules back again.

**Second plan.** graphicx draft mode (`\PassOptionsToPackage{draft}{graphicx}`): TeX draws an empty
box and never opens the image. [A] On one paper: exit 0, zero "not found".

**Narrowed after review.**

- [C] Draft mode for every paper would change five existing snapshots:
  `leaking-queries-acsac25/tex-truth.json:175` hashes a real PDF figure.
- Final plan: a normal build always, and draft mode only for the papers that fail on a missing
  figure. Those papers are listed, with a test that each still fails without draft mode.
- [C] A draft-mode record is TeX's answer for a build nobody ships, so it needs its own name or a
  field that says so.

## 4. Installing the whole TeX Live

| set                            | packages | size [A]              |
| ------------------------------ | -------- | --------------------- |
| the tree after §2              | 387      | 418 MB (`du`: 469 MB) |
| `scheme-basic`                 | 119      | 96 MB                 |
| `collection-latexextra` + deps | 2,251    | 2.0 GB                |
| `scheme-medium`                | 1,485    | 2.4 GB                |
| `scheme-full`                  | 5,052    | 9.4 GB                |

**Decision (assistant): no.**

- 9.4 GB nearly fills the 10 GB GitHub Actions cache of the repository.
- `paperlint toolchain` is what an author installs on a laptop.
- It still would not build every paper: `svglov3.clo` is in no package, and some fixtures lack their
  data files.

`collection-latexextra` (2 GB) stays a candidate opt-in answer to #702.

## 5. Authors' own packages: paperlint#702

[A] A three-line `article` with `\usepackage{makecell}` fails with
``! LaTeX Error: File `makecell.sty' not found.``, and nothing names a fix. Filed as P0, with
three fixes left to the maintainer:

1. fall back to the TeX Live on the PATH when it has the file;
2. offer to install the CTAN package that owns the missing file;
3. a wider base set.

## 6. bibtex and a shipped `paper.bbl`: paperlint#708, PR #718

### The defect

- [C] The first review said bibtex might wipe a shipped `paper.bbl`, but did not run it.
- [A] Measured: on a paper that ships `paper.bbl` but no `.bib`, bibtex truncated `paper.bbl` in
  place, 17,682 → 49 bytes. With `\bibliographystyle{nosuchstyle}` it left 0 bytes, even though
  the `.bib` was there.
- [A] 17 of the 206 corpus papers ship `paper.bbl` and no `.bib`. arXiv keeps the `.bbl` and often
  drops the `.bib`.

### The cases

Which kind of bibliography a paper has is TeX's convention, not a paperlint setting: `paper.tex` →
`paper.aux` (`\bibdata`, `\bibstyle`) → bibtex → `paper.bbl` → pdflatex. The build reads the
`.aux`. [A] "Does the `.bib` exist" must be asked the way bibtex finds files: 3 corpus papers name
`IEEEabrv`, which lives inside TeX Live, not in the paper folder.

| case                                                         | what the build does now                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| no `\bibdata`, or an empty `\bibliography{}`                 | nothing [B] `src/latex-log.ts:274` drops empty names                                                              |
| every `.bib` and the `.bst` found (paper folder or TeX tree) | runs bibtex                                                                                                       |
| something not found, `paper.bbl` on disk                     | typesets the `.bbl` as it is; the compile line says `bibtex not run (refs.bib not found), references not checked` |
| something not found, no `paper.bbl`                          | stops: `bibtex was not run: a file it would read cannot be found`, naming the files                               |
| `.bib` found and a `paper.bbl` the author keeps              | runs bibtex: the `.bib` is the source                                                                             |
| a name that differs only in letter case                      | not found by `kpsewhich` on Linux, so one of the two rows above [D]                                               |

### The forks, in order

1. **Design: one `BibSource` type** (none / run-bibtex / shipped-bbl / missing), with the files
   looked up by `kpsewhich`. The author asked for a review first, and an independent review found
   two holes:
   - [C] `2609.32684v1` names `{anthology,custom}` but ships only `custom.bib`, plus `paper.bbl`.
   - [C] "Both exist → run bibtex" still wipes the `.bbl` when bibtex fails.
2. **A `.bib` and a `paper.bbl` both present.** The author picked "run bibtex, as TeX does".
3. **The cases left out.** Absolute `\bibliography` paths stay on #197, `filecontents` on #176, a
   hand-written `thebibliography` on #644. Biber was read and filed as #717 (§7).
4. **How to stop bibtex wiping a `.bbl`.** The options were: back it up and restore it on failure
   (recommended); never overwrite a `.bbl` this build did not write; or build in a scratch folder
   (safest, but its own PR). The author picked **never overwrite**.
5. **Some `.bib` missing, a `.bbl` present.** The author picked "typeset the shipped `.bbl` and say
   which `.bib` were missing", which is what arXiv does.
6. **A stale `.bbl` against a shipped one.** The author picked "the previous build record says
   whether bibtex wrote it". While coding it, the assistant found a hole: a bibtex success followed
   by a pdflatex failure writes no record. It switched to the `paper.blg` file as the marker.
7. **Reference checks with a shipped `.bbl`.** The author picked "the record says so, and one line
   in the build output". The line shipped. The record lists `paper.bbl` among its inputs, with
   `bibtex ran: false`, and has no field of its own for this.
8. **Reversal: latexmk's rule.** Under "never overwrite", a paper that ships `paper.bbl` next to
   its `.bib` never runs bibtex, so the bib rules go silent.
   - [B] `src/bib-rules.ts:7`: "They judge the entries of the databases bibtex OPENED".
   - [A] 92 + 11 + 77 = **180** `bib/reachable-entry` findings would have dropped to zero on
     barovox, rr-dataset-quality and secure (ACSAC'24).
   - The author picked **latexmk's rule**: run bibtex only when every `.bib` and the `.bst` are
     found, otherwise typeset the shipped `.bbl`. This reverses forks 4 and 6 and restores fork 2.

### Prior art

latexmk `$bibtex_use`, default 1 [C] (read by a fetch subagent from the CTAN mirror copy of the
manual dated 2026-11-25; its quotes were capped at 125 characters):

- 0: "never use bibtex or biber; never delete .bbl files in a cleanup."
- **1: "only use bibtex or biber if the bib file(s) exist; never delete .bbl files in a cleanup."**
- 1.5: "only use bibtex or biber if the bib files exist; conditionally delete .bbl files in a cleanup"
- 2: "run bibtex or biber whenever it appears necessary to update the bbl file(s), without testing
  for the existence of the bib files; always delete .bbl files in a cleanup."

The manual's introduction warns that with the bib files missing and the bbl files provided, using
bibtex "will result in incorrect overwriting of the precious bbl files".

**Lesson.** The first design, which tracked whose `.bbl` it was, cost most of the time and was
replaced by a rule latexmk has had for years. Read the prior art before designing.

### What it does not guard

- A `.bib` that is found but has a syntax error still truncates a shipped `paper.bbl`. The build
  fails red and names bibtex's error.
- A stale `.bbl` whose `.bib` the author deleted is now typeset as shipped, not stopped. The compile
  line says the references were not checked.

If either matters, the scratch-folder build from fork 4 is the fix by construction.

### Measured on PR #718

- [A] On `origin/main` the two new fixtures (`fixtures/build-e2e/shipped-bbl`, `missing-bib`) give
  7 red checks.
- [A] On the branch: `build.e2e` 104 passed, 2 skipped; unit tests 44 passed, with 100% statement
  and branch coverage on `src/domain/bib-source.ts`, `src/bib-input.ts` and `src/latex-loop.ts`.
- [A] The corpus snapshots did not change, and Codex found no issues on 79b088f.

## 7. biblatex and biber: paperlint#717

[A] The build never runs biber, and 3 corpus papers use biblatex. A minimal biblatex paper with a
valid `.bib` fails on undefined references, and the toolchain installs no `biber` binary.

Filed as P1, not P0: it fails loudly and loses no data. The two options are not decided:

1. install biber and run it when TeX writes a `.bcf` (latexmk's rule);
2. at least name the fix.

## 8. Paused by the author

- **#576 size check.** [A] The collector has no size floor, only a 300 KB cap, and all 200 papers
  are under it (max 299,962 bytes). 36 papers' text bytes differ from the manifest's `size_bytes`
  (32 preprints, 4 accepted). `preprints/2611.08144v1` is missing the `main.bbl` (11,546 bytes)
  that its arXiv archive has. The recommended option was the cap plus equality, with the 36 as a
  shrink-only known list.
- **Where #576's real-set check runs.** [A] It takes 86 s on 206 papers. The recommended option was
  the `real-papers` vitest project, not the unit project.
- **#555.** The proposal: one JSON record per classified finding, a schema checked by a lint rule,
  precision per rule computed from the labels, and the priority raised to P1. The issue is unchanged.
- **#554** (barovox: `bib/reachable-entry` lints 83, the baseline records 92). Not examined.
  Under latexmk's rule barovox runs bibtex again, but whether the gap is closed was not checked.
