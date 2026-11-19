---
title: "EMNLP 2026 — venue card"
---

# EMNLP 2026

The card of the venue preset `paperlint:emnlp-2026` ([`emnlp-2026.jsonc`](emnlp-2026.jsonc)).

🔴 **Only the format is checked.** This preset is minimal: it exists so
[REALM 2026](realm-2026.md), the workshop paperlint ships, can name the conference it is held at as
its `parent`. It carries the edition's names and its template family, ACL ([`acl-latex.md`](acl-latex.md)), and
no page limit, no deadline and no portal: EMNLP's papers are reviewed through ACL Rolling Review,
whose rules paperlint does not encode yet. A paper for the main conference gets the ACL class line
and TeX packages checked, and nothing the call sets.

## The edition

- **The call**:
  [2026.emnlp.org/calls/main_conference_papers](https://2026.emnlp.org/calls/main_conference_papers/),
  read 2026-11-19: «Both long and short paper submissions should follow all of the ARR submission
  requirements, including: Long Papers (8 pages) and Short Papers (4 pages)», «Main Conference
  (dates for Workshops/Tutorials TBD) October 24 - 29, 2026».
- **The template is ACL's**: ARR's call ([aclrollingreview.org/cfp](https://aclrollingreview.org/cfp),
  read the same day): «submissions must use the official ACL style template», «Authors may not
  modify these style files or use template designed for other conferences.»
- **Not encoded**: the page limits above, and «Final versions of accepted papers will be given one
  additional page of content (up to 9 pages for long papers, up to 5 pages for short papers)».

## Names

`EMNLP` stood in REALM's `aliases` until REALM named this preset as its `parent`: «EMNLP 2026» in a
REALM paper is the paper's own conference, and in another venue's paper it is reported once, as
EMNLP.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from emnlp-2026.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:emnlp-2026`** — venue preset for EMNLP 2026 · call for papers: <https://2026.emnlp.org/calls/main_conference_papers/> · extends `paperlint:acl-latex`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
