# `accepted` — papers a venue accepted: the calibration yardstick

Published papers, as LaTeX source. A finding on one of them is **presumed false until shown
otherwise**: the venue accepted the paper. So these are where a rule is calibrated: the thresholds
of the opt-in rules are set on them, and a rule that fires here is wrong about what a venue
accepts. The drafts that authors actually lint — recall, parser and crash stress — are in
[`../preprints/`](../preprints/README.md); [`../README.md`](../README.md) says which folder
answers which question.

The folder holds two groups, run together by `fixtures/real-papers.test.ts` and told apart below:

- **Camera-ready papers, each linted against the venue that accepted it** (12, arXiv ids as
  directory names). They measure precision on the venue's own rules.
- **The six older accepted papers** (five ACSAC papers and one AgenticDev paper, named
  `<short-name>-<venue><yy>`). They calibrate the prose and register rules, and the TeX record and
  page-count e2e tests build them. Only these six carry `tex-truth.json`; `body-size.json` and `page-count-variants.json`, the two files of
  this folder that are not papers, serve them too.

## Camera-ready papers, each linted against the venue that accepted it

Run, with the preprints of [`../preprints/`](../preprints/README.md), by `fixtures/real-papers.test.ts`: one
`paperlint lint --json` over every paper, each paper's findings per rule compared with its
`baseline.json` by [`../baseline.ts`](../baseline.ts) — more than
recorded fails, a recorded rule going fully quiet fails.

### What this corpus measures: precision

Each paper here was accepted, and its arXiv source is in the class the venue requires. So a venue
rule that reports something on it — `tex/template`, `format/page-limit`, `pdf/*`, `anonymity/*`,
`tex/required-section`, `tex/venue-leftover` — is **presumed a false positive until shown
otherwise**: the venue published the paper. The preprints of `preprints/` measure the other
side, recall (what paperlint finds in drafts); they carry no venue that accepted them, so they
cannot measure this.

**The findings are not yet classified.** The baselines store counts, as the other corpora do;
reading each venue-rule finding and calling it true, false or unclear is the next step.

### How the papers were chosen

2026-11-19, from the arXiv API's comment field (`co:"ASE 2026"`, `co:"CCS 2026"`, `co:AISec`,
`co:AgenticDev`, `co:"ACSAC 2026"`, `co:"FSE 2026"`, and others for later batches). A paper is kept
only when all of these hold:

- **The arXiv comment states the acceptance** («Accepted at …», «To appear in …»). It is quoted in
  the paper's README and in [`../../venue-manifest.json`](../../venue-manifest.json), with the abstract
  page's URL. «Extended version», «full version», posters and «to be accepted» are left out: they
  are not the camera-ready.
- **The licence on the abstract page is exactly CC BY 4.0 or CC BY-SA 4.0** (CC0 would do; none
  was found). No NC, no ND, no arXiv default licence — the rule of `preprints/`.
- **The source is in the venue's required class.** Measured on the first `\documentclass` of the
  main file. A paper re-typeset as plain `article` for arXiv is left out: judging it against the
  venue would manufacture template findings. Left out so far for this reason: 2609.30325v1 and
  2511.02435v1 (AISec, `article`), 2608.03737v1 (ACM CCS 2026, `IEEEtran`).
- **At most 300 KB of text sources**, as in `preprints/`; figures are omitted.

### The venue each paper is linted against

- **The edition preset** when paperlint ships the edition that accepted the paper:
  `paperlint:ccs-2026` (ACM CCS 2026), `paperlint:aisec-2026` (AISec 2026),
  `paperlint:agenticdev-2026` (AgenticDev 2026), `paperlint:aidc-2026` (AIDC 2026),
  `paperlint:acsac-2026` (ACSAC 2026, a minimal preset: names and the IEEE family, no kinds, no page
  limit).
- **Otherwise the family** of the class the venue requires: the FSE preset that ships is
  `paperlint:fse-2027`, and there is no `fse-2026`, so an FSE 2026 paper extends
  `paperlint:acm-acmsmall`; `paperlint:ase-2026` is ASE 2026's Research Track, so a paper of another
  ASE track, or one whose comment names no track, extends `acm-sigconf`. Each paper's README says
  which and why.
