---
title: "NLBSE @ ICSE — venue card"
---

# NLBSE @ ICSE

The card of the venue preset `paperlint:nlbse` ([`nlbse.jsonc`](nlbse.jsonc)): what the venue asks
for, in prose. The numbers a machine checks live in the preset; the section at the end is generated
from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([conf.researchr.org/home/icse-2027/nlbse-2027](https://conf.researchr.org/home/icse-2027/nlbse-2027)).
Sources read 2026-10-26: that page, the portal's
[deadlines page](https://icse2027-nlbse.hotcrp.com/deadlines), and the
[ICSE 2027 workshops page](https://conf.researchr.org/track/icse-2027/icse-2027-workshops).

## The venue (2027 edition)

- **Venue**: The 6th Natural Language-based Software Engineering Workshop, an ICSE 2027 workshop,
  Sun 25 April 2027, Dublin. «NLBSE 2027 is sponsored by ACM SIGSOFT and IEEE-CS TCSE.»
- **Portal**: HotCRP, `https://icse2027-nlbse.hotcrp.com/`.
- **Format**: «All submissions must conform to the ICSE’27 formatting and submission instructions.»
  No template or class line is named on the page; the ICSE 2027 workshops page says «The workshop
  papers will be published by the IEEE.» and links the IEEE templates only for workshop proposals.
  The preset keeps the family's `\documentclass[conference]{IEEEtran}`, an inference, not a quote.
- **Review**: «All submissions must be anonymized, in PDF format». The call never says single- or
  double-blind; the portal's status data carries `"blind":true`, which the preset follows.
- **Publisher**: the call says only «The accepted submissions will be published in the workshop
  proceedings.» (tool competitions) and «Accepted papers will appear in the NLBSE ’27 proceedings.»
  (research challenge, skill classification). IEEE comes from the ICSE page above. No archival /
  non-archival choice is mentioned.
- **Deadlines (AoE)**: paper submission 13 Nov 2026 (marked «updated»), tool competition and
  research challenge papers **27 Nov 2026** (marked «new»), notification 11 Dec 2026, camera-ready
  29 Jan 2027. Only the 13 Nov line is in the preset.
- 🔴 **Disagreement**: the call lists 13 Nov, but the portal's status data on 2026-10-26 reads
  `"sub":{"open":false}` with no date, i.e. it was closed and showed none. The preset therefore
  carries the call's reading until the portal publishes one.

## Paper kinds and limits

Every limit says «including references».

| kind               | pages | the call's words                                                                       |
| ------------------ | ----: | -------------------------------------------------------------------------------------- |
| `full`             |     8 | «Full papers (maximum of 8 pages, including references).»                              |
| `education`        |     8 | «Education tools and materials (maximum of 8 pages, including references).»            |
| `replication`      |     8 | «Replication Studies and Negative results (maximum of 8 pages, including references).» |
| `short`            |     4 | «Short and demonstration papers (maximum of 4 pages, including references).»           |
| `position`         |     2 | «Position papers (maximum of 2 pages, including references).»                          |
| `tool-competition` |     4 | «Tool Competition entries (maximum of 4 pages, including references).»                 |

Two competition papers have no kind. Multitask Code Classification: «you must write a paper (2-4
pages)», references not mentioned. The research challenge states no limit.

🔴 **The limits are totals.** `format/page-limit` can only compare banal's body count with the
number, so references standing alone on a page after a full body pass the rule and are over the
limit. Count the PDF's pages yourself before submitting.

## What else the preset encodes

- **The IEEE template**, through `extends: paperlint:ieee-conference` ([`ieee-conference.md`](ieee-conference.md)).
- **Anonymous review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **Portal and deadlines**: all three readings are the call's for now (see Disagreement above).

## Not verified

- **Remote presentation**: not stated on the page.
- **AI / LLM usage policy**: not stated. Required content exists only for the competition papers
  (model, pre-processing, tuning, validation results, code link; the challenge: research problem,
  role of natural language, dataset version, methods, findings, reproducibility link).
- **The template's class line** and **whether a non-archival route exists**: not stated.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from nlbse.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:nlbse`** — venue preset for NLBSE · call for papers: <https://conf.researchr.org/home/icse-2027/nlbse-2027> · extends `paperlint:ieee-conference`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
