---
title: "AIDC @ IEEE ACSAC — venue card"
---

# AIDC @ IEEE ACSAC

The card of the venue preset `paperlint:aidc` ([`aidc.jsonc`](aidc.jsonc)): what the venue asks
for, in prose. The numbers a machine checks live in the preset; the section at the end is generated
from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year** ([aidcworkshop.github.io](https://aidcworkshop.github.io/)).

## The venue (2026 edition, the first)

- **Venue**: Workshop on Agentic AI in Offensive and Defensive Cyber Operations, held at
  **IEEE ACSAC 2026** (Annual Computer Security Applications Conference).
- **Format**, verbatim from the call: «All submitted papers must be prepared in US Letter size, not
  A4, using the double-column IEEE conference format. This requirement will be strictly enforced.»
  and «LaTeX submissions must use the IEEEtran.cls version 1.8b template with the
  \documentclass[conference,compsoc]{IEEEtran} document class option.»
- **Double-blind**: «Submissions must be properly anonymized for double-blind review.», and
  `"blind":true` in the portal's data.
- **Portal**: HotCRP at `https://aidc.submit.acsac.org`.
- 🔴 **The deadline people get wrong**: the HotCRP portal closes 2026-10-02 11:59:59 UTC
  (`"sub":1790942399` on `https://aidc.submit.acsac.org/deadlines`), while the workshop page says
  «October 2, 2026 (Anywhere-on-Earth, AoE)» — a day later. The portal is what refuses the upload.

## Paper kinds and limits

| kind      | body pages | what it is                                                                                                    |
| --------- | ---------: | ------------------------------------------------------------------------------------------------------------- |
| `regular` |         12 | «Regular technical papers: Up to 12 pages excluding references and appendices.»                               |
| `short`   |          6 | «Short position papers or work-in-progress (WIP) papers: Up to 6 pages, excluding references and appendices.» |

References, appendices and the LLM Usage Statement are unlimited. 🔴 **The body is counted up to
where the references start** (`format.body_ends_at: "references"`), not by banal's count: banal
calls any page with non-bibliography text body, so an LLM Usage Statement or an appendix placed
before the references would push a paper whose body ends at the foot of page 12 to «body 13».
See `docs/rules/format/page-limit.md`.

## What else the preset encodes

- **The IEEE template**, through `extends: paperlint:ieee-conference` — letter paper, two columns,
  Times at 10 pt, IEEEtran's TeX packages ([`ieee-conference.md`](ieee-conference.md)) — with the
  `compsoc` option required in the class line (`tex/template`) and compsoc's text block,
  7.00 × 9.02 in.
- **The LLM Usage Statement** (`required_sections`). The call: «Authors must follow the ACSAC AI
  Usage Policy for all workshop submissions.» The policy (`https://www.acsac.org/2026/submissions/ai/`):
  «If LLMs are used, authors must include a separate, clearly marked section titled "LLM Usage
  Statement" at the end of the paper. This section does not count towards the page limit.» and
  «Failure to comply with these requirements is grounds for desk rejection without further
  review.» `tex/required-section` cannot know whether LLMs were used, so it requires the section
  always — an author who used none says so in it. A bold paragraph is not a section with this
  title and does not count.
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **Where submissions go** (`portal`): `paperlint submission` reads and updates a paper's
  submission through HotCRP's API on that site.
- **Names**: `AIDC` and `ACSAC`, what `tex/venue-leftover` looks for in another venue's paper.
- **The register of the body** (`register`): the workshop's first edition has no accepted papers,
  so the bands of `tex/contrast-frames`, `tex/claim-emphasis` and `tex/relation-markers` are set by
  five accepted ACSAC papers on the same template, in `fixtures/accepted-papers/`.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from aidc.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:aidc`** — venue preset for AIDC · call for papers: <https://aidcworkshop.github.io/> · extends `paperlint:ieee-conference`

This preset sets no rules: a paper that extends it runs with paperlint's defaults.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
