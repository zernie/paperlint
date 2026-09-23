---
title: "AISec @ ACM CCS — venue card (data)"
---

# AISec @ ACM CCS venue card

> **This is a venue DATA file, not a skill.** Follow the `submit-paper` skill for the end-to-end
> mechanics; the facts below are the venue-specific data. (Formerly the `submit-paper-aisec` skill;
> demoted to a reference doc so venue data doesn't proliferate the skill namespace.) **Re-verify the
> CFP each year** (`https://aisec.cc/`) — deadline, page limit, and tracks shift year to year.

## The bar (read this first)

AISec is **not** a first-edition welcoming workshop. It is the long-running AI-security workshop of
**ACM CCS — a top-4 security conference** — so calibrate to a _harder_ bar than a fresh workshop:
mature threat modeling, honest evaluation, and airtight ethics are table stakes, not bonuses. A
security PC rejects on soundness and ethics grounds that a SE workshop would wave through.

## The facts (2026 edition)

- **Venue**: ACM Workshop on Artificial Intelligence and Security (**AISec**), co-located with **ACM
  CCS** (Computer and Communications Security).
- **Deadline**: **24 July 2026** (verify the AoE cutoff, and convert it into your own zone, on the CFP each cycle).
- **Types / tracks**: **full research papers**; **benchmark papers** (new evaluation frameworks /
  datasets **with artifact sharing** — a first-class track, not an afterthought); **position / SoK**
  (systematization-of-knowledge) papers. Pick the track and pitch to _its_ bar.
- **Format**: ACM double-column (`sigconf`), up to **~10pp**. Build:
  `pdflatex; bibtex; pdflatex; pdflatex`; add `\microtypesetup{expansion=false}` (the #1 acmart crash).
- **Blind model**: **double-blind** — `\documentclass[sigconf,review,anonymous]{acmart}`, author
  `Anonymous Author(s)`. See `submit-paper` §0/§4 for de-anon hygiene.
- **Archival**: accepted papers → **CCS workshop proceedings in the ACM Digital Library** (DOI). Real
  indexed-authorship evidence, at a top-tier-security-adjacent venue.
- **⚠️ No supplementary-material upload field** on the form. → **Host the artifact externally,
  anonymized** (OSF private project + anonymized view-only link) and `\url{}` it in Availability. See
  `submit-paper` §2 and `paper-pipeline/references/anonymization.md`.

## Security-venue specifics that DECIDE acceptance (this is the whole game here)

1. **Threat-model soundness.** Name the **attacker** explicitly and their **capabilities** (what they
   observe, what they control, their goal, their budget). **Separate accidental failure from an
   adaptive adversary** — "the model gets it wrong sometimes" and "a motivated attacker steers it" are
   different papers; conflating them is the classic security-PC reject. Put the threat model up front,
   not in a footnote.
2. **Ethics / responsible disclosure — CRITICAL, a hard reject-vector.**
   - **Anonymize studied third parties too**, not just yourself. Do **not** punch down on named
     maintainers/projects — aggregate the stats and use anonymized IDs (e.g. `G01…G46`) for the
     entities you studied.
   - **Disclose findings to affected parties BEFORE any de-anonymized release.** The paper must state
     the disclosure timeline and that a **release gate** blocks publishing de-anonymized data until
     disclosure completes.
   - No supplementary slot → the anonymized artifact on **OSF** must itself be leak-clean (the released
     files, not just the PDF). A named-entity leak in the _artifact_ is invisible to a paper-only read
     and is the single highest reject-vector — see Provenance.
3. **Dual-use.** If you publish an **evasion / attack technique, publish its fix in the same paper** —
   net-defensive framing. A security PC will reject a pure attack recipe with no mitigation as
   irresponsible; the same result framed as "here is the weakness AND how to close it" is a
   contribution.
4. **GenAI-use disclosure.** ACM/CCS require disclosing how generative AI was used in producing the
   work (writing, code, experiments). Add the disclosure statement; don't omit it.

## Track fit (foreground these in the framing)

Adversarial ML, ML for security / security for ML, LLM/agent safety and security, evaluation &
benchmarking of AI-security defenses, poisoning/evasion/extraction, and **rigorous measurement of
whether a claimed safety mechanism actually holds**. A benchmark/measurement paper that ships a
reusable eval framework + an anonymized artifact is dead-center for the **benchmark track** — name
those keywords in the abstract/intro and cite the track by name.

## After acceptance — the prestige upgrade

AISec@CCS is a workshop, but co-located with a top-4 venue it is the strongest workshop tier a
dossier can hold. Extend the accepted paper (≥30% new material) into a higher-prestige indexed venue as
a **second** publication — e.g. a full security conference or a journal. Don't dual-submit the same
paper; extend it. Plan the **camera-ready de-anonymization + release gate** at acceptance (see
`camera-ready`).

## Provenance

"Safety Theater in Agentic Coding" hardened for this venue (PC-panel estimate **~87–88%** accept). Its
accept **hinged on closing an ethics reject-vector**: the released artifact had named **46 maintainers**
— a paper-only review missed it; the `pc-panel-review` artifact-runner + ethics lens caught it. Fixed
by **anonymized provenance (`G01–G46`)** plus a **release gate** blocking de-anonymized release until
disclosure completes. Lesson baked into this card: at a security venue the two things that most move
the decision — an ethics/disclosure contradiction and an anonymization leak — live in the **artifact**,
so verify the shipped files, not just the PDF.

## Compose with

- `submit-paper` (mechanics: HotCRP form, OSF hosting, "ready for review", PDF-only, profile, dossier notes).
- `camera-ready` (de-anonymization + the release gate after acceptance).
- `pc-panel-review` — run it LAST as the gate, and specifically field its **ethics lens** and
  **artifact-runner lens** (stress-test the release gate: plant a leak, confirm it's caught).
- Canonical shared detail: `paper-pipeline/references/artifact-checklist.md` (artifact build) and
  `paper-pipeline/references/anonymization.md` (de-anon deny-list + verify).

## Camera-ready

AISec is also **ACM** (a CCS workshop), so the final's mechanics are generic and live in
**`../publishers/acm.md`**: eRights is filled in FIRST and requires the final title; the preamble
is converted out of submission mode (`printacmref=false` / `setcopyright{none}` /
`pagestyle{plain}` / the `review` option — all of it removed); Source files are mandatory
alongside the PDF; CCS codes come from the 2012 CCS Browser.

What's AISec's own — its own DOI/ISBN, its own venue line in the copyright block, and its own
dates: fill those in here once they arrive (the card gets filled in from fact, not from memory).
