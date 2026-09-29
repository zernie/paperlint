# SECURE: Benchmarking Large Language Models for Cybersecurity

- **Authors:** Dipkamal Bhusal, Md Tanvirul Alam, Le Nguyen, Ashim Mahara, Zachary Lightcap, Rodney
  Frazier, Romy Fieblinger, Grace Long Torales, Benjamin A. Blakely, Nidhi Rastogi
- **Source:** arXiv [2405.20441](https://arxiv.org/abs/2405.20441), e-print `https://arxiv.org/e-print/2405.20441`
- **Venue:** ACSAC 2024, as recorded in paperlint#140 (the arXiv page does not name the venue)
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the arXiv page states.
  The files from the e-print are redistributed under it; the changes are listed below.

## Files

| file | whose |
| --- | --- |
| `paper.tex` | the authors' `conference_101719.tex`, renamed; content unchanged |
| `paper.bbl` | the authors' `conference_101719.bbl`, renamed to match |
| `references.bib`, `IEEEtran.cls` | from the e-print, unchanged (`IEEEtran.cls` is IEEE's class, LPPL) |
| figures, vendored `.sty` files | placeholders and TeX Live's, below |
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `page-count.json`, `README.md` | fixture scaffolding, ours |

Dropped from the e-print: `fig1.png` and `IEEEtran_HOWTO.pdf`, which the source does not include.
The figures it does include (`chat.png`, `figures/*.png`, `figures/*.pdf`) are blank placeholders of
the same size (below).

The source loads `geometry` with `a4paper, margin=1in`: it is the arXiv source, not the paper as
submitted to ACSAC, and `format/layout-override` is right to flag it.

## Built, not only read

This paper is built by `test/e2e/tex/page-count.e2e.ts` on paperlint's own TeX Live, and the end of
its body is checked against `page-count.json`. To build there:

- **Every figure is a blank placeholder of the same size**: a one-page PDF with the original's page
  box, or a white PNG/JPEG with the original's pixel size and resolution. The layout does not move:
  built both ways, every page ends on the same word, and the bibliography starts on the same page.
- **The packages paperlint's TeX Live does not install are vendored beside the paper**, unchanged
  from TeX Live 2026, each under the free licence TeX Live distributes it with: `soul.sty`, `soul-ori.sty`, `ulem.sty`, `algorithmic.sty`, `mdframed.sty`, `md-frame-0.mdf`, `multirow.sty`, `needspace.sty`, `tcolorbox.sty`.

## Where the body ends

Page 12 ends with «VIII. Conclusion»; page 13 opens with «REFERENCES» at the top of the left column, nothing above it.

| ends at | on page | body pages |
| --- | ---: | ---: |
| references | 13 | 12 |

Established by rendering the built PDF and looking at the page, not by the detector.

