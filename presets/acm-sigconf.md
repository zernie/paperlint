---
title: "ACM acmart sigconf — template family card"
---

# ACM `acmart` sigconf

The card of the template family `paperlint:acm-sigconf` ([`acm-sigconf.jsonc`](acm-sigconf.jsonc)).
A family is what a publisher's template decides, whatever the venue: it names no venue and has no
call for papers. A venue preset extends it and adds what its own call sets — the page limit of each
kind of paper, and the rules its producer implies. The template is
[acmart on CTAN](https://ctan.org/pkg/acmart).

A paper for an ACM venue that has no preset may extend the family directly: page size, columns and
fonts are then checked, and the page limit is not (a family has no kinds).

## What the family encodes

- **The class**: `\documentclass[sigconf]{acmart}` — `sigconf` is required, since acmart's default
  format is a single-column manuscript no sigconf venue takes. `review`, `anonymous`, `screen` and
  `nonacm` are the paper's to add.
- **The page**: US letter, 8.5 × 11 in; a text block of at most 18 × 23.5 cm (7.087 × 9.252 in);
  two columns.
- **The fonts**: Libertine for the text, Biolinum for the title; body text at 9 pt, references from
  7 to 9 pt (banal measures 0.3 pt high on every template, hence the 0.5 pt tolerance).
- **TeX packages** on top of the base set: acmart and everything it loads itself — libertine,
  inconsolata and newtx (if any one is missing, acmart silently falls back to Computer Modern), the
  rest found by building and installing what was missing.

The numbers were measured on acmart sigconf builds (banal and pdf.js, 2026-08-26) and quoted from
the Conference Publishing author instructions for ACM (2026-08-25).

## What the family resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from acm-sigconf.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:acm-sigconf`** — template family, no venue of its own · extended by `paperlint:agenticdev`, `paperlint:aisec`

No preset of this chain sets a rule: a paper that extends it runs with paperlint's defaults.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
