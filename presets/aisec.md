---
title: "AISec @ ACM CCS — venue card"
---

# AISec @ ACM CCS

The card of the venue preset `paperlint:aisec` ([`aisec.jsonc`](aisec.jsonc)): what the venue asks
for, in prose. The numbers a machine checks live in the preset; the section at the end is generated
from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year** ([aisec.cc](https://aisec.cc/)) — deadline, page limit
and tracks shift between editions.

## The bar

AISec is the long-running AI-security workshop of **ACM CCS**, a top security conference — not a
first-edition workshop. Mature threat modelling, honest evaluation and sound ethics are expected,
not rewarded: a security committee rejects on soundness and ethics grounds that a software
engineering workshop would wave through.

## The venue (2026 edition)

- **Venue**: ACM Workshop on Artificial Intelligence and Security (**AISec**), co-located with
  **ACM CCS** (Computer and Communications Security).
- **Deadline**: 24 July 2026 (check the AoE cutoff on the call each cycle).
- **Tracks**: full research papers; **benchmark papers** (new evaluation frameworks or datasets
  **with artifact sharing** — a track of its own); position and SoK (systematization of knowledge)
  papers. Pitch to the bar of the chosen track.
- **Format**: ACM double-column (`sigconf`). Build with `pdflatex; bibtex; pdflatex; pdflatex`; add
  `\microtypesetup{expansion=false}` (the most common acmart crash).
- **Blind model**: **double-blind** — `\documentclass[sigconf,review,anonymous]{acmart}`, author
  `Anonymous Author(s)`. See `submit-paper` §0/§4.
- **Archival**: accepted papers go into the CCS workshop proceedings in the ACM Digital Library,
  with a DOI.
- **No supplementary-material field** on the form: host the artifact externally, anonymized (a
  view-only link), and `\url{}` it in the Availability section. See `submit-paper` §2 and
  `paper-pipeline/references/anonymization.md`.

## Paper kinds and limits

Verbatim from the call: «Submitted papers must be at most 10 pages long in double-column ACM
format---excluding bibliography and well-marked appendices, for which up to two additional pages
can be used (hence, the paper's overall length must be of 12 pages at most).»

The limits are the same for every track; the preset keeps one kind per track so a paper's
`paperlint.json` says which track it was submitted under.

| kind        | body pages | pages of bibliography and appendices |
| ----------- | ---------: | -----------------------------------: |
| `research`  |         10 |                                    2 |
| `benchmark` |         10 |                                    2 |
| `position`  |         10 |                                    2 |
| `sok`       |         10 |                                    2 |

⚠️ The venue tolerates a 13th page that holds **only** the generative-AI paragraph («Too many pages:
the limit is 12 pages, found 13» is then acceptable). `format/page-limit` does not know this
exception and reports the 13th page; a person clears that case by eye.

## What else the preset encodes

- **The ACM template**, through `extends: paperlint:acm-sigconf` — AISec points to the main ACM
  CCS formatting instructions and publishes no numbers of its own ([`acm-sigconf.md`](acm-sigconf.md)).
- **Names**: `AISec` and `ACM CCS`, what `tex/venue-leftover` looks for in another venue's paper.
- **No rules of its own**: nothing says who produces the AISec proceedings or whether they require
  a balanced last page. A paper turns `pdf/last-page-balance` on in its own `paperlint.json` if the
  camera-ready instructions ask for it.

## What decides acceptance at a security venue

1. **Threat-model soundness.** Name the attacker and their capabilities (what they observe and
   control, their goal, their budget), and separate accidental failure from an adaptive adversary
   — conflating the two is the classic reject. The threat model goes up front.
2. **Ethics and responsible disclosure — a hard reject vector.**
   - Anonymize studied third parties too: aggregate statistics and use anonymized IDs for the
     entities studied, rather than naming maintainers or projects.
   - Disclose findings to affected parties **before** any de-anonymized release; the paper states
     the disclosure timeline and the release gate that holds de-anonymized data back until then.
   - The anonymized artifact must itself be leak-free — the released files, not just the PDF. A
     named entity in the artifact is invisible to a paper-only read.
3. **Dual use.** A paper that publishes an evasion or attack technique publishes its fix with it.
4. **Generative-AI disclosure.** ACM and CCS require stating how generative AI was used in the
   work (writing, code, experiments).

## Track fit

Adversarial ML, ML for security and security for ML, LLM and agent safety and security, evaluation
and benchmarking of AI-security defenses, poisoning, evasion and extraction, and rigorous
measurement of whether a claimed safety mechanism holds. A measurement paper that ships a reusable
evaluation framework and an anonymized artifact fits the benchmark track; name the track in the
abstract.

## Compose with

- `submit-paper` — the mechanics: HotCRP form, anonymous artifact hosting, "ready for review".
- `camera-ready` — de-anonymization and the release gate after acceptance.
- `pc-panel-review` — its ethics lens and artifact-runner lens (plant a leak, confirm it is caught).
- `paper-pipeline/references/artifact-checklist.md` and `paper-pipeline/references/anonymization.md`.

## Camera-ready

AISec is an ACM venue, so the final's mechanics are the ACM ones in the `submit-paper` skill's
`references/publishers/acm.md`: eRights first (it needs the final title), the preamble out of
submission mode, source files beside the PDF, CCS concepts from the 2012 CCS browser. AISec's own
DOI, ISBN, copyright line and dates are added here when the venue publishes them.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from aisec.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:aisec`** — venue preset for AISec · call for papers: <https://aisec.cc/> · extends `paperlint:acm-sigconf`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
