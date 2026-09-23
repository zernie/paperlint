---
title: "AgenticDev @ ASE — venue card (data)"
---

# AgenticDev @ ASE venue card

> **This is a venue DATA file, not a skill.** Follow the `submit-paper` skill for the end-to-end
> mechanics; the facts below are the venue-specific data. (Formerly the `submit-paper-agenticdev` skill;
> demoted to a reference doc so venue data doesn't proliferate the skill namespace.) **Re-verify the
> CFP each year** (`conf.researchr.org/home/ase-2026/agenticdev-2026`).

## The facts (2026 edition)

- **Venue**: Workshop on Agentic AI for Next-Generation Software Development, co-located with **ASE**
  (Automated Software Engineering), Munich, Oct 2026.
- **HotCRP**: `https://agenticdev2026.hotcrp.com/paper/new`.
- **Deadline**: **July 15, 2026, AoE** (≈ 9 AM July 16 at UTC+5). Notify Aug 21, camera-ready Aug 28.
- **Types / limits**: Full ≤10pp (mature); **Short ≤5pp** (WIP / vision / position); Demo/Tool ≤5pp.
  Up to **2 extra pages of references** on top.
- **Format**: ACM `\documentclass[sigconf,review,anonymous]{acmart}` → **double-blind**. Build:
  `pdflatex; bibtex; pdflatex; pdflatex`; add `\microtypesetup{expansion=false}` (the #1 acmart crash).
- **Archival**: accepted papers → **ASE workshop proceedings, DOI**. 🔴 **Correction 2026-08-26: the
  earlier wording "ACM DL / IEEE Xplore" is FALSE — there is no dual publication.** ASE's publisher
  **alternates by year**: ASEW '24 — ACM (`10.1145/3691621.*`, ISBN 979-8-4007-1249-4), ASE 2025
  Workshops — **IEEE** (`csdl/proceedings/asew/2025`, ISBN 979-8-3315-8503-7). The main track does the
  same: '22 ACM, '23 IEEE, '24 ACM, '25 IEEE. The `10.5555` prefix in ACM DL is a Guide catalog
  entry, NOT an ACM publication. By the alternation pattern, **ACM is expected for 2026**, which
  lines up with an APC even being charged — but ⚠️ **no verbatim statement from ASE 2026 about the
  publisher was found**. If it turns out to be IEEE, the ACM-APC question is moot entirely. Confirm
  with the chairs before paying; selected papers
  invited to a **journal special issue**. This is real authorship-criterion evidence.
- **⚠️ No supplementary-material upload field** on the HotCRP form (fields are just Title, Submission,
  Abstract, Authors, ACM corresponding, Contacts, PC conflicts). → **Host the artifact externally** (OSF
  anonymized view-only link) and `\url{}` it in the paper's Availability. See `submit-paper` §2.
- **Remote presentation**: CFP doesn't state a policy; what counts is the indexed
  publication, not attendance. Only ask organizers about remote _after_ acceptance (don't draw attention
  pre-decision under double-blind).

## 🔴 How to name the venue — what CAN and CANNOT be claimed

The question came up on 2026-08-24 and will come up every time (a post, a site, a résumé, an
application). Checked against primary sources, not a search-engine summary.

**Facts:**

- **ASE is CORE A\*** (top tier), together with ICSE and FSE it's software engineering's "big
  three."
- **AgenticDev is an ASE 2026 workshop**, officially listed on ASE's own _Co-Located Events_ page
  (`conf.researchr.org/track/ase-2026/ase-2026-workshops`). It is not a third-party conference
  that rented a room nearby, and it is not "sponsorship" — the workshop runs under ASE's umbrella.
- **Proceedings:** accepted papers go into the **ASE 2026 Workshop Proceedings** (ACM DL, DOI).
- **But it is NOT the ASE main track.** The main track has its own program, its own PC, and its
  own selectivity; the workshop is reviewed separately and more leniently.

| ✅ OK to write                                           | ❌ NOT OK                            |
| -------------------------------------------------------- | ------------------------------------ |
| "accepted at AgenticDev 2026, a workshop of ASE 2026"    | "accepted at ASE 2026"               |
| "workshop paper, ASE 2026 workshop proceedings (ACM DL)" | "published at a CORE A\* conference" |
| "ASE is CORE A\*; AgenticDev is one of its workshops"    | "my paper is CORE A\*"               |

⚠️ **Why this isn't pedantry:** a mismatch in how the narrative is framed is a recorded reason
reviewers reject any claimed credentials. A reviewer sees the "workshop vs. main track"
distinction in one minute by checking the conference program, and the cost is trust in the whole
application, not just one line. The phrasing "a workshop of ASE 2026" is not weaker — it carries
ASE's weight on its own while staying accurate.

## Attendance, registration, and proceedings — what affects what

- **Traveling to present does NOT affect the credit.** What counts is _authorship of scholarly
  articles_ — that is, **the publication**, not attendance. "Presented at a conference" isn't on
  the list of countable achievements at all.
- 🔴 **What DOES matter: whether payment becomes a condition of MAKING IT INTO proceedings.** Many
  venues require at least one author to register, or the paper gets pulled from the proceedings.
  In that case what disappears isn't the trip, it's the proof itself. That's the exact question
  put to the chairs on 2026-08-24, and it matters more than the money.
- Cost for 2026: **APC $350** (ACM went fully open-access as of 2026-01-01) + registration €350
  (early rate through 08-31). The correspondence with the chairs is broken down in the author's
  private notes (`<paper>/reviews/2026-08-24-perepiska-cheyry.md`).

## PC members (for the "PC conflicts" field) — 2026

Andrea Rosani (Free U Bozen/Bolzano) · Giuseppe Di Fatta (Free U Bozen/Bolzano) · Jean Marie Mottu
(Nantes U) · Paolo Papotti (Eurecom) · Simos Gerasimou (Cyprus U of Technology). An independent author
with no ties to any of them checks **none**. (List grows year to year — read the current PC page.)

## Topic fit (foreground these in the framing)

Trustworthiness / verification / validation of AI agents; benchmarking & empirical evaluation;
integration into developer workflows; agent-based coding/testing. A cost-aware, correctness-gated
_validation_ paper is dead-center — name those keywords in the abstract/intro.

## After acceptance — the prestige upgrade

AgenticDev is a workshop (lightest authorship tier, but it counts). Extend the accepted paper (≥30% new
material) into a higher-prestige indexed venue as a **second** publication: **MSR 2027** (deadline
~Oct 23, 2026) or **NeurIPS 2027 Evaluations & Datasets** (~May 2027). AgenticDev explicitly invites
journal extensions. Don't dual-submit the same paper — extend it.

## Provenance

"Measuring the Wrong Number" submitted here 2026-07-13 (#20, ready-for-review), 4pp short paper, OSF
anonymized artifact linked in Availability, PC-panel estimate ~85–90% accept.

## Camera-ready (2026 edition)

**The ACM mechanics are generic and live one level up: `../publishers/acm.md`** (eRights first,
the preamble, the copyright block, CCS, source files). Here — only what's specific to AgenticDev:

- **Camera-ready deadline**: **28 Aug 2026, 2 PM AoE** (≈ 7 AM on August 29 at UTC+5).
- **DOI**: `10.1145/3843282.3843715` · **ACM ISBN**: `979-8-4007-2985-0/26/10`.
- **Copyright block**: `AgenticDev '26, October 12–16, 2026, Munich, Germany`.
- **No longer double-blind.** The submission used `[sigconf,review,anonymous]`; both options come
  off for the final.
- **Same page limit**: body ≤5 pp + up to 2 pp for references only. A sixth page taken up by the
  bibliography still counts within the limit.
- **Title changes are allowed** — the portal explicitly asks for it "exactly as it should appear
  in the ACM DL." But decide before eRights (see the publisher card).

## Attendance / registration

The CFP is silent on remote participation, and **that does not mean "you don't have to show
up"**: ACM has no blanket no-show policy, IEEE does have one and allows a "qualified proxy" plus
exceptions for circumstances outside the author's control. Which one applies to the ASE workshop
**cannot be derived from public sources** — only by writing to the chairs.

- Workshop-day registration (non-member): **€350** through 08-31, €410 through 09-20, €460
  on-site. This is a **publication gate**, not a travel expense.
- If entry requires a visa, the timeline for it is real → ask the chairs right after acceptance,
  don't delay.

## 🤖 Machine-readable format profile

Read by ESLint rules over `<paper>/_build/paper.facts.json` (the facts are captured by
`extract-pdf-facts.mjs`). **The numbers live here, not in code** — this venue has its own, the
next one will have different ones. Source: the Conference Publishing author instructions
(2026-08-25) and ACM's requirements.

**The format profile is in [`agenticdev.yaml`](agenticdev.yaml)** next to this file. Data lives
there, prose lives here.
