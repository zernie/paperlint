---
title: "ACL — template family card"
---

# ACL (`acl.sty`)

The card of the template family `paperlint:acl-latex` ([`acl-latex.jsonc`](acl-latex.jsonc)). A family is what a
publisher's template decides, whatever the venue: it names no venue and has no call for papers. A
venue preset extends it and adds what its own call sets. The template is ACL's style files,
[acl-org/acl-style-files](https://github.com/acl-org/acl-style-files), used by the \*ACL
conferences (ACL, EMNLP, NAACL, EACL) and their workshops.

## What the family encodes

- **The class**: `\documentclass[11pt]{article}`. ACL's template is not a class: `acl_latex.tex`
  opens with that line and loads `acl.sty` as a package, so `tex/template` compares the paper's
  class line against `article` at 11pt.
- **TeX packages** on top of the base set: lineno, and the Times, Helvetica, Courier, Symbol and
  Zapf Dingbats fonts `acl.sty` loads (`psnfss`, `times`, `helvetic`, `courier`, `symbol`,
  `zapfding`); without them the build stops at «Font ptmr8t not loadable».

## What it does not encode yet

The page (A4), the columns, the font sizes and the fonts a PDF shows are not here: they were
measured on one build, a REALM 2026 paper, and stay in [`realm-2026.jsonc`](realm-2026.jsonc) until
a second ACL paper confirms them. A family's numbers bind every venue that extends it, so one
measurement is not enough to move them here.

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from acl-latex.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:acl-latex`** — template family, no venue of its own · extended by `paperlint:emnlp-2026`, `paperlint:langcode-2027`, `paperlint:naacl-2027`, `paperlint:realm-2026`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
