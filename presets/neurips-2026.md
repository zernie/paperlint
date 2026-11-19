---
title: "NeurIPS — venue card"
---

# NeurIPS (Main Track, 2026 edition)

The card of the venue preset `paperlint:neurips-2026` ([`neurips-2026.jsonc`](neurips-2026.jsonc)): what the venue
asks for, in prose. The numbers a machine checks live in the preset; the section at the end is
generated from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([neurips.cc/Conferences/2026/CallForPapers](https://neurips.cc/Conferences/2026/CallForPapers)):
the limits, the dates and the style file change between editions. The 2027 call was not published on
2026-11-19 (its page answered 404), so the preset holds the 2026 edition, all of whose deadlines have
passed.

## Sources

Each read on 2026-11-19:

- the call: <https://neurips.cc/Conferences/2026/CallForPapers>;
- the Main Track Handbook, which holds the formatting, anonymity and checklist rules:
  <https://neurips.cc/Conferences/2026/MainTrackHandbook>;
- the dates page: <https://neurips.cc/Conferences/2026/Dates>;
- the author kit:
  <https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip>;
- the portal's public venue data (OpenReview):
  <https://api2.openreview.net/groups?id=NeurIPS.cc/2026/Conference>.

## The venue (2026 edition)

- **Venue**: the Main Track of **NeurIPS 2026**, the Fortieth Annual Conference on Neural Information
  Processing Systems (the style file sets its location as Sydney; the dates page lists Atlanta and
  Sydney).
  The Evaluations & Datasets and the Position Paper tracks have their own calls and are not this
  preset.
- **Portal**: OpenReview, `https://openreview.net/group?id=NeurIPS.cc/2026/Conference`. «All authors
  must have an OpenReview profile when submitting.» `paperlint submission` does not reach it (it
  speaks to HotCRP only), so the preset has no `portal`.
- **Format**, verbatim from the handbook: «You must format your submission using the LaTeX style
  file for that year. … This is the only template we will accept … Submissions that violate the
  NeurIPS style (e.g., by decreasing margins or font sizes) or page limits may be desk rejected.»
  The kit adds: «Please make sure you use the current files and not previous versions. Tweaking the
  style files may be grounds for desk rejection.» At submission, the style is loaded with no option
  («please omit the `final` and `preprint` options»).
- **Double-blind**: «All submissions must be anonymized … Please do not include acknowledgments at
  submission time. … Papers violating this policy will be desk rejected.» The style's `ack`
  environment hides the acknowledgements in the anonymous submission.
- **The paper checklist**: «authors are required to complete the paper checklist included in the
  paper template» (the handbook); «Do not remove the checklist: The papers not including the checklist
  will be desk rejected.» and «keep the section heading "NeurIPS Paper Checklist"» (`checklist.tex`).
- **One PDF**, «in this suggested order»: the paper, the references, the appendices, the checklist;
  at most 50 MB. Code and data go separately, in one ZIP of up to 100 MB.
- **LLMs**: their use must be described when it is «an important, original, or non-standard
  component of the approach»; «agents and LLMs cannot be authors»; prompt injections aimed at reviewing
  are prohibited.
- **Camera-ready**: «All 10 pages of the paper, references, text appendices and the paper checklist
  should be combined and uploaded as a single PDF», with «a funding statement and competing interests
  disclosures». At least one author registers for the main conference; «A 'Virtual Only Pass' is not
  sufficient.»

## Dates

The call and the dates page, all Anywhere on Earth:

| date              | what                                              |
| ----------------- | ------------------------------------------------- |
| 4 May 2026        | abstract submission (all authors entered by then) |
| 6 May 2026        | full paper, including all supplementary materials |
| 24 September 2026 | author notification                               |
| 6 November 2026   | camera-ready                                      |

**Two readings of the abstract and the paper deadlines, both in the preset** (`deadlines`): the call's
AoE day ends at 11:59:59 UTC the next day; OpenReview's venue data says «Abstract Registration: May
05 2026 11:59AM UTC-0, Submission Deadline: May 07 2026 11:59AM UTC-0», 59 s earlier. The portal's,
the earlier, binds.

## Paper kinds and limits

| kind           | content pages | references, appendices, checklist | what the handbook says                                                                                                                                                                                                                      |
| -------------- | ------------: | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`         |             9 | not counted                       | «The main text of a submitted paper is limited to nine content pages, including all figures and tables. Additional pages containing references, optional technical appendices and mandatory paper checklist do not count as content pages.» |
| `camera-ready` |            10 | not counted                       | «If your submission is accepted, you will be allowed an additional content page for the camera-ready version.»                                                                                                                              |

A paper names its kind in its `paperlint.json`. After acceptance the same paper switches to
`camera-ready`, and its cycle's `accepted` turns `anonymity/identity` off.

The content pages are banal's body count. Measured on `fixtures/build-e2e/neurips`: banal types the
pages from the references on as references and appendix, the checklist among them whether it follows
the appendix or the references, and counts the page the references start on as content when the text
runs onto it. Not `body_ends_at`: the anonymous submission has line numbers, and the references
heading then reads «References346» in the PDF's text, which that count does not take for a heading
(measured: `format/page-limit` could not tell where the body ends). In the camera-ready, the
acknowledgements stand before the references and are counted as content, which the kit says they
are not («Additional pages containing acknowledgments, references, checklist, and optional technical
appendices do not count as content pages»).

## What the preset encodes

- **The NeurIPS style**, through `extends: paperlint:neurips-style` — letter page, one column,
  Times at 10 pt, references at 9 to 10 pt, the TeX packages the style needs
  ([`neurips-style.md`](neurips-style.md)). That the style file is loaded, is this year's, and is
  unchanged is not checked: the family's card says why.
- **Double-blind review** (`blind`), so `anonymity/identity` checks the PDF against the paper's
  declared `identity`.
- **The checklist** (`required_sections`): a section titled exactly «NeurIPS Paper Checklist», as the
  kit's `checklist.tex` sets it. Where it stands is not checked: the order is only «suggested». Whether
  its answers are filled in (`\answerTODO`) is not checked either.
- **Names**: `NeurIPS`, what `tex/venue-leftover` and `paper/folder-venue-leftover` look for in
  another venue's paper, and in the text only beside a year (`mentions: "with-year"`). 🔴 Any year: a
  paper of another venue whose text says «published at NeurIPS 2023» gets a warning, although it
  cites a NeurIPS paper and is no leftover. A bare «NeurIPS» is not reported, nor is the
  bibliography, which the rule does not read.

## Not verified

- **Whether the 2027 limits are the same.** The style says «The margins in 2026 are the same as those
  in previous years»; the page limit and the checklist rule are the 2026 handbook's.
- **The camera-ready page count with acknowledgements**: see above.
- **The submission form's fields**: not recorded; OpenReview's form needs a logged-in read.
- **Remote presentation**: the handbook requires an in-person registration and allows a substitute
  presenter; it says nothing of a remote talk.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from neurips-2026.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:neurips-2026`** — venue preset for NeurIPS · call for papers: <https://neurips.cc/Conferences/2026/CallForPapers> · extends `paperlint:neurips-style`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
