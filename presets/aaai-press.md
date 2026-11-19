---
title: "AAAI Press style — template family card"
---

# AAAI Press style (`aaai2027.sty`)

The card of the template family `paperlint:aaai-press` ([`aaai-press.jsonc`](aaai-press.jsonc)).
A family is what a template decides, whatever the venue: it names no venue and has no call for
papers. A venue preset extends it and adds what its own call sets. AAAI's 2027 edition is
[`aaai-2027`](aaai-2027.md); the other proceedings AAAI Press sets from the same kit may extend
this family.

## The template is a style file, not a class

The AAAI-27 Author Kit ([aaai.org/authorkit27](https://aaai.org/authorkit27/), which serves
`AuthorKit27.zip`, Last-Modified 2026-10-21, read 2026-11-19) holds `AnonymousSubmission2027.tex`,
`CameraReady2027.tex`, `aaai2027.sty`, `aaai2027.bst` and the reproducibility checklist. A paper
opens with two lines the kit marks `% DO NOT CHANGE THIS`:

```latex
\documentclass[letterpaper]{article}
\usepackage[submission]{aaai2027}
```

The author copies the style file beside `paper.tex`: it is on no TeX distribution, and paperlint
does not ship it. `tex/template` requires both lines (`template` and `template_style`). The
`submission` option hides the authors and replaces the copyright notice; the camera-ready drops it,
and this family describes the submission.

The kit changed during the edition. The zip linked today carries the style dated 2027/10/21; the
first, <https://aaai.org/wp-content/uploads/2026/05/AuthorKit27.zip> (Last-Modified 2026-05-28,
style dated 2027/05/04), is the one the Wayback Machine holds from 2026-07-26, before the
submission deadline. The two style files differ only in the date line and in where the copyright
notice is placed and checked; page, fonts and sizes are the same.

## What the family encodes

- **The page**: US letter, 8.5 × 11 in; a text block of 7.0 × 9.0 in (`\textwidth` 505.89 pt,
  `\textheight` 650.43 pt), two columns 0.375 in apart («Two-column format in AAAI style is required
  for all papers.»).
- **The fonts**: newtxtext's Times (TeXGyreTermesX in the PDF), loaded by the style itself — «Do not
  load `times`, `helvet`, `courier`, or any other font package in your preamble». The body at 10 pt
  on 11 pt leading (the kit's prose says twelve-point leading; the style sets 11 and banal measured
  11). The references at 9 to 10 pt: «References may be the same size as surrounding text. However,
  in this section (only), you may reduce the size to \small (9pt)».
- **TeX packages** on top of the base set: newtx with its dependencies (kastrup, tex-gyre, xpatch,
  xstring, xkeyval, fontaxes, figureversions, mweights), psnfss, helvetic and courier for the fonts,
  placeins, which the style loads, and algorithms, float, newfloat and listings, which the kit's
  paper loads.

## The kit's forbidden packages and commands, not encoded

The kit forbids packages and commands in two lists that do not agree, and paperlint encodes
neither:

- its preamble comment, «DISALLOWED PACKAGES»: authblk, balance, CJK, float, flushend, fullpage,
  geometry, hyperref, navigator, indentfirst, layout, multicol, nameref, savetrees, setspace,
  stfloats, tabu, titlesec, tocbibind, ulem, wrapfig; and «DISALLOWED COMMANDS»: `\nocopyright`,
  `\addtolength`, `\balance`, `\baselinestretch`, `\clearpage`, `\columnsep`, `\newpage`,
  `\pagebreak`, `\pagestyle`, `\tiny`, and a negative `\vspace` or `\vskip` near a caption, figure,
  table, heading or the references;
- its Table 2, «LaTeX style packages that must not be used»: authblk, babel, balance, cjk, epsf,
  epsfig, euler, float, fullpage, geometry, graphics, hyperref, layout, lmodern, navigator,
  pdfcomment, pgfplots, psfig, pstricks, t1enc, times, titlesec, tocbibind, ulem; and its Table 1 of
  commands.

The kit's own `algorithm` package loads float, which both lists forbid. The style itself stops the
build on 17 of them (hyperref, bbm, authblk, balance, CJK, flushend, fullpage, geometry, navigator,
savetrees, setspace, stfloats, tabu, titlesec, tocbibind, ulem, wrapfig): «Package aaai Error:
Package geometry is forbidden.», and no PDF. `format/layout-override` reports `geometry`,
`\baselinestretch` and the layout lengths from the source.

What the kit says follows a violation: the style's header, «MODIFICATIONS (IN YOUR SOURCE OR IN
THIS STYLE SHEET WILL RESULT IN REJECTION OF YOUR PAPER)»; the instructions, «If you do not follow
these requirements, your paper will be returned to you to correct the deficiencies».

## What the family does not check

- **Text set in another font after the title.** `\renewcommand{\rmdefault}{cmr}\normalfont` after
  `\maketitle` sets the text in cm-super, and a sans-serif `\familydefault` in Helvetica; the title
  is still TeXGyreTermesX, so `pdf/fonts` passes both. The same lines in the preamble change
  nothing: newtxtext sets the text font again at `\begin{document}`.
- **References at the body size** are not measured: banal reports a reference size only when it
  differs from the body's.
- **The version of the style file**: a paper on last year's `aaai2026.sty` renamed `aaai2027.sty` is
  caught by its fonts only, below.

## How the numbers were measured

On 2026-11-19, `paperlint build` with paperlint's TeX Live 2026 (pdfTeX 1.40.29) and banal 1.2, on
the kit's `AnonymousSubmission2027.tex` and on a synthetic paper with the kit's preamble; the
style's dimensions were written to the log by a `\typeout` at `\begin{document}`. Every file the
builds read (112, from pdflatex's `-recorder` list) belongs to TeX Live's scheme-basic, the base
set, or this family's list. Linted under `paperlint:aaai-2027`:

| build                                                              | what paperlint reported                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| the kit's style; 7 body pages, 2 of references                     | 8.5 × 11 in, 2 columns, body 10.3, TeXGyreTermesX: no finding |
| `[a4paper]` for `[letterpaper]`                                    | 8.264 × 11.694 in: `pdf/geometry` (twice) and `tex/template`  |
| the AAAI-26 kit (`aaai2026.sty`, the paper loading `times`)        | NimbusRomNo9L, no TeXGyreTermesX: `pdf/fonts`                 |
| `\tiny` after `\maketitle`                                         | body 6.3: `pdf/body-size`                                     |
| references in `\small` / at the body size / in `\scriptsize`       | 9.3 / not measured by banal / 7.3, `pdf/body-size`            |
| `\renewcommand{\baselinestretch}{0.95}`                            | leading 10.4 (banal): `format/layout-override`                |
| `\usepackage{hyperref}`, `{geometry}`, `{balance}`                 | no PDF: the style stops the build                             |
| `[letterpaper,11pt]`; `times` or `\rmdefault{cmr}` in the preamble | nothing changes in the PDF                                    |

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from aaai-press.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:aaai-press`** — template family, no venue of its own · extended by `paperlint:aaai-2027`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
