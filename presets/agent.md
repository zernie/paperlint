---
title: "AGENT @ ICSE — venue card"
---

# AGENT @ ICSE

The card of the venue preset `paperlint:agent` ([`agent.jsonc`](agent.jsonc)): what the venue asks
for, in prose. The numbers a machine checks live in the preset; the section at the end is generated
from it. The `submit-paper` skill reads this card for the venue's specifics.

**Re-verify the call for papers every year**
([conf.researchr.org/home/icse-2027/agent-2027](https://conf.researchr.org/home/icse-2027/agent-2027)).
Sources read 2026-10-26: that page, the portal's
[deadlines page](https://icse2027-agent.hotcrp.com/deadlines), and the
[ICSE 2027 workshops page](https://conf.researchr.org/track/icse-2027/icse-2027-workshops).

## The venue (2027 edition)

- **Venue**: The Second International Workshop on Agentic Engineering, an ICSE 2027 workshop,
  Mon 26 April 2027, Dublin.
- **Portal**: HotCRP, `https://icse2027-agent.hotcrp.com/` (the page's «Submission link»).
- **Format**: «formatted according to the IEEE conference proceedings template». No class line is
  given for papers, so the preset keeps the family's `\documentclass[conference]{IEEEtran}`.
- **Review**: «Submissions will be reviewed single-anonymously.» The authors' names stay on the
  paper; the portal's status data carries no `"blind":true`, which agrees.
- **Publisher**: «Accepted workshop papers will be published by IEEE.» The page does not say
  «archival» or offer a non-archival choice.
- **Deadlines (AoE)**: submission 13 Nov 2026, notification 11 Dec 2026, camera-ready 29 Jan 2027.
  The portal reads `"sub":1794657599`, 2026-11-14T11:59:59Z, the end of 13 Nov AoE: the two agree.

## Paper kinds and limits

| kind    | pages | what it is (the call's words)                                                                                      |
| ------- | ----: | ------------------------------------------------------------------------------------------------------------------ |
| `full`  |     8 | «Full papers (research or experience): up to 8 pages, including references.»                                       |
| `short` |     5 | «Short papers (position, emerging research, tool, benchmark, or experience): up to 5 pages, including references.» |

🔴 **The limit is a total, references included**, and «It is not possible to pay for extra pages.»
`format/page-limit` can only compare banal's body count with the number, so a paper whose body
fills the pages and whose references stand alone on one more page passes the rule and is over the
limit. Count the PDF's pages yourself before submitting.

## What else the preset encodes

- **The IEEE template**, through `extends: paperlint:ieee-conference` ([`ieee-conference.md`](ieee-conference.md)).
- **The venue's name** is `AGENT 2027`, with the aliases `AGENT'27` and `AGENT’27` (what
  `tex/venue-leftover` looks for in another venue's paper). «AGENT» alone is an ordinary word, and
  as a name it would flag every paper folder called `agent-…` (`paper/folder-venue-leftover`).
- **Portal and deadlines** (`portal`, `deadlines`): the submission reading is the portal's and is
  refreshed by paperlint's scheduled workflow; notification and camera-ready are the call's.

## Not verified

- **Remote presentation**: neither the workshop page, the ICSE workshops page nor the ICSE 2027
  site's «Attending» menu states a policy. Ask the chairs before relying on one.
- **AI / LLM usage policy and required sections**: none stated on the workshop page.
- **The proceedings' class line**: see Format above; the page links the IEEE templates page only.

## What the preset resolves to

<!-- paperlint:preset-rules -->
<!-- prettier-ignore-start -->
<!-- Generated from agent.jsonc by `npx eslint --fix` (rule preset/card-rules). Edit the preset, not this section. -->

**`paperlint:agent`** — venue preset for AGENT 2027 · call for papers: <https://conf.researchr.org/home/icse-2027/agent-2027> · extends `paperlint:ieee-conference`

No preset of this chain sets a rule: under it, every rule keeps paperlint's default.

<!-- prettier-ignore-end -->
<!-- /paperlint:preset-rules -->
