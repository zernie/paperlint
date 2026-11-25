---
title: "LangCode @ NAACL 2027 — venue card"
---

# LangCode @ NAACL 2027

The card of the venue preset `paperlint:langcode-2027` ([`langcode-2027.jsonc`](langcode-2027.jsonc)):
what the venue asks for, in prose. The numbers a machine checks live in the preset; the section at
the end is generated from it.

Sources: the call, [langcode2027.github.io](https://langcode2027.github.io/), and its submission
page, [langcode2027.github.io/submission](https://langcode2027.github.io/submission/), both read
2026-11-25. The call says «Subject to change»: 🔴 **re-read it before relying on a date.**

## The venue (2027, the 1st edition)

| field            | value                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| full name        | LangCode 2027, the First Language and Code Workshop, at NAACL 2027                                                                             |
| where and when   | «NAACL 2027, June 1–5, 2027, in San Francisco, California, USA»; «One day, in person, hybrid. Authors who cannot travel can present remotely.» |
| submission       | **5 February 2027**, «11:59 PM UTC-12» (= 6 February 11:59 UTC), on OpenReview                                                                 |
| ARR commitment   | 12 March 2027, for papers already reviewed through ACL Rolling Review                                                                          |
| notification     | 26 March 2027                                                                                                                                  |
| camera-ready     | 16 April 2027, «with one extra page»                                                                                                           |
| archival         | «All accepted papers are archival and appear in the LangCode 2027 proceedings in the ACL Anthology … There is no non-archival option.»         |
| blind            | **double-blind**: «Remove names and affiliations, cite your own work in the third person, and anonymize code links.»                           |
| template         | ACL: «Use the official template as is. Don't change margins, fonts, or spacing.»                                                               |
| required section | **Limitations**: «Place it after the conclusion. It's required, and it doesn't count toward your pages.»                                       |

## What the workshop is for

The call's headline: «Towards secure, trustworthy, robust, and multilingual code generation.» Its
five areas, «including but not limited to», are Secure Code Generation, Trustworthiness,
Robustness, Multilinguality and Applications; each area's topics are in the preset's `scope`,
verbatim.

## Paper kinds and limits

| kind     | at submission | at camera-ready | not counted                                                                                                 |
| -------- | ------------: | --------------: | ----------------------------------------------------------------------------------------------------------- |
| `long`   |       8 pages |         9 pages | «references, the required Limitations section, the optional Ethical Considerations section, and appendices» |
| `short`  |       4 pages |         5 pages | the same                                                                                                    |
| `system` |       4 pages |         5 pages | the same; «Only teams that took part in the Test phase can submit one.»                                     |

🔴 **The page limits are not gated.** `format/page-limit` counts the body up to the references or
the appendix, so it would count the Limitations and Ethical Considerations sections as body and
report a paper inside the limit (the same measurement as [REALM 2026](realm-2026.md)).

## What the preset encodes

- **The template**, through `extends: paperlint:acl-latex` ([`acl-latex.md`](acl-latex.md)): the
  class line and the TeX packages.
- **Double-blind review** (`blind`): `anonymity/identity` looks for the paper's own identity in the
  PDF.
- **The Limitations section** (`required_sections`): `tex/required-section` reports a paper without
  `\section{Limitations}` or `\section*{Limitations}`.
- **The deadlines**, from the call, in UTC.
- **The scope**: the headline and the topics above, verbatim, for a reader; no rule judges a paper
  against them.
- **The parent conference**, `"workshop": true` and `"parent": "paperlint:naacl-2027"`
  ([`naacl-2027.md`](naacl-2027.md)): «NAACL 2027» counts as a LangCode paper's own conference.

## Not verified

- The OpenReview group's address and its form's fields: not read, so the preset names no portal.
- Whether the Ethical Considerations section is required: the call calls it «optional».

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from langcode-2027.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:langcode-2027`** — venue preset for LangCode 2027 · call for papers: <https://langcode2027.github.io/> · extends `paperlint:acl-latex`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
