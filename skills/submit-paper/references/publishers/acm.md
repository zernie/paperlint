---
title: "ACM — camera-ready mechanics, shared across ALL ACM venues"
created: 2026-08-24
updated: 2026-08-24
tags: [publisher, acm, camera-ready, erights, ccs]
---

# ACM: what camera-ready requires

> This is the **publisher** level, not the venue level. Identical for AgenticDev@ASE, AISec@CCS,
> and any other ACM conference. The venue card (`../venues/<venue>.md`) holds only what's its own:
> dates, page limit, its own DOI/ISBN, blind model.
>
> Captured 2026-08-24 from the live AgenticDev #20 HotCRP form — field by field, not from memory.

## 🔴 Order is mandatory, and the first step breaks everything else

**eRights is filled in FIRST and requires the FINAL title and author list.** So any decision about
a title change has to be made **before** it — otherwise the copyright block gets issued under the
old name.

1. **ACM eRights** — a form from ACM, arrives as a link in HotCRP. The final version isn't
   accepted without it.
2. Update **Title** on the portal if it changed (it still holds the submission version).
3. Convert the preamble to camera-ready (table below).
4. Insert the copyright block that eRights returned.
5. Build the PDF → run the portal's format checker.
6. Upload the **Final version** (PDF) **and Source files** — both are mandatory.
7. References: easiest is uploading `.bbl` + `.aux`.
8. Fill in **ACM keywords** and **CCS codes**.
9. `Save and resubmit`.

## Preamble: submission mode ≠ camera-ready

The typical submission preamble is **wrong** for the final. What to change:

| in the submission | in camera-ready | why |
|---|---|---|
| `\settopmatter{printacmref=false}` | remove | the ACM reference line has to print |
| `\setcopyright{none}` | the value from eRights | otherwise the block is wrong |
| `\pagestyle{plain}` | remove | the form explicitly says **"Do not include page numbers"** |
| the `review` option on `\documentclass` | remove | it adds line numbers |

Plus: **all fonts must be embedded** in the PDF.

The **copyright block** goes in the **bottom-left corner of the first page**, its exact form
depends on the choice made in eRights:

```
<Venue> '<YY>, <dates>, <city>, <country>
© <year>
ACM ISBN <ISBN>
https://doi.org/<DOI>
```

⚠️ **DOI and ISBN are assigned in advance** and are visible on the form before upload — there's no
need to wait for them or make them up.

## Portal fields

| Field | Req. | What matters |
|---|---|---|
| **ACM eRights** | ✱ | before everything else; final title + authors |
| **Title** | ✱ | "exactly as it should appear in the ACM Digital Library" |
| **Final version** | ✱ | PDF, up to 600 MB |
| **Abstract** | ✱ | markdown + LaTeX math, has a Preview |
| **Source files** | ✱ | **ALL** build files: `.tex`, `.bib`, figures. Best as a single `.zip` |
| **ACM keywords** | — | one **per line** |
| **CCS** | — | terms from **2012 CCS** via the CCS Browser: Assign concepts → View your CCS Concept → Generate Code → paste the XML |
| **References** | — | upload `.bbl` + `.aux`, or as text one per line |
| **Supplements** | — | an **integral** part of the work (proof, online appendix) |
| **Auxiliary material** | — | NOT integral, but still lands in ACM DL: **dataset/code**. ACM does not claim copyright, but gets distribution rights |

## What to decide deliberately

- **Auxiliary material.** Whether to also put the artifact in ACM DL alongside OSF/GitHub. Upside —
  permanence and an extra findability point; downside — ACM gets distribution rights. Decide per
  paper, not per venue.
- **APC.** If the venue charges one — pay only **after** ACM's author kit, which has the amount and
  the process.

## The frozen version

Camera-ready is a separate **stage** in the sense of `versions/` (see `checkFrozenVersions()` in
`paper-lint.mjs`): the uploaded PDF is stored as `versions/<date>-camera-ready.pdf`, and the commit
of its source is recorded in `PIPELINE-STATUS.md` as `commit <hash>`.

**Why this isn't a formality:** the arXiv posting and the extension paper get diffed against
camera-ready later, and reviewer references to line numbers only resolve against the exact render
a human read. 🔴 The failure that made this rule exist: `agenticdev-2026` had the wrong submission
PDF sitting there for a month (340,952 B vs 352,357 B), and when a reviewer cited `L. 166`, there
was nothing to check it against.
