# `venue-papers` — accepted camera-ready papers, each linted against the venue that accepted it

Run, with [`../accepted-papers/`](../accepted-papers/README.md) and
[`../arxiv-papers/`](../arxiv-papers/README.md), by `fixtures/real-papers.test.ts`: one
`paperlint lint --json` over every paper, each paper's findings per rule compared with its
`baseline.json` by [`../accepted-papers/baseline.ts`](../accepted-papers/baseline.ts) — more than
recorded fails, a recorded rule going fully quiet fails.

## What this corpus measures: precision

Each paper here was accepted, and its arXiv source is in the class the venue requires. So a venue
rule that reports something on it — `tex/template`, `format/page-limit`, `pdf/*`, `anonymity/*`,
`tex/required-section`, `tex/venue-leftover` — is **presumed a false positive until shown
otherwise**: the venue published the paper. The preprints of `arxiv-papers/` measure the other
side, recall (what paperlint finds in drafts); they carry no venue that accepted them, so they
cannot measure this.

**The findings are not yet classified.** The baselines store counts, as the other corpora do;
reading each venue-rule finding and calling it true, false or unclear is the next step.

## How the papers were chosen

2026-11-19, from the arXiv API's comment field (`co:"ASE 2026"`, `co:"CCS 2026"`, `co:AISec`,
`co:AgenticDev`, `co:"ACSAC 2026"`, `co:"FSE 2026"`, and others for later batches). A paper is kept
only when all of these hold:

- **The arXiv comment states the acceptance** («Accepted at …», «To appear in …»). It is quoted in
  the paper's README and in [`../venue-manifest.json`](../venue-manifest.json), with the abstract
  page's URL. «Extended version», «full version», posters and «to be accepted» are left out: they
  are not the camera-ready.
- **The licence on the abstract page is exactly CC BY 4.0 or CC BY-SA 4.0** (CC0 would do; none
  was found). No NC, no ND, no arXiv default licence — the rule of `arxiv-papers/`.
- **The source is in the venue's required class.** Measured on the first `\documentclass` of the
  main file. A paper re-typeset as plain `article` for arXiv is left out: judging it against the
  venue would manufacture template findings. Left out so far for this reason: 2609.30325v1 and
  2511.02435v1 (AISec, `article`), 2608.03737v1 (ACM CCS 2026, `IEEEtran`).
- **At most 300 KB of text sources**, as in `arxiv-papers/`; figures are omitted.

## The venue each paper is linted against

- **The edition preset** when paperlint ships the edition that accepted the paper: `paperlint:ccs`
  (ACM CCS 2026), `paperlint:aisec` (AISec 2026), `paperlint:agenticdev` (AgenticDev 2026),
  `paperlint:aidc` (AIDC 2026).
- **Otherwise the family** of the class the venue requires: `paperlint:fse` is FSE 2027, so an FSE
  2026 paper extends `paperlint:acm-acmsmall`; ACSAC 2026 has no preset, so `ieee-conference`;
  `paperlint:ase` is ASE 2026's Research Track, so a paper of another ASE track, or one whose
  comment names no track, extends `acm-sigconf`. Each paper's README says which and why.
- **Stage: camera-ready.** `paperlint.json` records one attempt (`cycles`) whose outcome is
  `accepted`, its evidence the paper's README. An accepted attempt is no longer judged blind, so
  `anonymity/identity` does not ask a published paper to hide its authors. The dates are those of
  the arXiv version that states the acceptance; the real decision day is earlier and not known.
- **No preset has a camera-ready kind.** The kind is the submission's (`research`, `regular`,
  `short`, …), so a page limit would be the submission's, one page short for venues that give the
  camera-ready an extra page. This test does not build, so no page limit is measured here
  (`pdf/measured` says so on every paper); a built run would have to account for it.

## What is weak about this

- **Not classified yet** (above).
- **The record is not TeX's answer**: `record-by-hand.json` is written as in `arxiv-papers/` —
  `paper.tex`, the class and style files at the root, then the `\input`/`\include` files in the
  order the source names them. Nothing was compiled.
- **An arXiv source is the author's, not the publisher's file.** Several carry acmart's `nonacm`
  option, which drops the ACM furniture the proceedings add; the class and its format option are
  the venue's.
- **The kind is a guess when the comment names no track** (each README says when).
- **Twelve papers**, of six venues. The next batches are listed in the pull request that added
  this folder.

## The papers

| paper | accepted at | linted as | class | licence | text |
| --- | --- | --- | --- | --- | ---: |
| [2607.27374v2](2607.27374v2/README.md) | ASE 2026, Industry Showcase track | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 219 KB |
| [2607.06766v2](2607.06766v2/README.md) | ASE 2026, Industry Showcase track | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 163 KB |
| [2609.10590v1](2609.10590v1/README.md) | ASE 2026 (track not named) | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 96 KB |
| [2609.03920v1](2609.03920v1/README.md) | AgenticDev 2026 (workshop at ASE 2026) | `paperlint:agenticdev` `short` | `acmart` | CC BY 4.0 | 286 KB |
| [2609.17164v1](2609.17164v1/README.md) | AISec 2026 (workshop at ACM CCS 2026) | `paperlint:aisec` `research` | `acmart` | CC BY 4.0 | 89 KB |
| [2609.16832v1](2609.16832v1/README.md) | AISec 2026 (workshop at ACM CCS 2026) | `paperlint:aisec` `benchmark` | `acmart` | CC BY 4.0 | 99 KB |
| [2609.14098v2](2609.14098v2/README.md) | ACM CCS 2026 | `paperlint:ccs` `research` | `acmart` | CC BY 4.0 | 121 KB |
| [2610.26174v1](2610.26174v1/README.md) | ACM CCS 2026 | `paperlint:ccs` `research` | `acmart` | CC BY 4.0 | 230 KB |
| [2611.10830v1](2611.10830v1/README.md) | AIDC 2026 (workshop at ACSAC 2026) | `paperlint:aidc` `regular` | `IEEEtran` | CC BY 4.0 | 191 KB |
| [2610.41369v1](2610.41369v1/README.md) | ACSAC 2026 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 112 KB |
| [2604.19400v1](2604.19400v1/README.md) | FSE 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 138 KB |
| [2605.17475v1](2605.17475v1/README.md) | FSE 2026 (track not named) | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 230 KB |

