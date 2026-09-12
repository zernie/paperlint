---
name: submit-paper
description: End-to-end playbook for submitting a peer-reviewed paper to a double-blind venue (HotCRP workshops/conferences) — from a hardened draft to "ready for review." Covers building and anonymously hosting a reproduction artifact, HotCRP profile + form mechanics, double-blind hygiene, and the authorship/credential angles for an independent researcher. Use when the paper is drafted and reviewed and it's time to actually submit. Compose with pc-panel-review / paper-adversarial-review (harden first), and with the venue data card (references/venues/<venue>.md) for venue specifics.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, Skill]
---

<!-- vigiles:sha256:6befc6c0f3e910bd compiled from skills/submit-paper/SKILL.md.spec.ts -->

# submit-paper — get a reviewed paper from "done" to "ready for review"

## Run me

🔴 FIRST, before any other step:

```
node .claude/skills/paper-pipeline/scripts/announce.mjs submit-paper <paper-dir>
```

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Assumes the paper is already hardened (run `pc-panel-review` — incl. its venue-fit mode — +
`paper-adversarial-review` first). This skill is the submission mechanics — the part that bit us with
avoidable friction the first time. Distilled from the AgenticDev 2026 submission.

## Venue specifics — a DATA card, not a skill
The venue-specific facts (deadline, page limits, tracks, PC-member conflict list, blind model, format
quirks, whether a supplementary-upload field exists, the extension target) live as **plain reference
data files** under `references/venues/<venue>.md`:
- `references/venues/agenticdev.md` — AgenticDev @ ASE (workshop; ACM DL/IEEE Xplore).
- `references/venues/aisec.md` — AISec @ ACM CCS (security workshop; ACM DL; harder bar).

**The pattern (follow it for every new venue):** when you fetch a venue's exact submission instructions,
save them as a new **data file** `references/venues/<venue>.md` (short `title:` frontmatter only — NOT a
skill with `name:`/`description:`). This preserves the "save the exact venue instructions" rule while
keeping the skill namespace from proliferating one card per venue. The *mechanics* stay here; the venue
file is only the facts.

## Publisher specifics — one level ABOVE the venue
Camera-ready mechanics belong to the **publisher**, not the venue: ACM eRights, the submit-vs-final
preamble swap, the copyright block, CCS 2012 codes and the mandatory Source-files upload are identical
for every ACM venue. They live in `references/publishers/<publisher>.md`:
- `references/publishers/acm.md` — ACM (AgenticDev @ ASE, AISec @ CCS, and every future ACM venue).

The venue card keeps only what is genuinely its own: dates, page limits, its DOI/ISBN, its copyright
line, its blind model. 🔴 **Filing publisher mechanics under one venue is the mistake this split exists
to prevent** — it was written into `agenticdev-2026/CAMERA-READY-FORM.md` first, where AISec could
never find it.

