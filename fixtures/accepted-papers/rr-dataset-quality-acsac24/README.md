# R+R: Security Vulnerability Dataset Quality Is Critical

- **Authors:** Anurag Swarnim Yadav, Joseph N. Wilson
- **Source:** arXiv [2503.06387](https://arxiv.org/abs/2503.06387), e-print `https://arxiv.org/e-print/2503.06387`
- **Venue:** ACSAC 2024 — «To be published in Proceedings of the 2024 Annual Computer Security Applications Conference» on the arXiv page, and in the conference's final program
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the arXiv page states.
  The files from the e-print are redistributed under it; the changes are listed below.

## Files

| file | whose |
| --- | --- |
| `paper.tex` | the authors' `ACSAC2024_IEEE.tex`, renamed; content unchanged |
| `paper.bbl` | the authors' `ACSAC2024_IEEE.bbl`, renamed to match |
| the section `.tex` files, `ACSAC2024_bibliography.bib`, `IEEEtran.cls` | the authors', unchanged |
| figures (`beam_size.png`) | blank placeholders of the authors' figures, same size (below) |
| the vendored `.sty` files | TeX Live's (below) |
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `page-count.json`, `README.md` | fixture scaffolding, ours |

## Built, not only read

This paper is built by `test/e2e/tex/page-count.e2e.ts` on paperlint's own TeX Live, and the end of
its body is checked against `page-count.json`. To build there:

- **Every figure is a blank placeholder of the same size**: a one-page PDF with the original's page
  box, or a white PNG/JPEG with the original's pixel size and resolution. The layout does not move:
  built both ways, every page ends on the same word, and the bibliography starts on the same page.
- **The packages paperlint's TeX Live does not install are vendored beside the paper**, unchanged
  from TeX Live 2026, each under the free licence TeX Live distributes it with: `algorithmic.sty`, `cleveref.sty`.

## Where the body ends

Page 11 ends with «7. Conclusion» in the right column; page 12 opens with «Appendix A. DETAILED RESULTS» — the appendix tables, placed before the bibliography — with nothing above it. The appendix is not body wherever it sits, so the body is 11 pages; «References» starts at the top of page 15.

| ends at | on page | body pages |
| --- | ---: | ---: |
| appendix | 12 | 11 |

Established by rendering the built PDF and looking at the page, not by the detector.
