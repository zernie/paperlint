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
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `README.md` | fixture scaffolding, ours |

Dropped from the e-print: every figure (`chat.png`, `fig1.png`, `figures/*.png`, `figures/*.pdf`) and
`IEEEtran_HOWTO.pdf`. The source therefore does not build; the rules read it without building.
