---
title: "The TeX base set — card"
---

# The TeX base set

The card of [`tex-base.jsonc`](tex-base.jsonc): the TeX Live packages **every** paper gets, and all
a paper gets when it extends no preset. It is neither a venue nor a template family, and no preset
extends it — a venue's or a family's `tex.packages` is added on top of it, never instead of it.
`paperlint toolchain` installs it with every preset's packages; `paperlint build` checks it is
present before building.

What it is for: a plain `article` paper with the usual tools, typeset in Type 1 fonts. Each package
names the files that prove it is installed — `kpsewhich` must find them after an install, because
an installer's exit code is not the criterion. `cm-super` is there because without it pdflatex
silently rasterizes Computer Modern in some contexts, a bitmap font that ACM and ACL both reject.
`texcount` and `checkcites` are programs the skills run, not files LaTeX loads.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from tex-base.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`tex-base.jsonc`** — the TeX base set: every paper gets it, whatever it extends, and no preset extends it

This preset sets no rules: a paper that extends it runs with paperlint's defaults.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
