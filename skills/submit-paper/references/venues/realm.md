# REALM @ EMNLP — venue card

**Family: ACL.** Everything ACL-wide (appendix rule, Limitations/Ethics not counting, anonymity,
OpenReview mechanics) lives in `paper-pipeline/references/acl-venue-rules.md`. Only REALM-specific
facts are here.

Verified by direct fetch of `realm-workshop.github.io/call_for_papers` **2026-08-02 and 2026-08-03**
(twice, independently), plus a live pull of the OpenReview invitation schema.
🔴 **Re-verify every cycle** — dates, limits and tracks move year to year.

## The 2026 edition (2nd edition)

| field | value |
|---|---|
| full name | REALM — workshop at EMNLP 2026 |
| edition | **2nd** (a 1st-edition accepted corpus exists — mine it with `study-accepted-papers`, in SETUP) |
| direct submission deadline | **Wednesday 5 August 2026**, 23:59 **AoE** |
| → in the author's zone | at UTC+5: **6 August 2026, 16:59** (AoE = UTC−12; 5 Aug 23:59 AoE = 6 Aug 11:59 UTC) |
| ARR commitment deadline | 31 August 2026, same AoE convention |
| long paper | **8 pages of content** |
| short paper | 4 pages of content |
| refs + appendices | **unlimited** |
| camera-ready | **+1 page** (9 long / 5 short) |
| archival | optional at submission; archival → **ACL Anthology proceedings** |
| blind | **double-blind** — names and affiliations omitted |
| preprints | explicitly allowed, any time, provided the PDF does not link to de-anonymised info |
| portal | `openreview.net/group?id=EMNLP/2026/Workshop/REALM` |
| format | **PDF only** |
| mandatory sections | none beyond ACL's Limitations; *"authors are expected to attest to the ethical considerations in their work"* |
| venue mode | hybrid; held Thursday 29 October, 9:00–17:30, Room P1 |

## 🔴 The submission form has NO supplementary field

Pulled live from `api2.openreview.net/invitations?id=EMNLP/2026/Workshop/REALM/-/Submission`. The
form's **complete** field list:

```
title · authors · authorids · keywords · TLDR · abstract · pdf ·
archival · cross_submission_to · serve_as_reviewer · venue · venueid
```

There is **no Responsible NLP Checklist and no supplementary upload**. Two consequences:

1. **The artifact must be hosted externally and anonymously**, with the URL inside the PDF. Budget
   time for this — it is a submission blocker, and an artifact reviewer will refuse the Available
   badge without a resolving URL.
2. Do not confuse this route with **ARR**, whose portal *does* have the checklist and separate
   software/data uploads. Different portal, different process. A previous version of this project's
   checklist conflated them.
3. **No checklist field means no LLM-disclosure gate here**, and therefore no required placement for
   it — put the disclosure in Limitations or Ethical considerations, both outside the page limit,
   and keep it out of the reader's first contact with a measurement. Full rule, with the policy text
   and the failure it was written from: `paper-pipeline/references/acl-venue-rules.md`, §GenAI / LLM
   disclosure.

Note `keywords` is a form field, so the keyword line does **not** belong in the typeset PDF.

## The submission form, field by field (filled 2026-08-06, ~15 min before deadline)

Transcribed from the live form while filling it. The API schema above lists field *names*; this is
what the form actually shows, in order, with what each one wants. A field's help text is quoted.

| # | field | required | type | what goes in |
|---|---|---|---|---|
| 1 | **Title** | ✱ | one line | *"Add TeX formulas using $In-line$ or $$Block$$"* — plain text otherwise. **Must match the PDF's title exactly**; a late title edit in the paper means re-uploading the PDF *and* retyping this |
| 2 | **Authors** | ✱ | profile search | pre-filled with the submitting author. *"All authors must have an OpenReview profile prior to submitting"* — a co-author without an active profile blocks the whole submission |
| 3 | **Keywords** | ✱ | comma-separated | free text, no controlled vocabulary. 🔴 **Because this is a form field, the keyword line does NOT belong in the typeset PDF** |
| 4 | **TL;DR** | — | one sentence, 🔴 **hard max 250 characters** | *"a short sentence describing your paper"*. The limit is **not in the help text** — it rejects on submit. Optional, but it is the first thing a bidding reviewer reads: name the mechanism, not the topic. Count the characters before pasting |
| 5 | **Abstract** | ✱ | markdown + TeX, Write/Preview tabs | paste the paper's abstract. Markdown emphasis renders; `**bold**` survives. Backticks render as code |
| 6 | **PDF** | ✱ | file upload | *"Upload a PDF file that ends with .pdf"*. No supplementary field anywhere on the form — see above |
| 7 | **Archival** | ✱ | radio: Archival / Non-archival | Archival → **ACL Anthology**. *"If your paper is a cross-submission (currently under review or already published at another venue), it cannot be archival, per ACL policies."* Changeable at camera-ready |
| 8 | **Cross Submission To** | — | one line | leave **empty** unless the paper is genuinely under review elsewhere. Filling it forfeits archival |
| 9 | **Serve As Reviewer** | ✱ | profile search | *"reciprocal reviewing practice… nominate at least one author to serve as a reviewer using their OpenReview profile ID (e.g. ~First_Last1)"*. **A solo author nominates themself** — the field is required and there is nobody else |
| 10 | License | ✱ | fixed chip | **CC BY 4.0**, not editable |
| 11 | Readers | ✱ | fixed chips | `EMNLP 2026 Workshop REALM` + `authorids` |
| 12 | Signatures | ✱ | fixed chip | the submitting author |

