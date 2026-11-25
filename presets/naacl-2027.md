---
title: "NAACL 2027 — venue card"
---

# NAACL 2027

The card of the venue preset `paperlint:naacl-2027` ([`naacl-2027.jsonc`](naacl-2027.jsonc)).

🔴 **Only the format is checked.** This preset is minimal: it exists so
[LangCode 2027](langcode-2027.md), the workshop paperlint ships, can name the conference it is held
at as its `parent`. It carries the edition's names and its template family, ACL
([`acl-latex.md`](acl-latex.md)), and no page limit, no deadline and no portal: NAACL's papers are
reviewed through ACL Rolling Review, whose rules paperlint does not encode yet. A paper for the main
conference gets the ACL class line and TeX packages checked, and nothing the call sets.

## The edition

- **The call**:
  [2027.naacl.org/calls/main_conference_papers](https://2027.naacl.org/calls/main_conference_papers/),
  read 2026-11-25: «NAACL 2027 will take place in San Francisco, California, USA, from June 1 to
  June 5, 2027.», «Both long and short paper submissions should follow all of the ARR submission
  requirements and policies, including: Long Papers (8 pages) and Short Papers (4 pages)».
- **Not encoded**: the page limits above, and «Final versions of accepted papers will be given one
  additional page of content (up to 9 pages for long papers, up to 5 pages for short papers)».

## Names

`NAACL`: in a LangCode 2027 paper, «NAACL 2027» is the paper's own conference; in another venue's
paper it is reported once, as NAACL.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from naacl-2027.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:naacl-2027`** — venue preset for NAACL 2027 · call for papers: <https://2027.naacl.org/calls/main_conference_papers/> · extends `paperlint:acl-latex`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
