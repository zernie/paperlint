---
title: "MSR — venue card"
---

# MSR (Technical Papers)

The card of the venue preset `paperlint:msr` ([`msr.jsonc`](msr.jsonc)): what the venue asks for,
in prose. The numbers a machine checks live in the preset; the section at the end is generated from
it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([2027.msrconf.org/track/msr-2027-technical-papers](https://2027.msrconf.org/track/msr-2027-technical-papers)):
the template changed from ACM to IEEE in 2027 («Note that IEEE format is being used this year,
whereas last year it was ACM format.»), and limits and dates change between editions.

## The venue (2027 edition)

- **Venue**: the Technical Papers track of **MSR 2027**, the International Conference on Mining
  Software Repositories.
- **Portal**: HotCRP, `https://msr2027.hotcrp.com/` («Papers must be submitted through HotCRP»).
- **Dates** (the call, «AoE (UTC-12h)»): abstract **2026-10-20**, paper **2026-10-23**; early
  reject notification 2026-12-03; author response 2026-12-04 to 2026-12-08; notification
  2027-01-08; camera-ready 2027-01-26. The call's prose names the weekdays «Mon, 20 Oct 2026» and
  «Thurs, 23 Oct 2026», its date table «Tue 20 Oct 2026» and «Fri 23 Oct 2026»; the calendar sides
  with the table (2026-10-20 is a Tuesday).
- 🔴 **The portal closes earlier than the call says.** Read 2026-10-05 on
  `https://msr2027.hotcrp.com/deadlines`: «Submission deadline: Tuesday Oct 20, 2026, 12 AM EDT»
  (`"sub":1792468800`, 2026-10-20 04:00 UTC) and «Resubmission deadline: Friday Oct 23, 2026, 12 AM
  EDT» («Completed submissions may be updated until this deadline»). Midnight EDT at the start of
  each day is about a day and a half before the end of that day AoE. The portal is what refuses the
  upload: plan for its times. The preset carries them as `deadlines` (`source: "portal"`, with the
  day read), refreshed by paperlint's scheduled workflow when the portal changes them; a paper whose
  current cycle names `paperlint:msr` derives them. Recording the call's days in the paper's own
  cycle maps «abstract» to `registration` and «paper» to `submission` — and the portal's earlier
  `submission` is then the one in force.
- **Format**, verbatim from the call: «LaTeX users must use \documentclass[10pt,conference]{IEEEtran}
  without including the compsoc or compsocconf options», «title in 24pt font and full text in 10pt
  type», and «Alterations of spacing, font size, and other changes that deviate from the
  instructions may result in desk rejection without further review.»
- **Double-anonymous**: «The MSR 2027 Technical Track will employ a double-anonymous review process.
  Thus, no submission may reveal its authors' identities.» The call adds: names omitted, prior work
  cited in the third person, and a preprint must not say it was submitted to MSR. The portal's data
  says `"blind":true`.
- **Attendance**: «If a submission is accepted, at least one author of the paper is required to
  register for MSR 2027 and present the paper.» The call does not say whether a remote presentation
  is allowed.
- **New in 2027**, from the call: a submission may be desk rejected for fabricated references
  («citations to papers, authors, venues, datasets, tools, or other artifacts that do not exist»),
  clear signs of unverified AI-generated text, or hidden instructions aimed at automated tools.

## Paper kinds and limits

| kind        | main-text pages | pages of only references | what the call says                                                                                                                                                        |
| ----------- | --------------: | -----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `technical` |              10 |                        2 | «All submissions must not exceed 10 pages for the main text, inclusive of all figures, tables, appendices, etc. Two more pages containing only references are permitted.» |

«Accepted papers will be allowed one extra page for the main text of the camera-ready version.» —
not the submission's limit, so not in the preset.

🔴 **Appendices count in the ten pages**, and a page that holds anything but references is a
main-text page. banal's count gets both wrong on an IEEEtran build (an appendix before the
references turns its pages into «bibliography»; one after them into «references»), so the preset
counts from the text (`format.appendix_in_body`): the main text is every page up to the references —
that page too when text stands above the heading — and every page from an appendix that follows the
references; the pages between hold only references. **Load hyperref**: an appendix after the
references is found by hyperref's anchor, and without it is counted as reference pages. See
`docs/rules/format/page-limit.md`.

## What else the preset encodes

- **The IEEE template**, through `extends: paperlint:ieee-conference` — letter paper, two columns,
  Times at 10 pt, IEEEtran's TeX packages ([`ieee-conference.md`](ieee-conference.md)) — with
  `10pt` and `conference` required in the class line and `compsoc` and `compsocconf` forbidden
  (`tex/template`, `template_forbids`).
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **Where submissions go** (`portal`): `paperlint submission` reads and updates a paper's
  submission through HotCRP's API on that site.
- **Names**: `MSR`, what `tex/venue-leftover` looks for in another venue's paper — only with a year
  beside it (`mentions: with-year`: «MSR 2027», «MSR'27»), since «MSR» is also Microsoft Research
  and an acronym papers define for themselves.
- **Not encoded**: the capitalization of the title and headings (`tex/heading-case` stays off: the
  IEEE guidelines' rule has not been read and quoted here), and the register of the body (no
  accepted MSR paper in the IEEE template exists yet to anchor `tex/contrast-frames` and its
  siblings).

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from msr.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:msr`** — venue preset for MSR · call for papers: <https://2027.msrconf.org/track/msr-2027-technical-papers> · extends `paperlint:ieee-conference`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