- **Stage: camera-ready.** `paperlint.json` records one attempt (`cycles`) whose outcome is
  `accepted`, its evidence the paper's README. An accepted attempt is no longer judged blind, so
  `anonymity/identity` does not ask a published paper to hide its authors. The dates are those of
  the arXiv version that states the acceptance; the real decision day is earlier and not known.
- **No preset has a camera-ready kind.** The kind is the submission's (`research`, `regular`,
  `short`, …), so a page limit would be the submission's, one page short for venues that give the
  camera-ready an extra page. This test does not build, so no page limit is measured here
  (`pdf/measured` says so on every paper); a built run would have to account for it.

### What is weak about this

- **Not classified yet** (above).
- **The record is not TeX's answer**: `record-by-hand.json` is written as in `preprints/` —
  `paper.tex`, the class and style files at the root, then the `\input`/`\include` files in the
  order the source names them. Nothing was compiled.
- **An arXiv source is the author's, not the publisher's file.** Several carry acmart's `nonacm`
  option, which drops the ACM furniture the proceedings add; the class and its format option are
  the venue's.
- **The kind is a guess when the comment names no track** (each README says when).
- **Twelve papers**, of six venues. The next batches are listed in the pull request that added
  this folder.

### The papers

| paper | accepted at | linted as | class | licence | text |
| --- | --- | --- | --- | --- | ---: |
| [2607.27374v2](2607.27374v2/README.md) | ASE 2026, Industry Showcase track | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 219 KB |
| [2607.06766v2](2607.06766v2/README.md) | ASE 2026, Industry Showcase track | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 163 KB |
| [2609.10590v1](2609.10590v1/README.md) | ASE 2026 (track not named) | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 96 KB |
| [2609.03920v1](2609.03920v1/README.md) | AgenticDev 2026 (workshop at ASE 2026) | `paperlint:agenticdev-2026` `short` | `acmart` | CC BY 4.0 | 286 KB |
| [2609.17164v1](2609.17164v1/README.md) | AISec 2026 (workshop at ACM CCS 2026) | `paperlint:aisec-2026` `research` | `acmart` | CC BY 4.0 | 89 KB |
| [2609.16832v1](2609.16832v1/README.md) | AISec 2026 (workshop at ACM CCS 2026) | `paperlint:aisec-2026` `benchmark` | `acmart` | CC BY 4.0 | 99 KB |
| [2609.14098v2](2609.14098v2/README.md) | ACM CCS 2026 | `paperlint:ccs-2026` `research` | `acmart` | CC BY 4.0 | 121 KB |
| [2610.26174v1](2610.26174v1/README.md) | ACM CCS 2026 | `paperlint:ccs-2026` `research` | `acmart` | CC BY 4.0 | 230 KB |
| [2611.10830v1](2611.10830v1/README.md) | AIDC 2026 (workshop at ACSAC 2026) | `paperlint:aidc-2026` `regular` | `IEEEtran` | CC BY 4.0 | 191 KB |
| [2610.41369v1](2610.41369v1/README.md) | ACSAC 2026 | `paperlint:acsac-2026` | `IEEEtran` | CC BY 4.0 | 112 KB |
| [2604.19400v1](2604.19400v1/README.md) | FSE 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 138 KB |
| [2605.17475v1](2605.17475v1/README.md) | FSE 2026 (track not named) | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 230 KB |

### The venue rules' findings, counted

From the baselines (the run with `RECORDED_OPT_IN` on, as for every corpus):

| rule | findings | papers |
| --- | ---: | --- |
| `tex/template` | 0 | — |
| `anonymity/identity` | 0 | — (accepted: not blind) |
| `tex/venue-leftover` | 6 | 2607.27374v2, 2609.10590v1 (each 2: «ASE», the venue that accepted them, in the ACM conference block, on the `acm-sigconf` family); 2611.10830v1 (1: «ASE» in the related work, on AIDC); 2609.14098v2 (1: «NeurIPS 2025» in the related work, see below) |
| `tex/required-section` | 1 | 2611.10830v1: AIDC's «LLM Usage Statement» not found |
| `format/layout-override` | 1 | 2609.14098v2: `\setlength{\headheight}` |
| `pdf/last-page-balance` | 3 | AgenticDev and ACM CCS turn it on; it says the paper was not built |
| `pdf/measured` | 12 | every paper: not built, so the PDF rules did not run |
| `paper/edition-over` | 1 | 2611.10830v1: «AIDC 2026 is over», its last deadline (camera-ready, 2026-11-09) passed; the rule does not look at the accepted cycle. The rule reads the clock, so `real-papers.test.ts` lints on a fixed day (2026-11-19): on the real clock `sp-2027` would add one to `preprints/2611.07576v1` on 2027-04-09 (measured with the clock set to 2027-05-01) |

