---
title: "FSE 2027 — venue card"
---

# FSE 2027 (Research Papers)

The card of the venue preset `paperlint:fse` ([`fse.jsonc`](fse.jsonc)): what the venue asks for, in
prose. The numbers a machine checks live in the preset; the section at the end is generated from
it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([conf.researchr.org/track/fse-2027/fse-2027-papers](https://conf.researchr.org/track/fse-2027/fse-2027-papers)):
limits, dates and the venue's name in the preset (`FSE 2027`) change between editions.

## Sources

Each read on 2026-11-19:

- the call: <https://conf.researchr.org/track/fse-2027/fse-2027-papers>;
- the dates page: <https://conf.researchr.org/dates/fse-2027>;
- the portal's public deadlines page: <https://fse2027.hotcrp.com/deadlines>.

## The venue (2027 edition)

- **Venue**: the Research Papers track of **FSE 2027**, the ACM International Conference on the
  Foundations of Software Engineering, Shenzhen, China, 12–16 July 2027.
- **Portal**: HotCRP, `https://fse2027.hotcrp.com/` («Submission link: https://fse2027.hotcrp.com/»).
- **Format**, verbatim from the call: «Authors using LaTeX should use the sample-acmsmall-conf.tex
  file (found in the samples folder of the acmart package) with the acmsmall option. We also
  strongly encourage the use of the review, screen, and anonymous options as well. In summary, you
  want to use: `\documentclass[acmsmall,screen,review,anonymous]{acmart}`», «It is a single-column
  page layout. Submissions that do not comply with the above instructions will be desk rejected
  without review.» In acmart v2.21 (TeX Live 2026) the sample is `samples/acmsmall-conf.tex`; no
  file of the call's name is in the package.
- **Double-anonymous**, and «heavy»: «The double-anonymous process used is "heavy", i.e., the paper
  anonymity will be maintained during all reviewing and discussion periods. In case of major
  revision, authors must therefore maintain anonymity in their response letter», and «Papers that
  do not comply with the double-anonymous review process will be desk-rejected.» The call asks for
  names and affiliations left out, one's own work cited in the third person, no author-revealing
  URLs, organization names anonymized, no acknowledgements at submission, and no preprint saying
  it was submitted to FSE 2027. The portal's data says `"blind":true`.
- **Data Availability**: «Authors should provide a supporting statement on the availability of a
  replication package (or lack thereof) in their submitted papers in a section named Data
  Availability after the Conclusion section. This section will not be counted towards your page
  limit.» The same call, in its open-science policy: «This statement will not count towards the page
  limit for the submission. Be careful that such statements continue to maintain author anonymity.»
- **References**: «Submissions will be checked for fabricated, hallucinated, or unverifiable
  references. Papers containing confirmed fabricated or hallucinated citations will be
  desk-rejected without review.» Hidden prompts aimed at reviewers or AI systems may also lead to
  desk rejection. Generative AI: «FSE 2027 follows the ACM Policy on Authorship and the Use of
  Generative AI Tools and Technologies.»
- **Open access**: accepted papers are published open access; without ACM Open at an author's
  institution, the 2027 article processing charge is «USD500 APC for ACM/SIG members and USD750 for
  non-members».
- **Attendance**: «Attendance at the event is not mandatory for publication. Authors also have the
  option of not presenting their work at the conference, in which case they do not need to
  register.»

## Dates

The call's panel, «Important Dates AoE (UTC-12h)», and the dates page agree:

| date                       | what                                                    |
| -------------------------- | ------------------------------------------------------- |
| Fri 2 Oct 2026 → **3 Oct** | full paper submission (extended by one day, see below)  |
| Mon 14 – Fri 18 Dec 2026   | author response period                                  |
| Fri 22 Jan 2027            | initial notification (accept, reject or major revision) |
| Fri 5 Mar 2027             | major revision submission                               |
| Wed 31 Mar 2027            | final notification                                      |

**The submission deadline, two readings, both in the preset** (`deadlines`):

- the call: its panel says «Fri 2 Oct 2026», and a banner above the call says «Due to the
  system-wide HotCRP outage, we are extending the submission deadline by one day, to Oct. 3, AoE.»
  The end of 3 Oct AoE is 2026-10-04 11:59:59 UTC;
- the portal: «Submission deadline: Saturday Oct 3, 2026, 11:59 PM AoE» (`"sub":1791115140`,
  2026-10-04 11:59:00 UTC).

The portal is what refuses an upload, and its reading is 59 s the earlier, so it binds. The deadline
has passed; the preset keeps it as the record of the edition.

## Paper kinds and limits

| kind             | body pages | pages of references | what the call says                                                                                                               |
| ---------------- | ---------: | ------------------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `research`       |         18 |                   4 | «At the time of submission, each paper should have no more than 18 pages for all text and figures, plus 4 pages for references.» |
| `major-revision` |         20 |                   4 | «Major revisions should have no more than 20 pages for all text and figures, plus 4 pages for references.»                       |

A paper names its kind in its `paperlint.json`; after a major-revision decision, the same paper
switches from `research` to `major-revision`.

🔴 **What the page count cannot express.** The Data Availability section does not count toward the
limit, and no preset field takes one section out of the body count. The count is banal's
([`acm-acmsmall.md`](acm-acmsmall.md) says how banal reads this format), and a Data Availability
section is body text to it: one that pushes the body onto a 19th page is reported over the limit
although FSE allows it. A `% eslint-disable` comment in `paper.tex` does not silence
`format/page-limit` (tried 2026-11-19); such a paper turns the rule off in its own `paperlint.json`
(`"rules": { "format/page-limit": "off" }`) and checks its 18 pages by eye.

## What else the preset encodes

- **The ACM single-column template**, through `extends: paperlint:acm-acmsmall` — 6.75 × 10 in, one
  column, Libertine at 10 pt, acmart's TeX packages ([`acm-acmsmall.md`](acm-acmsmall.md)) — with
  `acmsmall` required in the class line (`tex/template`). `review`, `screen` and `anonymous` are
  not required: the call only «strongly encourage[s]» them.
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **Not the Data Availability section.** The call asks for a section named «Data Availability»
  after the Conclusion, but says authors «should» provide it and names no desk reject for its
  absence, so paperlint does not check it (no `required_sections`): add it yourself.
- **Where submissions go** (`portal`): `paperlint submission` reads and updates a paper's
  submission through HotCRP's API on that site.
- **Names**: `FSE 2027`, what `tex/venue-leftover` and `paper/folder-venue-leftover` look for in
  another venue's paper. Not the bare «FSE»: papers write it whenever they cite an FSE paper
  («ESEC/FSE», «FSE 2024»), and `mentions: "with-year"` would still flag «FSE 2024». The year is
  the edition this preset describes; the call spells the venue no other way («FSE'27» does not
  occur), so there is no alias.

## Not verified

- **Appendices.** The call says «18 pages for all text and figures» and does not mention
  appendices. banal counts an appendix after the references as appendix, not body, so an appendix
  there is not counted toward the 18 pages; whether FSE counts it is not stated.
- **What a reference page may hold**: «plus 4 pages for references» does not say whether those
  pages hold only references.
- **The camera-ready**: its date and its page limit are not in the call.
- **The portal's form fields** (`submission_fields`): not recorded; that needs a logged-in read of
  the form.
- **Remote presentation**: the call makes attendance optional for publication, and says nothing of
  a remote talk.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from fse.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:fse`** — venue preset for FSE 2027 · call for papers: <https://conf.researchr.org/track/fse-2027/fse-2027-papers> · extends `paperlint:acm-acmsmall`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
