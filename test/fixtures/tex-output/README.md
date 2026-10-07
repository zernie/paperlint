# TeX's own output, captured

The files pdflatex (`-recorder`) and bibtex left beside a planted paper of `fixtures/paper-sources/`,
kept whole as the input of the readers' tests (`src/adapters/tex-output/index.test.ts`,
`src/domain/tex-run.test.ts`, `src/sources-record.test.ts`). They are TeX's answer, not text written
for a test.

One directory per paper, named as the planted paper is, holding:

| file             | what it is                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| `first-pass.fls` | the `.fls` of the first pdflatex pass (no `.aux`, `.toc` or `.bbl` yet)   |
| `paper.fls`      | the `.fls` of the last pass                                               |
| `paper.aux`      | the `.aux` of the last pass                                               |
| `paper.blg`      | bibtex's log                                                              |
| `paper.bbl`      | what bibtex wrote                                                         |

`plain-block/` is no planted paper: a `filecontents*` block without `[overwrite]` over a `.bib` that does
not exist yet, which no planted paper has (`source.tex` is its source).

Captured with TeX Live 2026: copy the paper to an empty directory, then `pdflatex -recorder
-interaction=nonstopmode -file-line-error paper.tex` (copy `paper.fls` as `first-pass.fls`), `bibtex
paper`, and `pdflatex` twice more. Two lines are rewritten so a file does not name the machine it came
from: the `PWD` line of each `.fls` is `/work/paper`, and TeX Live's root in its `INPUT` lines is
`/usr/share/texlive`.
