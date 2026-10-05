---
title: "AgenticDev @ ASE — venue card"
---

# AgenticDev @ ASE

The card of the venue preset `paperlint:agenticdev` ([`agenticdev.jsonc`](agenticdev.jsonc)): what
the venue asks for, in prose. The numbers a machine checks live in the preset; the section at the
end is generated from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([conf.researchr.org/home/ase-2026/agenticdev-2026](https://conf.researchr.org/home/ase-2026/agenticdev-2026)):
dates, limits and tracks change between editions.

## The venue (2026 edition)

- **Venue**: Workshop on Agentic AI for Next-Generation Software Development, co-located with
  **ASE** (Automated Software Engineering), Munich, October 2026.
- **Portal**: HotCRP, `https://agenticdev2026.hotcrp.com/paper/new`.
- **Deadline**: July 15, 2026, AoE. Notification August 21, camera-ready August 28.
- **Format**: ACM `\documentclass[sigconf,review,anonymous]{acmart}` → **double-blind**. Build with
  `pdflatex; bibtex; pdflatex; pdflatex`; add `\microtypesetup{expansion=false}` (the most common
  acmart crash).
- **No supplementary-material field** on the HotCRP form (Title, Submission, Abstract, Authors, ACM
  corresponding, Contacts, PC conflicts). Host the artifact externally (an anonymized view-only
  link) and `\url{}` it in the paper's Availability section; see `submit-paper` §2.
- **Archival**: accepted papers go into the **ASE workshop proceedings**, with a DOI; selected
  papers are invited to a journal special issue. ASE's publisher **alternates by year** — ASEW '24
  ACM (`10.1145/3691621.*`), ASE 2025 Workshops IEEE (`csdl/proceedings/asew/2025`), the main track
  likewise ('22 ACM, '23 IEEE, '24 ACM, '25 IEEE). There is no dual ACM DL / IEEE Xplore
  publication; the `10.5555` prefix in the ACM DL is a Guide catalog entry, not an ACM
  publication. Confirm the year's publisher with the chairs before paying an article processing
  charge.

## Paper kinds and limits

The preset's `format.kinds`; a paper names its own in its `paperlint.json` (`kind` — in the current cycle when the paper keeps `cycles`).

| kind    | body pages | extra pages of references | what it is            |
| ------- | ---------: | ------------------------: | --------------------- |
| `full`  |         10 |                         2 | mature work           |
| `short` |          5 |                         2 | WIP, vision, position |
| `demo`  |          5 |                         2 | demo or tool          |

At camera-ready the limits stay the same: a sixth page taken by the bibliography of a short paper
still counts within them.

## What else the preset encodes

- **The ACM template**, through `extends: paperlint:acm-sigconf`: letter paper, two columns,
  Libertine at 9 pt, acmart's TeX packages ([`acm-sigconf.md`](acm-sigconf.md)).
- **Balanced columns on the last page** (`pdf/last-page-balance`, 120 pt tolerance). The proceedings
  are produced by Conference Publishing Consulting, whose author instructions require "balanced
  columns on the last page, if the page is not filled"; problem papers are sent back.
- **Headline-style capitalization** in the title and every heading (`tex/heading-case`, the
  `chicago-headline` style). The same producer's instructions: «The title should use headline-style
  capitalization» and «All levels of headings use headline-style capitalization», defined on its
  help page as Chicago Manual of Style §§8.157–8.159.
- **Names**: `AgenticDev` is what `tex/venue-leftover` looks for in another venue's paper; ASE is
  left out on purpose — a three-letter acronym too many sentences use for other things.
- **The talk** (`talk`): remote presentation by video only, with the numbers below.

## Naming the venue correctly

AgenticDev is a workshop of ASE 2026, listed on ASE's own co-located events page; it is **not** the
ASE main track, which has its own program, committee and selectivity.

| write                                                 | do not write                         |
| ----------------------------------------------------- | ------------------------------------ |
| "accepted at AgenticDev 2026, a workshop of ASE 2026" | "accepted at ASE 2026"               |
| "workshop paper, ASE 2026 workshop proceedings"       | "published at a CORE A\* conference" |
| "ASE is CORE A\*; AgenticDev is one of its workshops" | "this paper is CORE A\*"             |

## Registration

Registration of at least one author is a condition of appearing in the proceedings, not only of
attending. 2026: article processing charge $350 (ACM is fully open access since 2026-01-01), and
workshop-day registration (non-member) €350 until 08-31, €410 until 09-20, €460 on site.

## PC members (the "PC conflicts" field) — 2026

Andrea Rosani (Free U Bozen/Bolzano) · Giuseppe Di Fatta (Free U Bozen/Bolzano) · Jean Marie Mottu
(Nantes U) · Paolo Papotti (Eurecom) · Simos Gerasimou (Cyprus U of Technology). The list changes
every year — read the current PC page.

## Topic fit

Trustworthiness, verification and validation of AI agents; benchmarking and empirical evaluation;
integration into developer workflows; agent-based coding and testing.

## Camera-ready (2026 edition)

The ACM mechanics are the same for every ACM venue and live one level up, in the `submit-paper`
skill's `references/publishers/acm.md` (eRights first, the preamble, the copyright block, CCS
concepts, source files). AgenticDev's own:

- **Deadline**: August 28, 2026, 2 PM AoE.
- **ACM ISBN**: `979-8-4007-2985-0/26/10`.
- **Copyright block**: `AgenticDev '26, October 12–16, 2026, Munich, Germany`.
- **No longer double-blind**: the `review` and `anonymous` class options come off for the final.
- **Title changes are allowed** — the portal asks for the title "exactly as it should appear in the
  ACM DL". Decide before eRights.

## The talk (2026 edition)

**The deadline and the upload channel come from the parent conference's not-in-person page, not
from this card** — look it up again for each edition.

Remote presentation is allowed, but there is no live slot: the workshop adopts ASE 2026's
[Not-in-Person Presentations](https://conf.researchr.org/track/ase-2026/ase-2026-not-in-person-presentations)
policy:

> ASE 2026 does not provide presentation slots for papers that are not presented in-person by one
> of the authors.

The author sends instead:

| artifact  | what the page says                                                                                                                | deadline (2026)   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| video     | "made available via a dedicated page on the conference website (recommendation: 10 min duration, mp4 file format, HD resolution)" | 2026-10-08        |
| one-slide | "shown during one of the conference sessions"; no size or format stated                                                           | same as the video |
| poster    | optional for the workshop; ASE prints it                                                                                          | 2026-09-21        |

**Where to upload**: "find the submission link on the submission page for your paper (see
author-kit e-mail from Conference Publishing Consulting)" — the same personal page as the
camera-ready, block "Optional Archive/Appendix/Video/Picture Submissions … Submit Material to ACM".
"All submitted material will be published in the ACM DL if the publishing-rights agreement gives
permission for this", so tick permission for auxiliary material in eRights.

**The slot**: per the chairs' email to all authors (2026-09-29), a short paper gets 10 minutes in
total, approximately 6–7 for the presentation and 3–4 for questions. The full-paper slot was not
stated, so the preset gives `talk` numbers for `short` only. No source requires a live answer to
questions; put a contact address on the video's last slide and on the one-slide.

The `talk/*` rules check the finished files against these numbers: `docs/talk.md`.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from agenticdev.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:agenticdev`** — venue preset for AgenticDev · call for papers: <https://conf.researchr.org/home/ase-2026/agenticdev-2026> · extends `paperlint:acm-sigconf`

| rule | severity | options | set in |
| --- | --- | --- | --- |
| [`pdf/last-page-balance`](../docs/rules.md) | error | `{"tolerancePt":120}` | this preset |
| [`tex/heading-case`](../docs/rules/tex/heading-case.md) | error | `{"title":"chicago-headline","headings":"chicago-headline"}` | this preset |

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