Then **Submit** / Cancel. An Edit History block below repeats Readers + Signatures — informational.

🔴 **The displayed deadline is NOT when writes stop.** An OpenReview invitation carries two dates
and the interface shows only the first:

| field | 2026 edition, UTC | at UTC+5 |
|---|---|---|
| `duedate` — printed everywhere as the deadline | 2026-08-06 11:59 | **16:59** |
| `expdate` — when the invitation actually stops accepting edits | 2026-08-06 12:29 | **17:29** |

A **30-minute grace window**, undocumented in the CFP and invisible on the form. Read it before the
last hour, not after — it is the difference between shipping a fix and abandoning it:

```
curl -sS "https://api2.openreview.net/invitations?id=<VENUE-PATH>/-/Submission" \
  | python3 -c "import json,sys,datetime;[print(k, datetime.datetime.utcfromtimestamp(i[k]/1000)) \
    for i in json.load(sys.stdin)['invitations'] for k in ('duedate','expdate') if i.get(k)]"
```

Do **not** plan around it — a venue may set `expdate == duedate`, and 30 minutes is not a schedule.
Treat it as recovery room for a defect found at the buzzer. Re-read it every cycle.

**Traps hit for real:**

- 🔴 **The title lives in two places and they silently diverge.** A title change at T−14 min meant a
  fresh PDF *and* a retyped Title field. Change the paper first, rebuild, then fill the form — never
  the other way round.
- 🔴 **"Serve As Reviewer" surprises solo authors, and it is not a formality — it enrols you.** It reads
  as though it wants a colleague. It is required, and the answer for a one-author paper is your own
  profile ID. **The day after submitting, the program chairs assign papers and set a review deadline**
  (2026: submissions 5 Aug, reviews due 21 Aug AoE — sixteen days). Consequences to price in BEFORE
  submitting, not after:
  - **ACL's AI policy applies to the reviews.** Verbatim from the chairs' email: *"the use of
    generative AI tools to write an entire review is prohibited. While such tools may be used for
    minor editing (e.g., grammar or clarity), the content and assessment must be the reviewer's own."*
    Every review hour is personal. The sanction for violating it lands on submissions to the next ARR
    cycle — the same ecosystem the paper is in.
  - **The workshop's PC roster is not published**, so the only durable proof of the service is a
    Web of Science verified-review record: forward the chairs' thank-you email to
    `reviews@webofscience.com`. Set that profile up BEFORE reviewing, not after.
  - It is nonetheless a real judging credential, distinct from authorship. One submission closes two
    criteria — but the reviewing window is not negotiable and may collide with other commitments.

  🔴 **Hit for real on `compile-rules-2026`.** This project had *decided on 2026-07-26 not to serve as
  a REALM reviewer*, with three written reasons (no public roster, the window collides with an ASPLOS
  artifact round, the AI policy makes it all personal hours). Eleven days later the required form field
  enrolled him anyway, because the field was filled in from a submission checklist that did not know
  about the decision. **A required form field can silently reverse a recorded decision.** Before
  filling any required field, check whether the project has already decided that question.
- **Keywords are a form field, not paper content** — so anything in the PDF's keyword line is
  duplicated dead weight. Keep the list in a non-typeset comment in the source and paste it here.
- **The abstract field accepts markdown**, so the source abstract can be pasted nearly verbatim.
  Extracting it from the *built PDF* instead is a mistake: `pdftotext` on the line-numbered build
  interleaves the margin numbers and silently drops paragraphs.

## The ARR route is not a free fallback

The 31 August "ARR commitment" deadline commits a paper **that has already been reviewed by ACL
Rolling Review**. It is not a second chance for a paper that was never submitted to ARR — that needs
an ARR submission first, on ARR's own cycle. Do not plan around it without checking the ARR calendar.

## Gotchas hit for real

- **Deadline confusion.** The CFP prints "August 5th" and states the AoE rule in a *different*
  sentence on the same page. A pass on 2026-07-31 concluded "AoE not stated, assume noon 5 Aug" and
  was wrong by 29 hours. Read the whole page, then convert.
- **OpenReview profile moderation is the critical path**, not the writing. An independent author with
  no institutional email and no DBLP record has no expedite route. Start the profile weeks ahead.
- The workshop's hybrid status is confirmed by REALM's **own** root page — do not carry it over from
  EMNLP's general page.

## Sources

- `realm-workshop.github.io/call_for_papers` — CFP (fetched 2026-08-02, 2026-08-03)
- `realm-workshop.github.io/` — root, hybrid confirmation
- `api2.openreview.net/invitations?id=…/-/Submission` — the live form schema
- Per-paper compliance state: `<paper-dir>/SUBMIT-CHECKLIST.md`
