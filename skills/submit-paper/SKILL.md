---
name: submit-paper
description: End-to-end playbook for submitting a peer-reviewed paper to a double-blind venue (HotCRP workshops/conferences) — from a hardened draft to "ready for review." Covers building and anonymously hosting a reproduction artifact, HotCRP profile + form mechanics, double-blind hygiene, and the authorship/credential angles for an independent researcher. Use when the paper is drafted and reviewed and it's time to actually submit. Compose with pc-panel-review / paper-adversarial-review (harden first), and with the venue card (presets/<venue>.md in the paperlint package) for venue specifics.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, Skill]
---

<!-- vigiles:sha256:a092abea8873fccc compiled from skills/submit-paper/SKILL.md.spec.ts -->

# submit-paper — get a reviewed paper from "done" to "ready for review"

Assumes the paper is already hardened (run `pc-panel-review` — incl. its venue-fit mode — +
`paper-adversarial-review` first). This skill is the submission mechanics — the part that bit us with
avoidable friction the first time. Distilled from the AgenticDev 2026 submission.

## Venue specifics — a CARD beside the venue's preset, not a skill
The venue-specific facts (deadline, page limits, tracks, PC-member conflict list, blind model, format
quirks, whether a supplementary-upload field exists) live in the venue's **card**, `presets/<venue>.md`
in the paperlint package, beside the preset `presets/<venue>.jsonc` that the lint rules check a
paper against:
- `presets/agenticdev.md` — AgenticDev @ ASE (workshop; ASE workshop proceedings).
- `presets/aisec.md` — AISec @ ACM CCS (security workshop; ACM DL; harder bar).
- `presets/aidc.md` — AIDC @ IEEE ACSAC (workshop; IEEE template, LLM Usage Statement).
- `presets/msr.md` — MSR Technical Papers (conference; IEEE template from 2027, appendices count in the page limit).
- `presets/realm.md` — REALM @ EMNLP (ACL family, OpenReview).

**The card is prose; the machine-checked format is the PRESET beside it.** A paper declares its venue
in `<paper>/paperlint.json`, in its current (open) cycle:
`"venue": { "kind": "preset", "extends": "paperlint:<venue>" }` and `"kind": "<kind>"`, plus
`"submission": { "id": <the number the portal shows> }` once the portal has assigned one — never at
the top level beside `cycles`, where the file is refused. (Legacy flat form, a paper with no
`cycles`: `{ "extends": "paperlint:<venue>", "kind": "<kind>" }` at the top level.) The
`pdf/*` lint rules judge the built PDF against that preset (page limit per kind, fonts, page size,
columns, font sizes). The card's last section — what the preset is, its call for papers, the rules it
sets and where each comes from — is generated from the preset, so read the numbers there, not from
memory.

**The pattern (follow it for every new venue):** when you fetch a venue's exact submission
instructions, write the numbers into a preset with their quotes and the rest into a card beside it.
A venue with no shipped preset extends a family — `paperlint:acm-sigconf` for an ACM venue — in a
preset of the project's own, `./venues/<name>.jsonc`, with its card `./venues/<name>.md` next to
it (paperlint's `docs/rules.md`, "Writing your own venue preset"). A venue preset declares
`"type": "venue"`, the venue's `name` and the `url` of its call for papers. The *mechanics*
stay here; the card is only the facts.

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
- **Before the PDF goes up — and before every Replace — hand the last check to the author, in plain
  words.** Tell them that paperlint passing is not the venue accepting the format: the preset is
  transcribed from a call that can change, and any check can miss something. Ask them to open the
  exact PDF they are about to upload and check it against the venue's call for papers themselves —
  the page count and what counts toward the limit (appendices, references), the template and its
  class options, anonymity, and that every figure, table and reference renders. Upload once they say
  they have looked. (`paperlint submission update` prints the same request before it sends.)
- **Save and submit**, then **mark it "ready for review."** A saved draft alone is NOT evaluated — this
  is the step people miss.
- You can edit until the deadline: use **Replace** on the Submission field to swap the PDF for a late
  fix (e.g. adding the artifact link after you host it). Submit early, upgrade before the deadline.
- When the venue preset declares its HotCRP portal, replacing the PDF or abstract and proving the portal holds the latest build is `submission-portal` (`paperlint submission show|update`).

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

## Compose with
- Harden first: `pc-panel-review` (incl. its venue-fit mode), `paper-adversarial-review`, `render-paper`.
- Publisher mechanics (camera-ready): `references/publishers/<publisher>.md`.
- Venue specifics: the venue's card `presets/<venue>.md` in the paperlint package (e.g.
  `presets/agenticdev.md`) for deadlines, page limits, PC-member conflict lists, and whether a
  supplementary upload exists.

## Provenance
Written from the AgenticDev 2026 @ ASE submission (2026-07-13): PC-panel-reviewed, self-checking
artifact hosted on an OSF anonymized view-only link (no supplementary field at the venue), submitted #20
ready-for-review. The friction points here — no supplementary slot, 4open needing a repo, the abstract
re-paste, "ready for review" being a separate step, the PDF-only rule — are the ones that cost time.
