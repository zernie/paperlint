# ACL-family venue rules — what applies to EVERY *ACL venue and workshop

**Scope.** ACL, EMNLP, NAACL, EACL, AACL **and their workshops**, because workshops inherit the
parent conference's author guidelines and template. Fetched from
`acl-org.github.io/ACLPUB/formatting.html` (2026-08-03) and the ACL author checklist. This file
exists so the same page is not re-fetched for every paper; **re-verify once per submission cycle**,
because ACL does change these between years.

Not applicable to ACM (CCS/AISec, sigconf), IEEE (S&P, Xplore) or LIPIcs venues — those have their
own rules and their own cards.

## The page-limit map — what counts and what does not

| part of the PDF | counts toward the limit? |
|---|---|
| body, §1 to the conclusion | **yes** |
| **Limitations** | **no** |
| **Ethical considerations** / Broader impact | **no** |
| references | no |
| **appendices** | **no** |

Long/short page counts are set by the *venue*, not by ACL — see the venue card. Camera-ready
usually grants **one extra page**; that is where a figure cut for space goes, not into the
submission.

## 🔴 The appendix rule, and the trap inside it

Verbatim:

> «Appendices are material that can be read, and include lemmas, formulas, proofs, and tables that
> are **not critical to the reading and understanding of the paper**.»

> «The paper may refer to and cite the supplementary material and the supplementary material will be
> available to the reviewers, **they will not be asked to review the supplementary material**.»

**The reviewer is not obliged to open the appendix.** Everything else follows from that:

- **Body** — anything a claim stands on. Remove it and the claim dangles ⇒ it belongs in the body.
- **Appendix** — the proof a sceptic would go check: per-row tables, protocols, full enumerations,
  robustness checks. Answers *"prove it"*, never *"what do you mean"*.
- **Artifact** (external host) — runnable code and raw data.

🔴 **The trap, hit for real on `compile-rules-2026` 2026-08-03.** Moving something to an appendix
does **not** discharge the obligation attached to a claim. A plan to move §5's *caveat* to the
appendix while the flattering number it qualifies stayed in the body would have left the body
asserting a figure whose walk-back a reviewer is not required to read — in a paper arguing that a
claim must resolve to its backing. A refutation pass killed it.

**Test before moving anything out:** read the body straight through with the appendices closed.
Any *"wait, where does that come from?"* means the cut was wrong.

Appendices must keep the **2-column format**, except math-heavy sections.

## Limitations and Ethics — free space with a hard restriction

- **Limitations is mandatory** at ACL venues: *"ACL currently requires all submissions to have a
  section titled 'Limitations'"*. Unnumbered, after the conclusion, before references, no page break.
- **Ethical considerations is optional** and encouraged; same placement.
- 🔴 Both: *"It may not contain any additional experiments, figures or analysis."*

So they are free space for **honest qualification only**. Pushing an analysis there to win room in
the body violates the rule and reads as evasion. (Watch this one: it is tempting precisely when the
body is at the limit, which is exactly when the temptation should be refused.)

## Anonymity

Double-blind is the norm. Author names and affiliations omitted. **Preprints are generally allowed**
— *"Preprints (e.g., on arXiv) may be posted publicly at any time and do not violate the anonymity
policy, provided the submitted PDF does not link to de-anonymized author information."* So a public
blog or arXiv version does **not** have to be hidden; only the PDF has to stay clean. Confirm per
venue, because the anonymity period differs.

## OpenReview mechanics (the usual ACL-family portal)

- 🔴 **An active profile is required to submit.** Verbatim: *"Submitting authors require an active
  profile — a profile that's still pending moderation doesn't meet that requirement."*
- **Moderation can take up to two weeks.** Cases are reviewed daily. The documented accelerator is a
  confirmed **institutional or company email** on the profile; a DBLP record also helps. An
  independent author with neither has no expedite route and must go through support.
- **Plan the profile before the paper.** This is the one blocker no amount of writing can clear, and
  it is invisible until you try to submit. On `compile-rules-2026` it became the sole critical-path
  item with three days left.
- Check whether the venue's submission form has a **supplementary-material field** by fetching the
  invitation schema from the API, not by reading the CFP page — the form is the source of truth.
  If there is no field, the artifact must be hosted externally and anonymously with the URL in the
  paper.

## 🔴 GenAI / LLM disclosure — there is NO gate on a direct workshop submission, and no required placement

**The policy text, verbatim** (ACL Rolling Review, cross-checked twice):

> *Their use for writing or coding, as well as its scope, **must be disclosed in the Responsible NLP
> Checklist**. Details **should be included in the Acknowledgements section**.*

**Both destinations are ARR-process and/or camera-ready, and neither is reachable at a direct
workshop submission:**

- the **Responsible NLP Checklist** is an ARR form field. A direct workshop submission on OpenReview
  has whatever fields the invitation declares and nothing else. Verify by fetching
  `api2.openreview.net/invitations?id=<VENUE-PATH>/-/Submission` and reading the field list. For
  REALM @ EMNLP 2026 the complete list was `title, authors, authorids, keywords, TLDR, abstract,
  pdf, archival, cross_submission_to, serve_as_reviewer, venue, venueid` — **no checklist field**.
- **Acknowledgements cannot exist in an anonymous review version** — it is the canonical
  deanonymisation vector. So the policy's stated home for the details is structurally unavailable
  until camera-ready.

**Therefore:** nothing desk-rejects for the absence of an LLM-disclosure section, and no rule says
the disclosure must appear early, or in the body, or on page 1. Placement is an *authorial* choice.

**What to actually do**, in order:

1. **Disclose it — but where disclosures live.** Limitations and Ethical considerations are both
   outside the page limit, so the disclosure is free there and costs body words anywhere else.
2. **Do not lead a body section with it.** Naming the model as the agent of a measurement, in the
   reader's first contact with that measurement, spends credibility for no compliance gain. Keep the
   *method* inline where it makes the numbers credible — a written codebook, a blind second pass,
   released labels — and point at Limitations for who executed it.
3. **Make the Limitations version unmissable and complete**, including which sections it covers, so
   a reader who reaches it cannot feel the earlier text concealed anything. A one-line back-reference
   in the body ("Limitations for who did the labelling") is what makes it a pointer rather than a
   burial.
4. **Never replace it with a false claim of human labour.** *by hand · a second person · two
   annotators · manually* — if a model did the work, those words are fabrications about method, and
   they are the failure this rule was written from.

**Enforcement, if the paper has a numbers gate:** put the true method words in the guard's `requires`
column and the false ones in `forbids`. On `compile-rules-2026` the guard did the opposite for weeks
— it *required* the word "hand" near the census figures — so the gate was mechanically holding a
false methodology claim in place, in a paper about rules that claim enforcement they do not have.

**Provenance.** Written 2026-08-06, one hour before the REALM deadline, after the assistant told the
author twice that "ACL mandates it" and then found the verified answer sitting in that paper's own
`SUBMIT-CHECKLIST.md`. The author's instinct — *"maybe the LLM note shouldn't be right on first page
given we have a disclaimer somewhere below"* — was correct, and the assistant's confident memory was
not. Re-verify the form schema each cycle; ARR and workshop forms diverge, and they change year to
year.

## What is venue-specific and therefore NOT here

Page counts per track · archival vs non-archival · ARR commitment route and its deadline · the
submission portal URL and its form fields · anonymity period · attendance requirements · the review
criteria. All of that lives in `submit-paper/references/venues/<venue>.md`.
