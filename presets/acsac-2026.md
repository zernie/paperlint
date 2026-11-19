---
title: "IEEE ACSAC 2026 — venue card"
---

# IEEE ACSAC 2026

The card of the venue preset `paperlint:acsac-2026` ([`acsac-2026.jsonc`](acsac-2026.jsonc)).

🔴 **Only the format is checked.** This preset is minimal: it exists so
[AIDC 2026](aidc-2026.md), the workshop paperlint ships, can name the conference it is held at as its
`parent`. It carries the edition's names and its template family, IEEE `IEEEtran` conference
([`ieee-conference.md`](ieee-conference.md)), and no page limit, no deadline and no portal: no paper
has been written against ACSAC's own call with paperlint, so its numbers were not encoded. A paper
for the main conference gets the IEEE format checks and nothing the call sets.

## The edition

- **The call**: [acsac.org/2026/submissions/papers](https://www.acsac.org/2026/submissions/papers/),
  read 2026-11-19. «IEEE ACSAC 2026 December 7-11, 2026 • Los Angeles, California, USA» (the page
  header).
- **The template is IEEE**, verbatim: «Submissions must be generated using the double-column IEEE
  format», «LaTeX submissions must use the IEEEtran.cls version 1.8b template with the
  \documentclass[conference,compsoc]{IEEEtran} documentclass option.» The preset does not require
  `compsoc`: AIDC's own preset does, with its text block.
- **Not encoded**, though the call states them: «no more than 11 double-column pages, excluding
  well-marked references and appendices limited to a maximum of 5 pages. The full PDF document must
  not exceed a total of 16 pages.», and the dual-anonymous review.

## Names

`ACSAC` stood in AIDC's `aliases` until AIDC named this preset as its `parent`: «ACSAC 2026» in an
AIDC paper is the paper's own conference, and in another venue's paper it is reported once, as
ACSAC.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from acsac-2026.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:acsac-2026`** — venue preset for ACSAC 2026 · call for papers: <https://www.acsac.org/2026/submissions/papers/> · extends `paperlint:ieee-conference`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
