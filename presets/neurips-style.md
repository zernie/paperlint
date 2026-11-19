---
title: "NeurIPS style — template family card"
---

# NeurIPS style (`neurips_2026.sty`)

The card of the template family `paperlint:neurips-style` ([`neurips-style.jsonc`](neurips-style.jsonc)).
A family is what a template decides, whatever the venue: it names no venue and has no call for
papers. A venue preset extends it and adds what its own call sets. The main track's 2026 edition
is [`neurips-2026`](neurips-2026.md); a NeurIPS workshop on the same style file may extend this
family.

## The template is a style file, not a class

NeurIPS's author kit
([Formatting_Instructions_For_NeurIPS_2026.zip](https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip),
read 2026-11-19) holds `neurips_2026.tex`, `neurips_2026.sty` and `checklist.tex`. A paper is
`\documentclass{article}` with `\usepackage{neurips_2026}`, and the author copies the style file
beside `paper.tex`: it is on no TeX distribution. `paperlint build` finds it there (the paper's
directory is on `TEXINPUTS`) and records its sha256 in `_build/sources.json`.

The style's options pick the track and the stage: none for the anonymous submission (line numbers,
«Anonymous Author(s)»), `final` for the camera-ready, `preprint` for arXiv, `main`, `position`,
`eandd`, `creativeai`, `education`, `sglblindworkshop`, `dblblindworkshop`, and `nonatbib`.

## What the family encodes

- **The template**: `\documentclass{article}` with `\usepackage{neurips_2026}` (`template` and
  `template_style`). `tex/template` requires both, in the source, before any build: the class, the
  style loaded (options of the paper's own allowed), and it names another year's NeurIPS style
  (`neurips_2025`) or another shipped venue's style loaded instead. `format/layout-override` reports
  a `\newgeometry` or a margin option in the paper, and `cycle/port-done` judges the class and the
  style together.
- **The page**: US letter, 8.5 × 11 in («Please prepare submission files with paper size "US
  Letter," and not, for example, "A4."»); a text block of 5.5 × 9 in (`\textwidth` 397.485 pt,
  `\textheight` 650.43 pt); one column.
- **The fonts**: Times (the URW clone, NimbusRomNo9L) for the text and the headings, Helvetica
  (NimbusSanL) for sans-serif; the body at 10 pt on 11 pt leading. The references at 9 to 10 pt: «It
  is permissible to reduce the font size to small (9 point) when listing the references.» banal
  measures 0.3 pt high (10.3, 9.3), hence the 0.5 pt tolerance.
- **TeX packages** on top of the base set: environ and lineno, which the style loads; psnfss, times
  and helvetic for its fonts; units, for the `nicefrac` the kit's template loads.

## What the family does not check

- **A changed style file.** The check reads the name of the package the paper loads, not the file:
  a `neurips_2026.sty` edited, or another file saved under that name, passes it. The build sees the
  file's fonts (the 1990s «NIPS Macros» below), not its margins; `_build/sources.json` records the
  file's sha256, which no rule compares yet.
- **The text block on the PDF.** No `pdf/*` rule reads it; a layout change the source does not show
  (a macro of the style redefined) is not seen.
- **Getting the style file.** It is on no TeX distribution, and `paperlint new --venue` writes the
  class line only: copy `neurips_2026.sty` from the kit beside `paper.tex`, and `\usepackage` it.

## How the numbers were measured

On 2026-11-19, `paperlint build` with paperlint's TeX Live 2026 and banal, on the kit's own
`neurips_2026.tex` and on the e2e fixture `fixtures/build-e2e/neurips`; the style's dimensions were
written to the log by a `\typeout` at `\begin{document}`. Every file the kit's build read belongs to
TeX Live's scheme-basic, the base set, this family's list, or a dependency of one.

| build                                                          | what paperlint reported                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| the kit's style, no option                                     | 8.5 × 11 in, 1 column, body 10.3, NimbusRomNo9L: no finding |
| references in `\small` / at the body size / in `\footnotesize` | 9.3 / not measured by banal / 8.3, `pdf/body-size`          |
| no `\usepackage{neurips_2026}`                                 | `tex/template`; cm-super (SFRM1000, …): `pdf/fonts`         |
| the 1990s «NIPS Macros» saved as `neurips_2026.sty`            | cm-super: `pdf/fonts`                                       |
| `\newgeometry{textwidth=6.5in,textheight=9.5in,top=0.75in}`    | `format/layout-override`; the PDF: same page, fonts, sizes  |

The «NIPS Macros» case is real: one preprint in `fixtures/arxiv-papers` ships that file under the
name `neurips_2026.sty`. Of the 16 NeurIPS-style preprints there, 7 carry the kit's file byte for
byte and 6 an earlier one with the same version line (2026-01-29) and no `education` option.

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from neurips-style.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:neurips-style`** — template family, no venue of its own · extended by `paperlint:neurips-2026`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
