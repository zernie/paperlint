# A Fly on the Wall — Exploiting Acoustic Side-Channels in Differential Pressure Sensors

- **Authors:** Yonatan Gizachew Achamyeleh, Mohamad Habib Fakih, Gabriel Garcia, Anomadarshi Barua, Mohammad Al Faruque
- **Source:** arXiv [2409.18213](https://arxiv.org/abs/2409.18213), e-print `https://arxiv.org/e-print/2409.18213`
- **Venue:** ACSAC 2024 — «Accepted to ACSAC 2024» on the arXiv page, and in the conference's final program
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the arXiv page states.
  The files from the e-print are redistributed under it; the changes are listed below.

## Files

| file | whose |
| --- | --- |
| `paper.tex` | the authors' `barovox.tex`, renamed; content unchanged |
| `paper.bbl` | the authors' `barovox.bbl`, renamed to match |
| `Chapters/*.tex`, `barovox.bib`, `IEEEtran.cls` | the authors', unchanged |
| figures (`newPDF/*.pdf`, `newestPDF/*.pdf`) | blank placeholders of the authors' figures, same size (below) |
| the vendored `.sty` files | TeX Live's (below) |
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `page-count.json`, `README.md` | fixture scaffolding, ours |

## Built, not only read

This paper is built by `test/e2e/tex/page-count.e2e.ts` on paperlint's own TeX Live, and the end of
its body is checked against `page-count.json`. To build there:

- **Every figure is a blank placeholder of the same size**: a one-page PDF with the original's page
  box, or a white PNG/JPEG with the original's pixel size and resolution. The layout does not move:
  built both ways, every page ends on the same word, and the bibliography starts on the same page.
- **The packages paperlint's TeX Live does not install are vendored beside the paper**, unchanged
  from TeX Live 2026, each under the free licence TeX Live distributes it with: `algorithm2e.sty`, `ifoddpage.sty`, `multirow.sty`, `relsize.sty`, `setspace.sty`.

## Where the body ends

Page 13 opens with «9. Conclusion» and the acknowledgment in the left column; «References» starts below them, mid-column. The body runs onto page 13, so page 13 counts.

| ends at | on page | body pages |
| --- | ---: | ---: |
| references | 13 | 13 |

Established by rendering the built PDF and looking at the page, not by the detector.
