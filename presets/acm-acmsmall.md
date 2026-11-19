---
title: "ACM acmart acmsmall — template family card"
---

# ACM `acmart` acmsmall

The card of the template family `paperlint:acm-acmsmall` ([`acm-acmsmall.jsonc`](acm-acmsmall.jsonc)).
A family is what a publisher's template decides, whatever the venue: it names no venue and has no
call for papers. A venue preset extends it and adds what its own call sets — the page limit of each
kind of paper, and the rules its producer implies. The template is
[acmart on CTAN](https://ctan.org/pkg/acmart); `acmsmall` is its single-column format, which ACM's
journals and some ACM conferences (FSE among them) take. Its two-column sibling is
[`acm-sigconf`](acm-sigconf.md).

A paper for an ACM venue in this format that has no preset may extend the family directly: page
size, columns and fonts are then checked, and the page limit is not (a family has no kinds).

## What the family encodes

- **The class**: `\documentclass[acmsmall]{acmart}` — `acmsmall` is required, since acmart's default
  format is a manuscript and `sigconf` is the two-column format. `review`, `anonymous`, `screen` and
  `nonacm` are the paper's to add: the check requires only the options the template names.
- **The page**: 6.75 × 10 in; a text block of 5.477 × 7.942 in (`\textwidth` 395.8225 pt,
  `\textheight` 574 pt); one column.
- **The fonts**: Linux Libertine for the text, Linux Biolinum for the title and headings; body text
  at 10 pt, references at 8 pt (`\footnotesize`). banal measures 0.3 pt high (10.3 and 8.3), hence
  the 0.5 pt tolerance.
- **TeX packages** on top of the base set: acm-sigconf's list — acmart and everything it loads
  itself — without pbalance, filehook and zref, which acmart loads only for its two-column `pbalance`
  option (zref also for the acmcp format).

## How the numbers were measured

On 2026-11-19, `paperlint build` on acmart's own sample for this format, `samples/acmsmall-conf.tex`
(acmart v2.21, 2026/11/01), with paperlint's TeX Live 2026 and banal 1.2, under
`\documentclass[acmsmall]{acmart}` and under FSE's `\documentclass[acmsmall,screen,review,anonymous]{acmart}`.
Both builds measured the same page, columns, body size and fonts; the text block is the class's own
`\textwidth` and `\textheight`, written to the log. The class says the same in its source:
`\ACM@fontsize` is 10pt for acmsmall, and its geometry sets `paperwidth=6.75in, paperheight=10in`.
The sample built with `[sigconf]` instead fails `pdf/geometry` (8.5 × 11 in, two columns),
`pdf/body-size` (9.3) and `tex/template`; with Computer Modern as the roman and sans-serif defaults
it fails `pdf/fonts` (no LinBiolinum).

What banal does with this format, seen on the same sample and on the e2e fixture
`fixtures/build-e2e/fse`: the page where the body ends and the references begin is counted as body
on the fixture (the references heading in the last lines of page 6, body count 6) and not on the
sample (the heading in the upper third of page 9, body count 8); and when an appendix follows the
references, banal types the reference pages as appendix, so it then reports no reference size and
no reference pages. A venue whose limit depends on those counts says what it does about them in its own card.

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from acm-acmsmall.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:acm-acmsmall`** — template family, no venue of its own · extended by `paperlint:fse`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