## 0. Pre-flight
- PDF compiles clean (`pdflatex; bibtex; pdflatex; pdflatex`), ≤ page limit, 0 undefined refs.
- **De-anon scan the PDF text AND every shipped file** before submitting — author-identifying strings
  must return zero; identifying the *studied* artifact is fine, identifying *you* is a desk-reject.
  **MECHANICAL GATE (run it, don't eyeball) — greps the PDF text + every artifact file + inside any
  `*.zip` for the identity deny-list, exit non-zero on a hit:**
  ```
  bash .claude/skills/submit-paper/check-deanon.sh <paper-dir> [pdf=paper.pdf]
  ```
  Must PASS (exit 0) for a double-blind submission. Deny-list: `.claude/skills/submit-paper/deanon-denylist.txt`
  (edit as handles/repos change). This is the sibling of `render-paper/check-render.sh` and guards the
  single highest reject-vector (an artifact README naming real maintainers/repos is invisible to a
  paper-only read). Only run it on *double-blind* papers — a de-anonymized single-blind PDF is supposed
  to carry your name and will (correctly) fail. Canonical deny-list rationale → `paper-pipeline/references/anonymization.md`.

## 1. Build a reproduction artifact (empirical papers)
The single biggest accept-probability lever for a measurement paper — reviewers reward one they can run.
In short: a stdlib-only script that *recomputes* every headline number from raw data and **exits
non-zero on drift**; honest badge/scope (don't claim "raw N runs" for per-arm aggregates); a README
"what reproduces which number" table + LICENSE; scrubbed of `__pycache__` and fingerprints before it
ships. Canonical build checklist → `paper-pipeline/references/artifact-checklist.md`.

## 2. Host the artifact ANONYMOUSLY (double-blind)
Many workshop HotCRPs have **no supplementary-upload field** — check first; if none, host externally and
`\url{}` the link in the paper's Availability.
- **OSF (osf.io) — best; self-upload, no repo needed.** Create a **Private** project (title = paper
  title, no name), upload the files/zip, then **Contributors → View-only Links → Add → check
  "Anonymize" → Create**. Keep the project private; the anonymized view-only link is what reviewers get.
  OSF has a REST API + `osfclient` (`OSF_TOKEN`) → **automatable**: with a personal access token you can
  create the project, upload, and mint the link programmatically. See `osf-artifact-upload` for the API calls; whatever uploader you use must read the token
  from the `OSF_TOKEN` environment variable and never from a file in the repository. Record each
  minted view-only link in your own notes and REUSE it — a second link for the same paper is a
  second thing reviewers can be handed, and only one of them is the one you cited.
- Alternatives: `anonymous.4open.science` (anonymizes a **GitHub repo** — needs a repo, not file upload;
  use a *private* source repo so the original isn't Google-findable); a throwaway identity-free account.
  Avoid Google Drive / Zenodo / Figshare for blind review — they leak the owner name.
- **VERIFY in an incognito window** (logged out): the link must show the files with contributors =
  "Anonymous" and your name nowhere. Then put the URL in Availability via `\url{}` and rebuild.

## 3. HotCRP profile (do this once, before the form)
- **Name = your canonical / passport legal name**, identical on every paper you submit. (For
  a dossier, name consistency across papers/LinkedIn/letters is load-bearing — see §6.)
- **Affiliation**: `None` (or `Unaffiliated`) if independent.
- **Country/region = where you actually reside**, not citizenship — this sidesteps ACM/IEEE
  sanctions/payment friction for authors from sanctioned countries.
- **ORCID**: create one (free, 2 min) and reuse it on every paper. It's a permanent ID that ties all
  your work to one identity *regardless of name spelling* — the fix for any name-variant problem.
- **Collaborators / other affiliations (COI)**: `None` if you have no recent coauthors/advisors.

## 4. The submission form
- **Title**: exactly as it should appear in the proceedings (ACM DL) — plain text, no markup.
- **Submission**: upload **PDF only**. NEVER upload a source zip of the paper directory — sibling files
  (drafts, READMEs, internal notes) leak identity. Only a scrubbed bundle is safe.
- **Abstract**: HotCRP makes you paste it into its own box even though it's in the PDF (it indexes it
  separately). Paste plain text; convert LaTeX math to unicode (`~0.6%`, `≈`).
- **Authors (anonymous)**: enter your **real name + email** here — this metadata is hidden from
  reviewers; the *PDF* is what's anonymized. That's how double-blind works; it's correct, not a leak.
- **ACM corresponding author**: default (first author).
- **PC conflicts**: check only genuine COIs (past advisor/student, same affiliation, ≤2-yr coauthor).
  An independent researcher with no ties usually checks **none** — that's honest.

## 5. Submit
- **Save and submit**, then **mark it "ready for review."** A saved draft alone is NOT evaluated — this
  is the step people miss.
- You can edit until the deadline: use **Replace** on the Submission field to swap the PDF for a late
  fix (e.g. adding the artifact link after you host it). Submit early, upgrade before the deadline.

## 6. Independent-researcher / dossier notes
- **Name consistency** is the quiet risk: publications, LinkedIn, passport, letters must resolve to one
  person. ORCID is the tool; pick one surname and use it everywhere from paper #1.
- Keep the **organizer review-offer email** + any PC/reviewer confirmation — that's the *judging*
  criterion evidence (separate from authorship).
- **Space submissions out** — don't cluster all papers in the month before an external
  filing — the FILING-SPACING rule `plan-paper-timeline` applies. A burst right before a filing reads
  as manufactured rather than sustained, and that is an observed, documented refusal ground.
- After acceptance: plan the **camera-ready de-anonymization** and an **extension to a higher-prestige
  venue** (workshop → conference, ≥30% new) as a second, stronger publication.

## 7. Freeze the version you actually uploaded

🔴 **The moment the portal accepts the file, download it back and commit it.** The rendered PDF is the
only artifact git cannot reconstruct — it was built outside the repo and lived on the portal.

```
<paper-dir>/versions/<ISO-date>-submitted.pdf
```

and in `PIPELINE-STATUS.md`, on the Submit row, the source that produced it: the literal word
**`commit <hash>`**. Stages are `submitted` / `camera-ready` / `arxiv`; each one you *declare* in
PIPELINE-STATUS needs its own frozen file.

**This is enforced, not advised** — `checkFrozenVersions()` in `.claude/hooks/paper-lint.mjs` reads the
declared stages and reports a paper that declared one without freezing it. The convention itself is
documented per-paper in `versions/README.md`.

**Why it is a step and not hygiene:** `agenticdev-2026` kept a folder for exactly this for a month and
the file inside was the wrong build (340 952 B vs the real 352 357 B). It surfaced only when a reviewer
cited `L. 166` and there was nothing to resolve the line against. A folder without a checker is a
convention with no reader.

## 8. Record the verdict

🔴 LAST step, once the deliverable exists:

```
node .claude/skills/paper-pipeline/scripts/ledger.mjs record submit-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record submit-paper <paper-dir> ABSTAINED <reason> "<one line>"
```

**FINDING** — `check-deanon.sh` exited non-zero, `access` is not green, the PDF is over the limit, or
the ready-for-review click never happened; `<count>` is the number of blocking items and
`<report-path>` names them. Always `--blocking` — every item here stops the submission.
**ABSTAINED** — `no-witness`: uploaded **and** marked ready for review, with the venue card or the
submission id in the note. `blocked`: the portal account is not through moderation yet.

🔴 **A saved draft must never be recorded as done — and it now cannot be.** A saved-but-not-submitted
paper is the one failure this skill's provenance names by hand, and it was invisible to every other
check in the pipeline. There is no constructor for "submitted"; there is only the absence of blocking
items, plus a submission id in the note that a human can go and look up. The id IS the witness, and
recording `no-witness` without one is the same lie in a new vocabulary.

## Compose with
- Harden first: `pc-panel-review` (incl. its venue-fit mode), `paper-adversarial-review`, `render-paper`.
- Publisher mechanics (camera-ready): `references/publishers/<publisher>.md`.
- Venue specifics: the matching data card `references/venues/<venue>.md` (e.g.
  `references/venues/agenticdev.md`) for deadlines, page limits, PC-member conflict lists, whether
  supplementary upload exists, and the extension target.

## Provenance
Written from the AgenticDev 2026 @ ASE submission (2026-07-13): PC-panel-reviewed, self-checking
artifact hosted on an OSF anonymized view-only link (no supplementary field at the venue), submitted #20
ready-for-review. The friction points here — no supplementary slot, 4open needing a repo, the abstract
re-paste, "ready for review" being a separate step, the PDF-only rule — are the ones that cost time.