Not classified yet: these are the next step's rows.

After the edition rename (#546, `<series>-<year>` ids), measured 2026-11-19 by the same run: every
label above moved to its edition id (`ccs` → `ccs-2026`, `aisec` → `aisec-2026`, `agenticdev` →
`agenticdev-2026`, `aidc` → `aidc-2026`), and 2610.41369v1 moved from the `ieee-conference` family
to the new minimal `acsac-2026`. One count moved: `paper/edition-over`, a rule #546 added, 0 → 1 on
2611.10830v1. 2610.41369v1 says the same on `acsac-2026` as it did on the family. The five
`tex/venue-leftover` findings are unchanged: «ASE» in the `\acmConference` and `\acmBooktitle` lines
of 2607.27374v2 and 2609.10590v1 is a venue-stating command, which counts at any year, and the
family has no edition of its own; 2611.10830v1's «A separate ASE 2026 study» is related work whose year
is inside the rule's window (no older than 2026 minus one).

With the NeurIPS, ICML and AAAI presets (#541), measured 2026-11-19 by the same run, one count
moved: `tex/venue-leftover` 0 → 1 on 2609.14098v2, an ACM CCS 2026 paper whose related work cites
«Lam et al. (CodeCrash, NeurIPS 2025)». It is a citation, not a leftover: the case of 2611.10830v1's
«ASE 2026 study» above, a year inside the rule's window (no older than 2026 minus one), now with a
name that ships. `tex/template`'s style check found nothing on the 12 papers (none is on a style
family).

### The false positives the preprint corpus has caught, and what pins each

A follow-up will replace the preprints of `preprints/` with accepted papers. Before they go,
every false positive or blind spot they found must be held by a unit test, so that removing them
loses no protection. What the history holds (the commits of #453 and after, the issues it opened):

| found by | what | pinned by a unit test? |
| --- | --- | --- |
| preprints (#453) | `paper/figure-ref-style` re-parsed every other file of a paper per file linted: F×(F−1) parses, 23.7 s on a paper of 25 files (a cost defect, not a false finding) | yes — `eslint-rules/paper-typography.test.mjs`, «parses each file of the paper once, not once per file linted» |
| preprints (#453) | two branches of `src/bib-rules.ts` reached only by real papers | yes — the test #453 added to `src/bib-rules.test.ts` |
| preprints (#543, open) | the sentence splitter never breaks before a lowercase start («16 GB. fp16 …»): an 82-word «sentence» in 2611.09573v1 | **no** — open issue, no test |
| preprints (#542, open) | a `%` comment's space is dropped, gluing two sentences (`four.Second`); the issue does not say which corpus found it, and `accepted/2611.10830v1` shows it («weight training.We compare») | **no** — open issue, no test |
| preprints (this change) | `tex/venue-leftover` reads a hand-typed reference list: «EMNLP 2023» in 2611.09709v1's `\item` list, attributed to REALM | **no** — found here, listed as a follow-up. Still reproduces after #546 (measured 2026-11-19): on `ieee-conference` «EMNLP 2023» and «EMNLP 2025» are reported as EMNLP's names, on `realm-2026` «EMNLP 2025» (its parent's previous edition) |
| preprints (this change) | `tex/venue-leftover` reports «ACSAC» as AIDC's name (AIDC's aliases include its parent conference), on 2611.08608v1, a paper accepted at ACSAC 2026 itself | fixed by #546: ACSAC and EMNLP are presets of their own, named as `parent`; `src/tex-venue-rules.test.ts` («tex/venue-leftover — a workshop's parent conference (`parent`) is the paper's own») pins it. What is left is the next row's case: on the IEEE family the paper still gets «ACSAC» once, as ACSAC 2026; on `acsac-2026`, its label now, none |
| accepted (this change) | a paper on a family preset that names its own venue: «ASE» in the `\acmConference` and `\acmBooktitle` lines of 2607.27374v2 and 2609.10590v1, accepted at ASE 2026 and linted on `acm-sigconf` | **no** — still reproduces after #546 (2 findings each), listed as a follow-up |
| accepted (this change) | `paper/edition-over` reports an edition as over on a paper whose cycle was accepted at it (2611.10830v1, AIDC 2026) | **no** — found here, a candidate for the classification step |
| preprints (#453) | `tex/template` fired on 100 of 108 papers because every paper extended `ieee-conference` | not a rule defect: the fixture's label. Fixed by this change's relabel |

The six older accepted papers (the section below) stay; the false positives they caught
(«False positives and blind spots this corpus has already caught», below) are each pinned already:
`\if\conference1` and the two sample counts in `src/claim-provenance.test.ts`; the `§` of
`\crefname` in `eslint-rules/paper-typography.test.mjs` and `src/rule-cases.test.ts`; the switched
`\documentclass` in `src/adapters/latex/index.test.ts` and `src/rule-cases.test.ts`; `\input`
splicing in `src/tex-paper.test.ts`; enumerators and quotations in `src/claim-provenance.test.ts`;
`\item` and run-in headings in `src/adapters/latex/index.test.ts`.

### Adding a camera-ready paper

1. Find the acceptance in the arXiv comment; quote it.
2. Check the licence on the abstract page: CC BY 4.0, CC BY-SA 4.0 or CC0 only.
3. Fetch the source (`https://arxiv.org/src/<id>`), find the main file, and check its
   `\documentclass` against the class the venue's call requires. Not the venue's class — stop.
4. Keep the `.tex`, `.bib`, `.bbl`, `.cls`, `.sty`, `.bst`, `.cfg`, `.def` files of the main file's
   directory (at most 300 KB); rename the main file to `paper.tex` (its `.bbl` to `paper.bbl`).
5. Write `paperlint.json` (one accepted cycle, the edition preset or the family), `PIPELINE-STATUS.md`
   (`stages: []`), `record-by-hand.json`, the paper's `README.md`, and its entry in
   `../../venue-manifest.json` (provenance, the quote, the preset). `node --experimental-strip-types
fixtures/arxiv-fetch.ts` re-downloads every manifest's sources and checks their hashes.
6. Run the test, record the counts in `baseline.json` — after `baseline.json` exists, since it is
   itself a file `paper/allowed-files-only` counts — and classify the venue-rule findings above.


## The six older accepted papers — every rule, measured on papers that were accepted

Every other fixture was written by us, to make one rule fire or stay quiet. A rule can pass all of
them and still report text that an accepted paper also contains — and a rule that fires on accepted
papers is wrong about what a venue accepts. That happened: a frame-marker density floor calibrated on
papers of our own, at 1.5 markers per 1,000 words, would have fired on three of five accepted ACSAC
papers, which measure 0.76–3.1. It was found by hand, afterwards.

This corpus is the test that finds it first. Each directory is one accepted paper, as LaTeX source —
not a PDF: the source carries the class and its options, the section tree, `\cite` and `\ref`, and
the preamble, which is what the rules read.

| paper | venue | licence | class |
| --- | --- | --- | --- |
| [`llm-splained-acsac25/`](llm-splained-acsac25/README.md) | ACSAC 2025 | CC BY-SA 4.0 | `[conference,compsoc]{IEEEtran}`, behind a `\conference` switch |
| [`secure-acsac24/`](secure-acsac24/README.md) | ACSAC 2024 | CC BY 4.0 | `[conference]{IEEEtran}` |
| [`barovox-acsac24/`](barovox-acsac24/README.md) | ACSAC 2024 | CC BY 4.0 | `[conference,compsoc]{IEEEtran}` |
| [`rr-dataset-quality-acsac24/`](rr-dataset-quality-acsac24/README.md) | ACSAC 2024 | CC BY 4.0 | `[conference,compsoc]{IEEEtran}` |
| [`leaking-queries-acsac25/`](leaking-queries-acsac25/README.md) | ACSAC 2025 | CC BY 4.0 | `[conference,compsoc]{IEEEtran}` |
| [`agenticdev-acm26/`](agenticdev-acm26/README.md) | AgenticDev '26 (ASE 2026) | CC BY 4.0 | `[sigconf,screen]{acmart}` |

### The test

`../../real-papers.test.ts` copies every paper under `papers/` in one temporary project, runs
`paperlint lint --json` through the CLI's own `run`, and compares the findings per rule with the
paper's `baseline.json`, using the reader in [`baseline.ts`](../baseline.ts):

- a rule that reports **more** than recorded fails — a false positive until shown otherwise;
- a recorded rule that goes **fully quiet** fails — that is how a check dies unnoticed;
- a partial drop passes — that is what a fix looks like; lower the recording in the same change.

Lint reads the files of a paper from the record of its last build (`_build/sources.json`,
docs/design/paper-sources.md §1), so each paper carries one, laid beside it as `tex-truth.json` —
the record `paperlint build` wrote for it, snapshotted by `test/e2e/tex/accepted-papers-record.e2e.ts`
(`vitest -u` on a machine with TeX re-records). The test lays it at `_build/sources.json` in its copy;
the register tests read it through `test/recorded-fixture.ts`. Its hashes are over the paper's bytes,
so a paper edited without re-recording is a stale record, which lint treats as `paper.tex` alone.

🔴 **`llm-splained-acsac25` has `record-by-hand.json`, not `tex-truth.json`.** It does not compile in
paperlint's TeX tree (`subfig`, `svg`, `cleveref`, `listings` and others are in no preset), and a
record is of a build that compiled. Its file lists what the old static reading found from the
`\input`s of `paper.tex`, in order — a list written by that reading, not TeX's answer, so what is
measured on this paper is measured on a belief about TeX. The e2e requires the paper to still fail to
compile, so the exception ends when the reason does.

A new rule is measured here the day it is registered. The corpus is excluded from the npm tarball
(`!fixtures/real-papers/accepted` in `package.json`).

### What the rules say about the corpus

Every recorded finding, classified. **real** — the paper does what the rule reports, and the rule is
right to say so. **known** — a false positive, or a statement about the fixture rather than the
paper, left for a later change; one line each. **sampled** — recorded when the paper joined the
corpus for its page count (below); five messages were looked at, the sentences were not read, and
the count is not yet classified.

| paper | rule | n | kind | why |
| --- | --- | ---: | --- | --- |
| all six | `pdf/measured` | 1 | known | the lint test reads the source and never builds, so the PDF rules cannot run; the rule says so, correctly |
| agenticdev-acm26 | `tex/claim-provenance` | 9 | real | numbers stated with no owner in the sentence ("The first is that the tool cuts output tokens by 65%.") — the paper reviewers called too informal |
| secure-acsac24 | `tex/claim-provenance` | 6 | real | the authors' own results stated without a subject or a pointer ("LLMs experience a significant decrease in accuracy, with a 5.44% drop …"); the owner is in a neighbouring sentence, which the rule does not read |
| secure-acsac24 | `tex/claim-provenance` | 1 | known | a range that defines a scale, not a result ("Typically set between 0 and 1, the temperature …") |
| agenticdev-acm26 | `tex/heading-case` | 18 | real | 18 words in 6 of the paper's 9 headings (`Related work`, `The advertised savings don't show up`, `Method: a cost-aware, correctness-gated harness` …) are in sentence case, which the proceedings vendor's checklist does not accept. Every one is a true positive and the rule's fix writes the corrected heading. Its `\title` and short title, read by the rule since 2026-10-04, are in headline style and add none |
| agenticdev-acm26 | `tex/register` | 1 | real | 7 sentences open with _And_, _So_, _But_ or _Nor_ — 1.60 per 1000 words against a limit of 0.8; the papers written by others read 0 to 0.37 |
| llm-splained-acsac25 | `paper/leading-zero` | 2 | real | probabilities written without the zero ("with probability greater than $.58$", and `.73`) in `sections/5-discussion.tex`; IEEE style, which the rule follows, asks for `0.58` — APA would omit it for a probability |
| llm-splained-acsac25 | `tex/claim-provenance` | 11 | real | the authors' own results in `sections/*.tex` stated without a subject or a pointer ("GPT errors exceeded 30% in both categories …"); the owner is in a neighbouring sentence. One ("ranged from 1 to 13") is in a list item, which the rules did not read before; one is in the reviews' disabled branch (below) |
| secure-acsac24 | `format/layout-override` | 2 | real | the source loads `geometry` and sets `\geometry{a4paper, margin=1in}` over IEEEtran's letter layout. It is the arXiv source, not the paper as submitted to ACSAC, and the rule is right to flag it |
| barovox-acsac24 | `tex/claim-provenance` | 28 | sampled | percentages in the evaluation and discussion («81.38%», «90.51%» in `Chapters/08_Discussion.tex`) |
| rr-dataset-quality-acsac24 | `tex/claim-provenance` | 16 | sampled | percentages in the results («31.3%», «17%» in `Result.tex`) and one in the related work («60%»); «beam size 5» in `Result.tex` stands alone since a `%` comment line no longer glues it to the next sentence, which cites |
| leaking-queries-acsac25 | `tex/claim-provenance` | 25 | sampled | percentages in the experiments and the appendix («86%», «90%», «72%») |
| leaking-queries-acsac25 | `paper/section-word` | 1 | real | `\S\ref{subsec:results}` in `sections_full_version/discussion.tex`, where IEEE style writes «Section» |
| agenticdev-acm26, barovox-acsac24, rr-dataset-quality-acsac24, secure-acsac24 | `paper/refs-checked` | 1 | known | the record (`tex-truth.json`) names the databases bibtex opened, and no `_build/references.json` says they were checked: the lint test never runs the build's online check |
| barovox-acsac24 | `bib/reachable-entry` | 92 | real / known | entries with no doi, url, arXiv id or `\url`: 55 are cited in the committed `paper.bbl` (real — the reader has nothing to follow), 37 are not cited (known: the rule judges every entry of the database, and bibtex prints only cited ones) |
| rr-dataset-quality-acsac24 | `bib/reachable-entry` | 11 | real | all 11 are cited in `paper.bbl` (`chen2022neural`, `fu2022vulrepair`, …) |
| secure-acsac24 | `bib/reachable-entry` | 77 | real / known | 18 cited (real); 59 uncited — the paper's `references.bib` carries ACM's sample entries (`Kosiur01`, `JCohen96`), which it never cites (known, as above) |
| all six | `paper/allowed-files-only` | 2–3 | known | the fixture's own files at the paper root — `baseline.json`, and `tex-truth.json`, `page-count.json` or `record-by-hand.json` — are statements about the fixture, not part of the paper |
| barovox-acsac24 | `paper/allowed-files-only` | 3 | real | arXiv-source layout, not paperlint's: `Chapters/` (the body; paperlint's is `sections/`), `newPDF/` and `newestPDF/` (figures; paperlint's is `figures/`) |
| leaking-queries-acsac25 | `paper/allowed-files-only` | 3 | real | `Figures/` (paperlint's is `figures/`, names compared exactly), `sections_full_version/` (the body), `listings.cfg` at the root |
| llm-splained-acsac25 | `paper/allowed-files-only` | 1 | real | `bibs/`: the paper's databases in a folder of their own; paperlint keeps a `.bib` at the root, where bibtex looks |
| rr-dataset-quality-acsac24 | `paper/allowed-files-only` | 1 | real | `beam_size.png` at the root (paperlint's figures go in `figures/`) |
| secure-acsac24 | `paper/allowed-files-only` | 2 | real | `chat.png` and `md-frame-0.mdf` (mdframed's output) at the root |
| all six | `repro/allowed-files-only` | 0 | — | no paper in the corpus ships a `repro/` (arXiv sources carry none), so there is nothing to judge and nothing is recorded; the rule's both halves are held by its own fixtures (`src/repro-layout-rule.test.ts`, `src/rule-cases.test.ts`) |
| llm-splained-acsac25 | `paper/refs-checked`, `bib/reachable-entry` | 0 | known | the paper uses biblatex with biber, so bibtex never runs and the record lists no database: neither rule has one to judge. Measured on 2026-09-29, when `bib/reachable-entry` read the `.bib` files the paper declares: 55 entries with no doi, url, arXiv id or `\url` — a count nobody re-measures while the paper does not build |

One limit the corpus shows and no count records:

- **A disabled conditional branch is read as text.** `llm-splained-acsac25` keeps its reviews inside
  `\if\showreview1 … \fi` with the switch off; the prose rules read them.

False positives and blind spots this corpus has already caught, each fixed with a test first:
`tex/claim-provenance` read the digit in `\if\conference1` as a number in prose, and did not
recognise "466 Boolean questions" or "900 systematically collected questions" as a sample;
`paper/section-word` reported the `§` of `\crefname{section}{§}{§§}`, a label definition, not prose;
`tex/template` judged the first of three `\documentclass` lines behind the `\conference` switch;
the parse-tree rules did not follow `\input`, so this paper's body in `sections/*.tex` went unread;
`tex/claim-provenance` read an inline list's enumerators ("are: 1. …, 2. …") and a number inside a
quoted example as claims; the body's prose dropped every `\item` whole (the parser hands an item
its text as an argument), and read run-in headings (`\textbf{Threats.}`) as sentences.

### Where the body ends — the papers that are also built

`format/page-limit` counts a body that ends at the references or the appendix, whichever comes
first (AIDC's `body_ends_at`). ACSAC is AIDC's parent venue, with the same IEEEtran template, so
the ACSAC papers here are the real test of that count. Four of them carry a `page-count.json`:
where the body ends, established by rendering the built PDF and looking at the page, with the
evidence in words. `test/e2e/tex/page-count.e2e.ts` builds them on a real pdflatex and requires the
detector to agree; `page-count-variants.json` derives seven more, each changing one thing.

| paper | evidence (rendered page) | ends at | body | detector | before this count |
| --- | --- | --- | ---: | ---: | ---: |
| barovox-acsac24 | p. 13: conclusion and acknowledgment, then «References» mid-column | references, p. 13 | 13 | 13 | 12 ✗ |
| leaking-queries-acsac25 | p. 13: Table 6, body in both columns, «References» in the right one | references, p. 13 | 13 | 13 | 12 ✗ |
| rr-dataset-quality-acsac24 | p. 12 opens with «Appendix A.»; the references open p. 15 | appendix, p. 12 | 11 | 11 | 14 ✗ |
| secure-acsac24 | p. 13 opens with «REFERENCES», nothing above it | references, p. 13 | 12 | 12 | 12 |
| *variants* | | | | | |
| barovox-references-at-top | `\clearpage` before the bibliography: p. 14 opens with «References» | references, p. 14 | 13 | 13 | 13 |
| barovox-subsection-references | `\subsection*{References}` on p. 2 | references, p. 13 | 13 | 13 | 1 ✗ |
| barovox-table-references-header | a table headed «References» on p. 2 | references, p. 13 | 13 | 13 | 1 ✗ |
| barovox-appendix-before-references | «Appendix A.» below the acknowledgment on p. 13 | appendix, p. 13 | 13 | 13 | 14 ✗ |
| leaking-no-hyperref | no anchors: the heading alone | references, p. 13 | 13 | 13 | 12 ✗ |
| leaking-no-hyperref-subsection-references | no anchors, and `\subsection*{References}` on p. 2 | references, p. 13 | 13 | 13 | 1 ✗ |
| rr-appendix-after-references | the appendix moved after the bibliography | references, p. 11 | 11 | 11 | 10 ✗ |

*Before this count* is the one `format/page-limit` shipped with first: the pages before the first
line reading «References», anywhere. It undercounted every body that runs onto the references page,
took a table header or an unnumbered subsection for the bibliography, and counted an appendix
before the bibliography as body.

`llm-splained-acsac25` is not built: its e-print ships a `biblatex` `.bbl` in format 3.2, which the
TeX Live 2026 `biblatex` refuses (it expects 3.3), and regenerating it needs `biber`, which
paperlint's toolchain does not install. `agenticdev-acm26` is an ACM paper, outside AIDC's template.

### What size the text is set in — `body-size.json`

`pdf/body-size` compares the body and reference font sizes banal measures with the preset's. The
same build also builds `agenticdev-acm26`, and `body-size.json` records, for the four ACSAC papers
and it, the size the source declares, the size pdf.js reads off the rendered glyphs (independently
of banal and of the rule), and what banal measured. None may draw a finding. Three variants change
one size each and must draw exactly the recorded finding.

| paper | declared | rendered (pdf.js) body / refs | banal | finding |
| --- | --- | --- | --- | --- |
| barovox-acsac24 · leaking-queries-acsac25 · rr-dataset-quality-acsac24 | 10 pt / 8 pt | 10.00 / 8.00 | 10.3 / 8.3 | none |
| secure-acsac24 (no compsoc: sizes in bp) | 10 pt / 8 pt | 9.96 / 7.97 | 10.3 / 8.3 | none |
| agenticdev-acm26 | 9 pt / 7 pt | 8.97 / 6.97 | 9.3 / 7.3 | none |
| *variants* | | | | |
| barovox-body-9pt | `\documentclass[9pt,…]` | 9.00 / 8.00 | 9.3 / 8.3 | `body` |
| rr-references-scriptsize | bibliography in `\scriptsize` | 10.00 / 7.00 | 10.3 / 7.3 | `refPt` |
| secure-references-small | bibliography in `\small` | 9.96 / 8.97 | 10.3 / 9.3 | `refPt` |

banal reads 0.3 pt above the rendered size on both templates; `body_pt_tol` of 0.5 absorbs it.

### The register band — AIDC's anchors are the ACSAC papers here

`tex/contrast-frames`, `tex/claim-emphasis` and `tex/relation-markers` judge a body against the band
its venue preset's anchors set. The five ACSAC papers are `paperlint:aidc-2026`'s anchors (AIDC is ACSAC's
workshop, on its template, with no accepted papers of its own yet); the preset records each one's
words and counts, and `src/register-bands.test.ts` re-measures them from these sources and requires
the same numbers. The papers here extend `paperlint:ieee-conference`, which records no anchors, so
`real-papers.test.ts` sees none of the three rules; the same test file judges every ACSAC paper
against AIDC's band instead, and all five stand inside it on all three measures. Per 10,000 words:

| paper | words | contrast frames | claims in bold | relation markers |
| --- | ---: | ---: | ---: | ---: |
| barovox-acsac24 | 7670 | 1.3 | 10.4 | 40.4 |
| leaking-queries-acsac25 | 9133 | 5.5 | 0.0 | 112.8 |
| llm-splained-acsac25 | 9529 | 4.2 | 1.0 | 88.2 |
| rr-dataset-quality-acsac24 | 8130 | 3.7 | 0.0 | 39.4 |
| secure-acsac24 | 7519 | 4.0 | 0.0 | 50.5 |
| *AIDC's band* | | 0–10.4 | 0–17.8 | 25.4–135.0 |
| agenticdev-acm26 (ACM, not an anchor) | 4374 | 50.3 | 18.3 | 29.7 |

Three variants in the same test change one thing in a real source and leave the band on that measure
only: `secure-acsac24` with _, not the prompt_ after 20 mentions of _the model_ (contrast frames
above); `llm-splained-acsac25` with its first 20 percentages in `\textbf` (claims in bold above);
`rr-dataset-quality-acsac24` with its relation-naming adverbials dropped and _because_ read as _as_
(relation markers below).

### Licence rule — read before adding a paper (both parts)

Only papers under **CC BY, CC BY-SA or CC0** may be added. The licence is the one the arXiv abstract
page states (or the publisher's rights form, for a paper whose author is ours). The arXiv default
licence ("non-exclusive licence to distribute") does **not** allow redistribution, and anonymising a
paper does not change that: copyright covers the wording, and removing the author names leaves the
wording. A rewrite keeping only the structure would drop the prose the rules are meant to be
tested on. Grow the corpus by finding more CC-licensed papers.

### Adding an older accepted paper

1. Check the licence on the arXiv abstract page. Not CC BY / CC BY-SA / CC0 — stop.
2. Fetch the source: `curl -L https://arxiv.org/e-print/<id>` (a gzipped tar).
3. Make a directory `<short-name>-<venue><yy>/`. Keep the `.tex`, `.bib`, `.bbl`, `.cls` and `.sty`
   files the source uses; drop figures and PDFs. Rename the entry file to `paper.tex` (and its
   `.bbl` to `paper.bbl`), changing nothing inside.
4. Add the scaffolding: `PIPELINE-STATUS.md` with `stages: []`, and a `paperlint.json` whose
   `extends` names the template family (`paperlint:ieee-conference`) or the venue preset.
5. Write its `README.md`: title, authors, source URL, venue, licence with its link, what was renamed
   and what was dropped, which files are ours.
6. Run the test, record the counts in `baseline.json`, and add a row per rule to the table above.

