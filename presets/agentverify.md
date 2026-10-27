---
title: "AGENTVERIFY @ ICSE — venue card"
---

# AGENTVERIFY @ ICSE

The card of the venue preset `paperlint:agentverify` ([`agentverify.jsonc`](agentverify.jsonc)):
what the venue asks for, in prose. The numbers a machine checks live in the preset; the section at
the end is generated from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([agentverify2027.github.io/cfp.html](https://agentverify2027.github.io/cfp.html)). Sources read
2026-10-26: that page, [the home page](https://agentverify2027.github.io/), the portal's
[deadlines page](https://icse2027-agentverify.hotcrp.com/deadlines), and the
[ICSE 2027 workshops page](https://conf.researchr.org/track/icse-2027/icse-2027-workshops). The
researchr page `conf.researchr.org/home/agentverify-2027` only redirects to the workshop's site.

## The venue (2027 edition)

- **Venue**: Workshop on Infrastructure for Trustworthy Software Agents, an ICSE 2027 workshop,
  Sun 25 April 2027, Dublin.
- **Portal**: HotCRP, `https://icse2027-agentverify.hotcrp.com/` («Submit Your Paper →»).
- **Format and review**: «Papers will be submitted via HotCRP and reviewed double-blind.
  Submissions should follow the IEEE format in line with ICSE 2027 and present an original
  contribution.» The portal's status data carries `"blind":true`. No class line is given, so the
  preset keeps the family's `\documentclass[conference]{IEEEtran}`.
- **Publisher**: «Accepted papers will appear in the ICSE 2027 workshop proceedings by default.»
  The ICSE workshops page: «The workshop papers will be published by the IEEE.» The CFP does not
  say what a non-default route would be, or whether it is archival. The organizers: no other route
  is offered (below).
- **Presenting**: «At least one author of each accepted paper must register and present.» Remote
  presentation is allowed (below).
- **Deadlines (AoE)**: submission 13 Nov 2026, reviews due 5 Dec, final notification 11 Dec 2026,
  camera-ready 29 Jan 2027.

## 🔴 The submission deadline moved

The organizers' email of 2026-10-23 (as received by an author; the email itself is not public):

> The submission deadline for AGENTVERIFY 2027 has been updated to November 13, 2026. We do not
> have a separate abstract submission deadline.

Source: **organizers' email, 2026-10-23**. On 2026-10-26 every public source agreed with it: the
CFP, the home page («Papers are due November 13th, 2026 (AoE)»), the ICSE workshops page («Workshop
Papers Submission Deadline for all Workshops: 13 November 2026») and the portal (`"sub":1794657599`,
2026-11-14T11:59:59Z). None of the pages read showed 6 November. If a cached copy of any of them
does, the email and the live pages win.

## Paper kinds and limits

| kind       | pages | the call's words                                                                                                                        |
| ---------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------- |
| `full`     |     8 | «Full Papers: Maximum of 8 pages, including references.»                                                                                |
| `short`    |     4 | «Short & Demonstration Papers: Maximum of 4 pages, including references.»                                                               |
| `abstract` |     2 | «Extended Abstracts: Maximum of 2 pages, including references.» They «are free of APC charges and will be included in the proceedings.» |

🔴 **Every limit is a total, references included.** `format/page-limit` can only compare banal's
body count with the number, so references standing alone on a page after a full body pass the rule
and are over the limit. Count the PDF's pages yourself before submitting.

## What else the preset encodes

- **The IEEE template**, through `extends: paperlint:ieee-conference` ([`ieee-conference.md`](ieee-conference.md)).
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **Portal and deadlines**: the submission reading is the portal's, refreshed by paperlint's
  scheduled workflow; notification and camera-ready are the site's. No `registration`: there is no
  abstract deadline.

## Answered by the organizers (emails to an author, not public)

- **Remote presentation** (2026-10-23): «In general, remote presentations will be allowed for
  authors who are unable to attend the workshop in person. However, at least one author of each
  accepted paper must register for the workshop to ensure its inclusion in the proceedings.»
- **APC** (2026-10-27), for every paper kind: «APC. It is free completely.»
- **Proceedings** (2026-10-27): «Workshop papers are normally published in an ICSE companion
  IEEE/ACM proceedings.» Asked whether a non-archival option exists: «The non-trivial [sic:
  non-archival] option is not offered.» So every accepted paper is archival.

## Not verified

- **Digital library**: whether the 2027 companion volume goes to IEEE Xplore or the ACM DL.
- **AI / LLM usage policy and required sections**: none stated.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from agentverify.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:agentverify`** — venue preset for AGENTVERIFY · call for papers: <https://agentverify2027.github.io/cfp.html> · extends `paperlint:ieee-conference`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
