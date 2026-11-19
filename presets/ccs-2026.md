---
title: "ACM CCS — venue card"
---

# ACM CCS (research papers)

The card of the venue preset `paperlint:ccs` ([`ccs.jsonc`](ccs.jsonc)): what the venue asks for,
in prose. The numbers a machine checks live in the preset; the section at the end is generated from
it. The `submit-paper` skill reads this card for the venue's specifics. The AISec workshop held with
CCS has its own card, [`aisec.md`](aisec.md).

**Re-verify the call for papers every year**: the cycles, dates, portals and required appendices
change between editions.

## Sources

All read 2026-11-19, with `curl` (the raw HTML) and with WebFetch; the two agree.

- The CCS 2026 call for papers:
  [sigsac.org/ccs/CCS2026/call-for/call-for-papers.html](https://www.sigsac.org/ccs/CCS2026/call-for/call-for-papers.html)
  (served with `last-modified: Wed, 18 Nov 2026`).
- The two portals' deadlines pages: [ccs2026a.hotcrp.com/deadlines](https://ccs2026a.hotcrp.com/deadlines)
  (Cycle A) and [ccs2026b.hotcrp.com/deadlines](https://ccs2026b.hotcrp.com/deadlines) (Cycle B).
- The call's minimal sample,
  [sample-ccs2026.tex](https://members.loria.fr/VCortier/files/CCS2026/sample-ccs2026.tex).
- Sheridan Communications' instructions for the final versions,
  [scomminc.com/pp/acmsig/ccs.htm](https://www.scomminc.com/pp/acmsig/ccs.htm) («Preparation
  Instructions for CCS 2026 Final Submissions»).
- The CCS 2027 site, [sigsac.org/ccs/CCS2027/](https://www.sigsac.org/ccs/CCS2027/), and its
  unpublished call page, [cfp.html](https://www.sigsac.org/ccs/CCS2027/cfp.html).

## The edition

**CCS 2026** is the most recent edition whose call is published, and **all its submission deadlines
have passed**. CCS 2026 is «November 15-19, 2026 The Hague, The Netherlands» (its home page).

CCS 2027 is announced for «October 11-15, 2027», «Atlanta, USA», but its call is not out: the call
page shows «TBD» under «Important Dates» and for both cycles' «Submission Site», its program chairs
read «TBD», and the site's menu has its «Call for Papers» entry commented out. The page's HTML holds
draft dates inside a comment, not displayed; they are not the venue's statement and are not recorded
here. Its displayed text repeats the 2026 page limit word for word.

## The venue (2026 edition)

- **Venue**: «The 33rd ACM Conference on Computer and Communications Security (CCS)», main research
  papers. «CCS has two review cycles in 2026.»
- **Decisions**: Accept, Minor revision, Reject. «Papers rejected from the first review cycle may not
  be submitted again (even in revised form) to the second review cycle», except papers that were
  administratively rejected without reviews.
- **Portals**: HotCRP, one site per cycle: Cycle A `https://ccs2026a.hotcrp.com/`, Cycle B
  `https://ccs2026b.hotcrp.com/` (the call's «Submission Site»).
- **Format**: «Submissions must be a PDF file in double-column ACM format using "sigconf" 2-column
  format». «All papers MUST comply with the unaltered ACM LaTeX template. Any attempts to remove
  whitespace (e.g., negative vspaces, savetrees, titlesec, removing author blocks, etc.) or change
  the formatting defaults (e.g., fonts) are strictly forbidden.» The rights block, CCS concepts,
  keywords, DOI and ISBN «must be retained». The sample's class line is
  `\documentclass[sigconf]{acmart} %% CCS: DO NOT REMOVE`, the family's own.
- **Double-blind**: «All papers MUST NOT reveal the identity of the authors (e.g., names,
  self-references with "we", funding acknowledgements, deanonymizing Github repositories).» «When
  referring to their previous work, authors are required to cite their papers in the third person».
  The sample comments the authors out («at submission time, the submission MUST be anonymized.
  Hence authors MUST be commented out.»); it does not add acmart's `anonymous` option. Both portals'
  data say `"blind":true`.
- **Artifacts**: anonymous URLs go «directly in the submitted paper (e.g., in the Open Science
  appendix), and also provided in the submission form»; personal sites, Google Drive and similar
  are not allowed. «New for Cycle B»: a three-day grace period for artifacts on an anonymous website,
  until «May 2nd AoE».
- **Limits on authors**: «Authors may submit up to a maximum of 7 papers at each cycle.» «Withdrawal
  of a paper is prohibited at any point prior to the official notification of the final decision».
- **Attendance**: «Authors of each accepted paper must ensure that at least one author registers for
  the conference, and that their paper is presented in-person at the conference.»
- **Generative AI**: use is permitted; minor editorial use is disclosed «in the Acknowledgements
  Section»; if AI tools «were used to generate or substantially rewrite substantive content [...]
  authors must include a dedicated "Generative AI Usage" section (placed after the 12-page main
  content and the bibliography)». «Submissions that contain hallucinated citations [...] may be desk
  rejected.»
- **Ethics**: «Papers that raise ethical concerns, such as those involving human subjects, user
  data, or real-world vulnerability analysis, must include a dedicated "Ethical Considerations"
  section.» «This section does not count toward the page limit and must be placed after the 12-page
  main content and bibliography.» The executive summary adds: «In case of doubts on whether your
  paper has potential ethical concerns, add an appendix "Ethical Considerations".»
- **Tracks**: ten topical tracks (Software Security; Web Security; Network Security; Security
  Usability and Measurement; Security and Privacy of Machine Learning; Formal Methods and
  Programming Languages; Hardware, Side Channels, and Cyber Physical Systems; Applied Cryptography;
  Blockchain and Distributed Systems; Privacy and Anonymity). A track and a «Track Justification
  Statement» are fixed at registration. The ML track requires «a threat model that clearly
  articulates the (i) envisioned attacker(s), (ii) threat surfaces [...], (iii) generality [...],
  and (iv) practicality of the attack».

### Dates (AoE)

«All submissions must be received by 11:59 PM AoE (UTC-12) on the day of the corresponding
deadline.» Every date below is the call's «Important Dates», read 2026-11-19.

| what                                   | Cycle A                                                                            | Cycle B                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Abstract submission deadline           | Jan 7, 2026 «(Mandatory: all papers must have an abstract submitted by this date)» | Apr 22, 2026 «(Mandatory: all papers must have a title, an abstract submitted and a track selected by this date)» |
| Full paper submission deadline         | Jan 14, 2026                                                                       | Apr 29, 2026                                                                                                      |
| Online artifact deadline               | —                                                                                  | May 2, 2026                                                                                                       |
| Notification of early-rejection papers | Feb 20, 2026                                                                       | June 12, 2026 (June 3 and June 10 struck through on the page)                                                     |
| Author rebuttal period                 | Mar 17–20, 2026                                                                    | June 29–July 1, 2026                                                                                              |
| Rebuttal deadline                      | Mar 20, 2026                                                                       | July 1, 2026                                                                                                      |
| Author notification                    | Apr 9, 2026                                                                        | July 17, 2026                                                                                                     |
| Minor revision approval deadline       | June 5, 2026                                                                       | Sept 4, 2026                                                                                                      |
| Camera ready deadline                  | August 9, 2026                                                                     | Sept 13, 2026                                                                                                     |

**The portals agree with the call** (read 2026-11-19). Cycle A: «Registration deadline: Wednesday
Jan 7, 2026, 11:59:59 PM AoE» (`"reg":1767873599`, 2026-01-08T11:59:59Z) and «Submission deadline:
Wednesday Jan 14, 2026, 11:59:59 PM AoE» (`"sub":1768478399`, 2026-01-15T11:59:59Z). Cycle B:
«Registration deadline: Wednesday Apr 22, 2026, 11:59:59 PM AoE» (`"reg":1776945599`,
2026-04-23T11:59:59Z) and «Submission deadline: Wednesday Apr 29, 2026, 11:59:59 PM AoE»
(`"sub":1777550399`, 2026-04-30T11:59:59Z).

**The camera-ready dates disagree.** The call: Cycle A «August 9, 2026», Cycle B «Sept 13, 2026».
Sheridan's page for the final versions: «Chairs' Submission Deadline: AoE/EoD September 14th», one
date for all papers, from the proceedings' producer. Both are kept here; plan for the call's
per-cycle date, the earlier of the two.

**Why the preset has no `deadlines` and no `portal`.** The schema holds one portal and one reading
per kind and source, and CCS has two of each per edition. A paper records its own cycle's dates and
portal in its `cycles` (`docs/configuration.md`, «The paper's cycles»).

## Paper kinds and limits

| kind       | body pages | bibliography | what the call says                                                                                                                                                        |
| ---------- | ---------: | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research` |         12 |    unlimited | «no more than 12 pages long, excluding the bibliography, well-marked appendices, and supplementary material. Note that reviewers are not required to read the appendices» |

The call names no other paper type: «Note that CCS does not accept SoK or survey papers.»

🔴 **The 12 pages are the main content alone.** The bibliography and the appendices are not limited,
and the required appendices stand after the bibliography: the Open Science appendix «placed after
the 12-page main content and the bibliography», and so are Ethical Considerations and Generative AI
Usage when they apply. The preset counts the body only up to the references or the appendix,
whichever comes first (`format.body_ends_at: references`), so those appendices are not counted
against the 12. acmart.cls loads hyperref (`\RequirePackage[bookmarksnumbered,unicode]{hyperref}`),
so the references and the appendix are found by their anchors (`docs/rules/format/page-limit.md`).

The final version's limit is not the submission's: Sheridan's page gives «Research Paper = 15 Page
Limit for all content, no extra pages» for CCS 2026. Not in the preset.

## What else the preset encodes

- **The ACM template**, through `extends: paperlint:acm-sigconf` ([`acm-sigconf.md`](acm-sigconf.md)).
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **The Open Science appendix** (`required_sections`): `\section{Open Science}` after the body, as
  in the call's sample. A missing one is a desk reject: «Papers found in violation of any of these
  requirements will be desk-rejected without review.» Ethical Considerations and Generative AI Usage
  are not required by the preset, since the call asks for them only when they apply.
- **A balanced last page** (`pdf/last-page-balance`): Sheridan's instructions for CCS 2026 finals,
  «Be sure to remove page numbers from the bottom of all pages and balance the last page into 2 even
  length columns.»
- **The name** `ACM CCS`, what `tex/venue-leftover` looks for in another venue's paper. Not the bare
  `CCS`, which is also the ACM Computing Classification System. AISec names this preset as its
  `parent`, so an AISec paper may write «ACM CCS 2026». `paper/folder-venue-leftover` matches the
  same name in folder names: the words `acm` and `ccs` in a row.

## Not verified

- **Anything about CCS 2027** beyond its dates and city: cycles, deadlines, portals, page limit and
  policies wait for the published call.
- **The submission form's fields** (`submission_fields`): not read; that needs a logged-in read of
  the form.
- **Remote presentation**: the call requires an in-person presentation and says nothing of an
  exception. Talk length and slot: not stated.
- **The page count on an acmart build**: `body_ends_at: references` was not measured on an acmart
  sigconf PDF with appendices after the bibliography when this preset was written.
- **acmart's `review` or `anonymous` options**: neither the call nor the sample names them.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from ccs.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:ccs`** — venue preset for ACM CCS · call for papers: <https://www.sigsac.org/ccs/CCS2026/call-for/call-for-papers.html> · extends `paperlint:acm-sigconf`

| rule | severity | options | set in |
| --- | --- | --- | --- |
| [`pdf/last-page-balance`](../docs/rules.md) | error | `{"tolerancePt":120}` | this preset |

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
