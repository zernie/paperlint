---
title: "ICML style — template family card"
---

# ICML style (`icml2027.sty`)

The card of the template family `paperlint:icml-style` ([`icml-style.jsonc`](icml-style.jsonc)). A
family is what a template decides, whatever the venue: it names no venue and has no call for
papers. A venue preset extends it and adds what its own call sets. The 2027 edition is
[`icml-2027`](icml-2027.md).

## The template is a style file, not a class

ICML's author kit ([icml2027.zip](https://media.icml.cc/Conferences/ICML2027/styles/icml2027.zip),
read 2026-11-19) holds `example_paper.tex`, `icml2027.sty`, `icml2027.bst`, and its own copies of
`fancyhdr.sty`, `algorithm.sty` and `algorithmic.sty`. A paper is `\documentclass{article}` with
`\usepackage{icml2027}`, and the author copies the style file beside `paper.tex`: it is on no TeX
distribution. `paperlint build` finds it there (the paper's directory is on `TEXINPUTS`).

The style's options pick the stage: none for the anonymous submission (line numbers in the margin,
the authors hidden), `accepted` for the camera-ready, `preprint` for arXiv, and `nohyperref`.

The kit's own example does not build clean on TeX Live 2026: its `\cref` to an `assumption` theorem
leaves an undefined reference (add `\crefname{assumption}{Assumption}{Assumptions}`), and its figure
`icml_numpapers.pdf` draws a Times-Roman that is not embedded, which `pdf/fonts` reports.

## What the family encodes

- **The page**: US letter, 8.5 × 11 in («Your paper must be in US letter size»); a text block of
  6.75 × 9 in (`\textwidth` 487.82 pt, `\textheight` 650.43 pt); two columns, 0.25 in apart.
- **The fonts**: Times (the URW clone, NimbusRomNo9L) for the text, the title and the headings; the
  body at 10 pt («Your paper should be in 10 point Times font»). The references at the body's size:
  «The citation font size should be the same as that in the main body of the paper.» banal measures
  0.3 pt high, hence the 0.5 pt tolerance.
- **TeX packages** on top of the base set: eso-pic and forloop, which the style loads; psnfss,
  times, courier and helvetic for its fonts; fancyhdr, algorithms and float, for a paper without the
  kit's own copies; amscls, mathtools, cleveref and todonotes, which the kit's example loads.

## What the family does not check

- **That the style is loaded.** The family has no `template` yet: the class is plain `article`, and
  `tex/template` compares only the class line. A build in another venue's style is caught after it
  only when its page or columns differ (NeurIPS's: one column, `pdf/geometry`).
- **Changed margins.** No rule reads the text block, and `format/layout-override` runs only under a
  `template`. A `geometry` that widens the text block passed every `pdf/*` rule on the measured
  build; the style itself prints «The page layout violates the ICML style.» on its first page.

## How the numbers were measured

On 2026-11-19, `paperlint build` with paperlint's TeX Live 2026 and banal, on the kit's
`example_paper.tex`; the style's dimensions were written to the log by a `\typeout` at
`\begin{document}`. Every file the build read (219, pdflatex's `-recorder` list) belongs to TeX
Live's scheme-basic, the base set, this family's list, or a dependency of one.

| build                                       | what paperlint reported                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| the kit's style, no option                  | 8.5 × 11 in, 2 columns, body 10.3, NimbusRomNo9L: no finding but the figure's    |
| references at the body's size / in `\small` | not measured by banal / 9.3, `pdf/body-size`                                     |
| `\documentclass[11pt]{article}`             | body 11.3, `pdf/body-size`                                                       |
| `\renewcommand{\rmdefault}{cmr}`            | Computer Modern: `pdf/fonts`                                                     |
| NeurIPS 2025's style instead                | 1 column: `pdf/geometry`                                                         |
| `\usepackage[margin=0.6in]{geometry}`       | `\textwidth` 527.57 pt, the same page, columns, fonts and sizes: no `pdf/*` rule |
| `\documentclass[a4paper]{article}`          | still letter: the style forces it                                                |

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from icml-style.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:icml-style`** — template family, no venue of its own · extended by `paperlint:icml-2027`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
