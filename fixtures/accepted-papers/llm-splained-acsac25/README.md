# Learned, Lagged, LLM-splained: LLM Responses to End User Security Questions

- **Authors:** Vijay Prakash, Kevin Lee, Arkaprabha Bhattacharya, Danny Yuxing Huang, Jessica Staddon
- **Source:** arXiv [2411.14571](https://arxiv.org/abs/2411.14571), e-print `https://arxiv.org/e-print/2411.14571`
- **Venue:** ACSAC 2025, as recorded in paperlint#140 (the arXiv page does not name the venue)
- **Licence:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), as the arXiv page states.
  The files from the e-print are redistributed under it; the changes are listed below.

## Files

| file | whose |
| --- | --- |
| `paper.tex` | the authors' `main.tex`, renamed; content unchanged, including the `\conference` switch that picks the class |
| `paper.bbl` | the authors' `main.bbl`, renamed to match |
| `sections/*.tex`, `bibs/*.bib`, `usenix-2020-09.sty` | the authors', unchanged |
| `paperlint.json`, `PIPELINE-STATUS.md`, `baseline.json`, `README.md` | fixture scaffolding, ours |

Dropped from the e-print: `00README.json` (arXiv's build metadata) and `ACM-Reference-Format.bst`
(marked unused there). The source has no figure files.

## What the rules read here

The body lives in `sections/*.tex`, pulled in by `\input`, which no rule follows. The rules read the
preamble, the title block, the abstract, and the reviews the authors kept in a disabled
`\if\showreview1` branch.
