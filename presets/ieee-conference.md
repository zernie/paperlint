---
title: "IEEE IEEEtran conference — template family card"
---

# IEEE `IEEEtran` conference

The card of the template family `paperlint:ieee-conference`
([`ieee-conference.jsonc`](ieee-conference.jsonc)). A family is what a publisher's template
decides, whatever the venue: it names no venue and has no call for papers. A venue preset extends
it and adds what its own call sets — the class options it names, the page limit of each kind of
paper, the sections it requires. The template is [IEEEtran on CTAN](https://ctan.org/pkg/ieeetran).

## What the family encodes

- **The class**: `\documentclass[conference]{IEEEtran}`. A venue that requires `compsoc` names it
  in its own template and its own text block (as `aidc` does).
- **The page**: US letter, 8.5 × 11 in; the text block of `[conference]`, 7.14 × 9.30 in; two
  columns.
- **The fonts**: Times (the URW clone the PDF names NimbusRomNo9L) for text, headings and title;
  body at 10 pt, the bibliography at 8 pt (IEEEtran sets it in `\footnotesize`).
- **TeX packages** on top of the base set: ieeetran, cite, psnfss and times.

The numbers are measured, not copied: IEEE's own template files (`bare_conf.tex`,
`bare_conf_compsoc.tex`) and a 13-page paper built on each with IEEEtran.cls V1.8b, on two TeX Live
versions. `compsoc` changes the text block and the headings, and nothing the `pdf/*` rules judge.

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from ieee-conference.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:ieee-conference`** — template family, no venue of its own · extended by `paperlint:aidc`

This preset sets no rules: a paper that extends it runs with paperlint's defaults.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