## The venue rules' findings, counted

From the baselines (the run with `RECORDED_OPT_IN` on, as for every corpus):

| rule | findings | papers |
| --- | ---: | --- |
| `tex/template` | 0 | — |
| `anonymity/identity` | 0 | — (accepted: not blind) |
| `tex/venue-leftover` | 5 | 2607.27374v2, 2609.10590v1 (each 2: «ASE», the venue that accepted them, in the ACM conference block, on the `acm-sigconf` family); 2611.10830v1 (1: «ASE» in the related work, on AIDC) |
| `tex/required-section` | 1 | 2611.10830v1: AIDC's «LLM Usage Statement» not found |
| `format/layout-override` | 1 | 2609.14098v2: `\setlength{\headheight}` |
| `pdf/last-page-balance` | 3 | AgenticDev and ACM CCS turn it on; it says the paper was not built |
| `pdf/measured` | 12 | every paper: not built, so the PDF rules did not run |

Not classified yet: these are the next step's rows.

## The false positives the preprint corpus has caught, and what pins each

A follow-up will replace the preprints of `arxiv-papers/` with accepted papers. Before they go,
every false positive or blind spot they found must be held by a unit test, so that removing them
loses no protection. What the history holds (the commits of #453 and after, the issues it opened):

| found by | what | pinned by a unit test? |
| --- | --- | --- |
| arxiv-papers (#453) | `paper/figure-ref-style` re-parsed every other file of a paper per file linted: F×(F−1) parses, 23.7 s on a paper of 25 files (a cost defect, not a false finding) | yes — `eslint-rules/paper-typography.test.mjs`, «parses each file of the paper once, not once per file linted» |
| arxiv-papers (#453) | two branches of `src/bib-rules.ts` reached only by real papers | yes — the test #453 added to `src/bib-rules.test.ts` |
| arxiv-papers (#543, open) | the sentence splitter never breaks before a lowercase start («16 GB. fp16 …»): an 82-word «sentence» in 2611.09573v1 | **no** — open issue, no test |
| arxiv-papers (#542, open) | a `%` comment's space is dropped, gluing two sentences (`four.Second`); the issue does not say which corpus found it, and `venue-papers/2611.10830v1` shows it («weight training.We compare») | **no** — open issue, no test |
| arxiv-papers (this change) | `tex/venue-leftover` reads a hand-typed reference list: «EMNLP 2023» in 2611.09709v1's `\item` list, attributed to REALM | **no** — found here, listed as a follow-up |
| arxiv-papers (this change) | `tex/venue-leftover` reports «ACSAC» as AIDC's name (AIDC's aliases include its parent conference), on 2611.08608v1, a paper accepted at ACSAC 2026 itself | **no** — found here, listed as a follow-up |
| arxiv-papers (#453) | `tex/template` fired on 100 of 108 papers because every paper extended `ieee-conference` | not a rule defect: the fixture's label. Fixed by this change's relabel |

The accepted papers of `accepted-papers/` stay; the false positives they caught (its README,
«False positives and blind spots this corpus has already caught») are each pinned already:
`\if\conference1` and the two sample counts in `src/claim-provenance.test.ts`; the `§` of
`\crefname` in `eslint-rules/paper-typography.test.mjs` and `src/rule-cases.test.ts`; the switched
`\documentclass` in `src/adapters/latex/index.test.ts` and `src/rule-cases.test.ts`; `\input`
splicing in `src/tex-paper.test.ts`; enumerators and quotations in `src/claim-provenance.test.ts`;
`\item` and run-in headings in `src/adapters/latex/index.test.ts`.

## Adding a paper

1. Find the acceptance in the arXiv comment; quote it.
2. Check the licence on the abstract page: CC BY 4.0, CC BY-SA 4.0 or CC0 only.
3. Fetch the source (`https://arxiv.org/src/<id>`), find the main file, and check its
   `\documentclass` against the class the venue's call requires. Not the venue's class — stop.
4. Keep the `.tex`, `.bib`, `.bbl`, `.cls`, `.sty`, `.bst`, `.cfg`, `.def` files of the main file's
   directory (at most 300 KB); rename the main file to `paper.tex` (its `.bbl` to `paper.bbl`).
5. Write `paperlint.json` (one accepted cycle, the edition preset or the family), `PIPELINE-STATUS.md`
   (`stages: []`), `record-by-hand.json`, the paper's `README.md`, and its entry in
   `../venue-manifest.json` (provenance, the quote, the preset). `node --experimental-strip-types
fixtures/arxiv-fetch.ts` re-downloads every manifest's sources and checks their hashes.
6. Run the test, record the counts in `baseline.json` — after `baseline.json` exists, since it is
   itself a file `paper/allowed-files-only` counts — and classify the venue-rule findings above.
