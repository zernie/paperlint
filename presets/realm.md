---
title: "REALM @ EMNLP — venue card"
---

# REALM @ EMNLP

The card of the venue preset `paperlint:realm` ([`realm.jsonc`](realm.jsonc)): what the venue asks
for, in prose. The numbers a machine checks live in the preset; the section at the end is generated
from it. The `submit-paper` skill reads this card for the venue's specifics.

**Family: ACL.** What is ACL-wide (the appendix rule, Limitations and Ethics outside the limit,
anonymity, OpenReview mechanics) lives in `paper-pipeline/references/acl-venue-rules.md`; only
REALM's own facts are here. ACL's template is not a class — `acl_latex.tex` loads `acl.sty` into
`\documentclass[11pt]{article}` — so this preset extends no family and carries the template's
numbers itself.

Sources: the call for papers,
[realm-workshop.github.io/call_for_papers](https://realm-workshop.github.io/call_for_papers)
(fetched 2026-08-02 and 2026-08-03), and the OpenReview invitation schema.
🔴 **Re-verify every cycle** — dates, limits and tracks move between editions.

## The venue (2026 edition, the 2nd)

| field                      | value                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| full name                  | REALM — workshop at EMNLP 2026                                                                                |
| edition                    | **2nd** (the 1st edition's accepted papers exist — mine them with `study-accepted-papers`)                    |
| direct submission deadline | **Wednesday 5 August 2026**, 23:59 **AoE** (= 6 August 11:59 UTC)                                             |
| ARR commitment deadline    | 31 August 2026, same AoE convention                                                                           |
| archival                   | optional at submission; archival → **ACL Anthology proceedings**                                              |
| blind                      | **double-blind** — names and affiliations omitted                                                             |
| preprints                  | allowed at any time, provided the PDF does not link to de-anonymized information                              |
| portal                     | `openreview.net/group?id=EMNLP/2026/Workshop/REALM`                                                           |
| format                     | **PDF only**                                                                                                  |
| mandatory sections         | none beyond ACL's Limitations; _"authors are expected to attest to the ethical considerations in their work"_ |
| venue mode                 | hybrid; Thursday 29 October, 9:00–17:30, Room P1                                                              |

## Paper kinds and limits

| kind    | at submission | at camera-ready | references and appendices |
| ------- | ------------: | --------------: | ------------------------: |
| `long`  |       8 pages |         9 pages |                 unlimited |
| `short` |       4 pages |         5 pages |                 unlimited |

🔴 **The page limit is not gated by the preset**, and that is a measurement: banal counts
Limitations and Ethics as body, which ACL excludes from the limit, so a gate on its count reports a
paper inside the limit. The numbers sit in the preset's `page_limits_not_gated`, as data for a
counter that knows where the body ends; the two kinds exist so a paper can name its own.

## What else the preset encodes

- **The template**: `\documentclass[11pt]{article}` (`tex/template`), A4, two columns, Times at
  11 pt, references between 9 and 11 pt — measured on a build, not copied from ACL's text.
- **TeX packages** `acl.sty` needs: lineno, and the Times, Helvetica, Courier, Symbol and Zapf
  Dingbats fonts (without them: "Font ptmr8t not loadable" and no PDF).
- **Names**: `REALM` and `EMNLP`, what `tex/venue-leftover` looks for in another venue's paper.

## 🔴 The submission form has no supplementary field

From `api2.openreview.net/invitations?id=EMNLP/2026/Workshop/REALM/-/Submission`, the form's
**complete** field list:

```
title · authors · authorids · keywords · TLDR · abstract · pdf ·
archival · cross_submission_to · serve_as_reviewer · venue · venueid
```

There is no Responsible NLP Checklist and no supplementary upload. So:

1. **Host the artifact externally and anonymously**, with the URL inside the PDF — a submission
   blocker, and an artifact reviewer refuses the Available badge without a resolving URL.
2. **Do not confuse this route with ARR**, whose portal does have the checklist and separate
   software and data uploads.
3. **No checklist means no LLM-disclosure field here**: put the disclosure in Limitations or Ethical
   considerations, both outside the page limit
   (`paper-pipeline/references/acl-venue-rules.md`, §GenAI / LLM disclosure).

`keywords` is a form field, so a keyword line does **not** belong in the typeset PDF.

## The submission form, field by field

What the live form shows, in order. Help text is quoted.

| #   | field                   | required | type                                         | what goes in                                                                                                                                                                                                                                   |
| --- | ----------------------- | -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Title**               | ✱        | one line                                     | _"Add TeX formulas using $In-line$ or $$Block$$"_ — plain text otherwise. **Must match the PDF's title exactly**; a late title edit in the paper means re-uploading the PDF _and_ retyping this                                                |
| 2   | **Authors**             | ✱        | profile search                               | pre-filled with the submitting author. _"All authors must have an OpenReview profile prior to submitting"_ — a co-author without an active profile blocks the whole submission                                                                 |
| 3   | **Keywords**            | ✱        | comma-separated                              | free text, no controlled vocabulary. 🔴 **Because this is a form field, the keyword line does NOT belong in the typeset PDF**                                                                                                                  |
| 4   | **TL;DR**               | —        | one sentence, 🔴 **hard max 250 characters** | _"a short sentence describing your paper"_. The limit is **not in the help text** — it rejects on submit. Optional, but it is the first thing a bidding reviewer reads: name the mechanism, not the topic. Count the characters before pasting |
| 5   | **Abstract**            | ✱        | markdown + TeX, Write/Preview tabs           | paste the paper's abstract. Markdown emphasis renders; `**bold**` survives. Backticks render as code                                                                                                                                           |
| 6   | **PDF**                 | ✱        | file upload                                  | _"Upload a PDF file that ends with .pdf"_. No supplementary field anywhere on the form — see above                                                                                                                                             |
| 7   | **Archival**            | ✱        | radio: Archival / Non-archival               | Archival → **ACL Anthology**. _"If your paper is a cross-submission (currently under review or already published at another venue), it cannot be archival, per ACL policies."_ Changeable at camera-ready                                      |
| 8   | **Cross Submission To** | —        | one line                                     | leave **empty** unless the paper is genuinely under review elsewhere. Filling it forfeits archival                                                                                                                                             |
| 9   | **Serve As Reviewer**   | ✱        | profile search                               | _"reciprocal reviewing practice… nominate at least one author to serve as a reviewer using their OpenReview profile ID (e.g. ~First_Last1)"_. **A solo author nominates themself** — the field is required and there is nobody else            |
| 10  | License                 | ✱        | fixed chip                                   | **CC BY 4.0**, not editable                                                                                                                                                                                                                    |
| 11  | Readers                 | ✱        | fixed chips                                  | `EMNLP 2026 Workshop REALM` + `authorids`                                                                                                                                                                                                      |
| 12  | Signatures              | ✱        | fixed chip                                   | the submitting author                                                                                                                                                                                                                          |

Then **Submit** / Cancel.

🔴 **The displayed deadline is not when writes stop.** An OpenReview invitation carries two dates
and the interface shows only the first:

| field                                                          | 2026 edition, UTC |
| -------------------------------------------------------------- | ----------------- |
| `duedate` — printed everywhere as the deadline                 | 2026-08-06 11:59  |
| `expdate` — when the invitation actually stops accepting edits | 2026-08-06 12:29  |

A 30-minute window, undocumented in the call and invisible on the form. Read it before the last
hour:

```
curl -sS "https://api2.openreview.net/invitations?id=<VENUE-PATH>/-/Submission" \
  | python3 -c "import json,sys,datetime;[print(k, datetime.datetime.utcfromtimestamp(i[k]/1000)) \
    for i in json.load(sys.stdin)['invitations'] for k in ('duedate','expdate') if i.get(k)]"
```

Do not plan around it — a venue may set `expdate == duedate`. It is room to recover from a defect
found at the deadline, not a schedule.

## Traps

- **The title lives in two places, and they diverge silently.** Change the paper first, rebuild,
  then fill the form — never the other way round.
- **"Serve As Reviewer" enrols the nominee.** The day after submission the program chairs assign
  papers and set a review deadline (2026: submissions 5 August, reviews due 21 August AoE, sixteen
  days). ACL's AI policy applies to the reviews, verbatim from the chairs' email: _"the use of
  generative AI tools to write an entire review is prohibited. While such tools may be used for
  minor editing (e.g., grammar or clarity), the content and assessment must be the reviewer's
  own."_ The sanction lands on submissions to the next ARR cycle. Price the reviewing window in
  before submitting, and check whether a decision about reviewing was already made before filling
  a required field.
- **Keywords are a form field, not paper content.** Keep the list in a non-typeset comment in the
  source and paste it here.
- **The abstract field accepts markdown**, so paste the source abstract. Extracting it from the
  built PDF is a mistake: on a line-numbered build the extractor interleaves the margin numbers and
  drops paragraphs.
- **The deadline's time zone is stated in a different sentence** of the call than the date. Read
  the whole page, then convert.
- **OpenReview profile moderation is the critical path.** An author with no institutional email and
  no DBLP record has no expedite route; start the profile weeks ahead.
- The workshop's hybrid status comes from REALM's own root page, not EMNLP's general one.

## The ARR route is not a free fallback

The 31 August "ARR commitment" deadline commits a paper **already reviewed by ACL Rolling Review**.
A paper never submitted to ARR needs an ARR submission first, on ARR's own cycle.

## Sources

- `realm-workshop.github.io/call_for_papers` — the call (fetched 2026-08-02, 2026-08-03)
- `realm-workshop.github.io/` — the root page, hybrid confirmation
- `api2.openreview.net/invitations?id=…/-/Submission` — the live form schema

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from realm.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:realm`** — venue preset for REALM · call for papers: <https://realm-workshop.github.io/call_for_papers>

This preset sets no rules: a paper that extends it runs with paperlint's defaults.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
