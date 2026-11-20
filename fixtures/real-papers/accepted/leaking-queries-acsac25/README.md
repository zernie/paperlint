# Leaking Queries On Secure Stream Processing Systems

- **Authors:** Hung Pham, Viet Vo, Tien Tuan Anh Dinh, Duc Tran, Shuhao Zhang
- **Source:** arXiv [2510.12172](https://arxiv.org/abs/2510.12172), e-print `https://arxiv.org/e-print/2510.12172`
- **Venue:** ACSAC 2025 — «to be accepted in ACSAC 2025» on the arXiv page, and in the conference's final program
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the arXiv page states.
  The files from the e-print are redistributed under it; the changes are listed below.

## Files

| file | whose |
| --- | --- |
| `paper.tex` | the authors' `main_full_version.tex`, renamed; ONE line changed, below |
| `paper.bbl` | the authors' `main_full_version.bbl`, renamed to match |
| `sections_full_version/*.tex`, `IEEEtran.cls` | the authors', unchanged |
| figures (`Figures/*.pdf`) | blank placeholders of the authors' figures, same size (below) |
| the vendored `.sty` files | TeX Live's (below) |
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `page-count.json`, `README.md` | fixture scaffolding, ours |

**The one changed line.** The e-print ships its `.bbl` and no `.bib`, and `paperlint build` runs
bibtex, which would find no database and empty the bibliography. `\bibliography{main_full_version}`
is replaced by `\makeatletter\@input{paper.bbl}\makeatother` — what `\bibliography` itself typesets,
without the line that makes bibtex run. Built both ways, every page ends on the same word. (Not
`\input{paper.bbl}`: lint follows it and parses the `.bbl` as JavaScript — paperlint#153.)

## Built, not only read

This paper is built by `test/e2e/tex/page-count.e2e.ts` on paperlint's own TeX Live, and the end of
its body is checked against `page-count.json`. To build there:

- **Every figure is a blank placeholder of the same size**: a one-page PDF with the original's page
  box, or a white PNG/JPEG with the original's pixel size and resolution. The layout does not move:
  built both ways, every page ends on the same word, and the bibliography starts on the same page.
- **The packages paperlint's TeX Live does not install are vendored beside the paper**, unchanged
  from TeX Live 2026, each under the free licence TeX Live distributes it with: `algorithm.sty`, `algorithmic.sty`, `listings.sty`, `listings.cfg`, `lstmisc.sty`, `lstpatch.sty`, `multirow.sty`.

## Where the body ends

Page 13 opens with Table 6 across both columns; the left column and the top of the right one are body (section 7, «8. Conclusions»); «References» starts in the right column.

| ends at | on page | body pages |
| --- | ---: | ---: |
| references | 13 | 13 |

Established by rendering the built PDF and looking at the page, not by the detector.
