# `accepted` — papers a venue accepted: the calibration yardstick

Published papers, as LaTeX source. A finding on one of them is **presumed false until shown
otherwise**: the venue accepted the paper. So these are where a rule is calibrated: the thresholds
of the opt-in rules are set on them, and a rule that fires here is wrong about what a venue
accepts. The drafts that authors actually lint — recall, parser and crash stress — are in
[`../preprints/`](../preprints/README.md); [`../README.md`](../README.md) says which folder
answers which question.

The folder holds two groups, run together by `fixtures/real-papers.test.ts` and told apart below:

- **Camera-ready papers, each linted against the venue that accepted it** (159, arXiv ids as
  directory names: 12 chosen on 2026-11-19, 79 sampled by a script on 2026-11-20, 68 more on
  2026-11-27). They measure
  precision on the venue's own rules. [`sampling/`](sampling/) holds the record of the sample:
  the script, its queries and quotas, and every candidate it looked at.
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

#### The second batch (2026-11-20): 80 papers, sampled by a script; one removed on 2026-11-27

Chosen by [`sampling/sample.mjs`](sampling/sample.mjs) from the venue editions and queries of
[`sampling/queries.json`](sampling/queries.json), with the field quotas fixed there before the run:
ml 18, nlp 12, ai 8, security 10, se 8, hci 8, systems 10, other 6. Two sources of candidates:

- **The arXiv comment search** (`co:"<venue> <year>"`, the API's search-result order) for ml, nlp,
  ai, security, se and hci, and for 7 systems papers (OSDI 2025 ×2, POPL 2025, SIGMOD 2026 ×2,
  OOPSLA 2026, NSDI 2026) and 1 other paper (CVPR 2025) kept before those fields switched source.
  Acceptance is the comment's wording, judged by the script's regexes (`judgeComment`). Manifest
  entries say `source: "arxiv-comment"`, `acceptance: "arxiv-comment"`.
- **The Semantic Scholar venue listing** (its bulk search by venue and year; the entries with an
  arXiv id, in arXiv-id order) for the rest of systems (3) and other (5). The listing is the
  proceedings, so it is the acceptance evidence; there is no comment to quote. Manifest entries say
  `source: "semantic-scholar"`, `acceptance: "s2-venue-listing"`.

A candidate is kept when it passes, in this order: **1** acceptance evidence (the comment states it
and is not a workshop, poster, extended or submitted version; or the listing holds it); **2** the
licence in arXiv's metadata is exactly CC BY 4.0, CC BY-SA 4.0 or CC0; **3** the first
`\documentclass` of the main file, and for ML, NLP and AI venues the style package, is the venue's;
**4** at most 300 KB of text sources. Every candidate that reached a rule is a line of
[`sampling/probe-log.jsonl`](sampling/probe-log.jsonl), with its rank and the reason.

What the run reports (`STATUS.md` of the run, recomputed from the log by `sampling/verify.mjs`):
kept 80 of the 80 the quotas ask for, from 1330 candidates (1250 rejected; 187 of the 1330 came from
the Semantic Scholar listing), 28 venue series. No rule 2–4 was loosened.

**2026-11-27:** 2503.20191v2, kept as EuroSys 2025 from the Semantic Scholar listing, was removed:
its own TeX declares `\acmConference[EUROSYS '26]` and `\acmYear{2026}` (the third batch below
says why). 79 of the 80 remain; the tables of this section are the run as it was.

| field | kept / quota | probed | yield | top 3 rejection reasons |
| --- | --- | ---: | ---: | --- |
| ml | 18 / 18 | 118 | 15.3% | comment says «Workshop» (47); no acceptance statement (19); licence arXiv non-exclusive (11) |
| nlp | 12 / 12 | 42 | 28.6% | no acceptance statement (9); licence arXiv non-exclusive (7); comment says «Workshop» (5) |
| ai | 8 / 8 | 47 | 17.0% | comment says «Workshop» (17); licence arXiv non-exclusive (11); no acceptance statement (6) |
| security | 10 / 10 | 82 | 12.2% | licence arXiv non-exclusive (30); no acceptance statement (13); over 300 KB (6) |
| se | 8 / 8 | 216 | 3.7% | licence arXiv non-exclusive (73); over 300 KB (51); comment says «Workshop» (26) |
| hci | 8 / 8 | 343 | 2.3% | no acceptance statement (75); over 300 KB (72); comment says «Workshop» (69) |
| systems | 10 / 10 | 266 | 3.8% | no acceptance statement (53); over 300 KB (49); licence arXiv non-exclusive (48) |
| other | 6 / 6 | 216 | 2.8% | licence arXiv non-exclusive (102); class `article`, not `acmart` (50); licence CC BY-NC-ND (13) |

Over all fields the most frequent reasons: the arXiv non-exclusive licence 321, no acceptance
statement 203, «Workshop» in the comment 197 (and «workshop» 34), over 300 KB 188, CC BY-NC-ND 58,
CC BY-NC-SA 51, class `article` where `acmart` is required 50.

#### The third batch (2026-11-27): 68 papers, the same script with higher quotas

The quotas in `sampling/queries.json` were raised and committed before the run: ml 30, nlp 24,
ai 16, security 20, se 16, hci 16, systems 20, other 12 (154; they were 80). The rules, sources and
editions are those of the second batch. The run resumed from the log, so no candidate of the
second batch was judged again. It judged 522 new candidates (80 from the Semantic Scholar listing)
and kept 73, in 40 minutes. No rule was loosened. Five of the 73 were then removed. Four they came from
the Semantic Scholar listing of one edition while their own arXiv comment names the next («Accepted
by EuroSys 2026» for 2509.26529v2 and 2510.00206v1, listed under EuroSys 2025; «OSDI'26» for
2505.04021v3 under OSDI 2025; «Accepted to NDSI 2026» for 2505.00254v5 under NSDI 2025). The
listing's year is the publication year, which can precede the edition. A listed paper whose comment
names its venue with another year is now rejected (`judgeListedVenue`); «NDSI», a typo, is not the
venue's name, so that paper was removed by hand. The fifth, 2509.23324v1, has an empty comment
and is listed under EuroSys 2025, but its own TeX declares `\acmConference[EUROSYS '26]` and
`\acmYear{2026}`; so does 2503.20191v2 of the second batch, removed with it. A listed paper whose
TeX declares another edition year is now rejected (`judgeDeclaredYear`). The table counts the 68 kept.

| field | kept this run | total / quota | probed this run | yield |
| --- | ---: | --- | ---: | ---: |
| ml | 12 | 30 / 30 | 83 | 14.5% |
| nlp | 12 | 24 / 24 | 55 | 21.8% |
| ai | 8 | 16 / 16 | 50 | 16.0% |
| security | 9 | 19 / 20 | 31 | 29.0% |
| se | 8 | 16 / 16 | 66 | 12.1% |
| hci | 8 | 16 / 16 | 157 | 5.1% |
| systems | 5 | 14 / 20 | 48 | 10.4% |
| other | 6 | 12 / 12 | 32 | 18.8% |

**systems is six short**, the six removed above: the next run fills it. **security is one
short:** each of its editions ended full (5 papers) or exhausted (no candidate
left that passes), so 19 is what the editions hold today, not a stopped run. One `other` walk
(ICCV 2025) ended on a Semantic Scholar 429; `other` was full without it. `node
scripts/grow-real-papers/main.ts --summary` prints the whole log's table, every edition included.

### Growing this set without bias

A later batch follows these rules, so that the set stays a sample and not a selection:

1. **The field quotas are fixed before collecting**, in `sampling/queries.json`, with the venue
   editions and their queries. They are not changed during the run.
2. **At most 5 papers per venue edition** (series and year), counted over every entry of
   `venue-manifest.json`, earlier batches included.
3. **Candidates come in a fixed order** — the search-result order of the arXiv query, or, for a
   venue listing, the listing's papers in arXiv-id order — and **the first passing ones are kept**.
   No paper is picked or dropped by hand.
4. **Every candidate is logged** in `sampling/probe-log.jsonl` with its rank, its query and the
   reason it was kept or rejected.
5. **Rules 2–4 are never loosened to fill a quota.** A quota that comes up short is a result: report
   it as kept/quota, with the yield and the top rejection reasons, as the table above does.
6. **To grow it**: raise the quotas in `sampling/queries.json`, then run
   `node scripts/grow-real-papers/main.ts` (a dry run: it prints each candidate with its rank and
   reason and, for each kept paper, the files it would stage; it writes nothing). `--write fixtures`
   stages in place: the paper directories, their `venue-manifest.json` entries, and the lines of
   `sampling/probe-log.jsonl` and `sampling/staging-notes.json`, each as soon as a candidate is
   decided, and only while `sampling/queries.json` is committed (rule 1). Every run ends with the
   summary of `scripts/grow-real-papers/summary.ts` — per field the manifest's total against its
   quota beside what this run kept and probed, per edition its count against the cap — and the
   command to run next; it exits 1 when a walk stopped by time or a search error.
   `node scripts/grow-real-papers/main.ts --summary` prints the same table over the whole log
   without fetching anything, and exits 1 when the log keeps a paper the manifest lacks.
   `--only ml,nlp` restricts the fields; `--minutes N` or `--deadline <ISO>` stop it, and a
   rerun resumes from the log (a failed download is judged again, nothing else is). Quotas, caps and
   the 5 per edition are **totals** over every entry of `venue-manifest.json`, earlier batches
   included: a quota already met adds nothing. Papers already in either manifest are skipped. The
   rules are pure functions in `scripts/grow-real-papers/rules.ts` and the staging in `archive.ts`,
   each tested beside it; `sampling/sample.mjs` and `sampling/verify.mjs` are kept as the record of
   the 2026-11-20 run, not as tools.
7. **The mechanical part is a test**: [`../balance.test.ts`](../balance.test.ts) fails when an edition
   holds more than 5 papers, an entry lacks acceptance evidence (a quote, or `acceptance:
   "s2-venue-listing"`) or a CC BY 4.0 / CC BY-SA 4.0 / CC0 licence, a field is over its quota in
   `queries.json`, or an entry and an arXiv-id directory do not match one to one. The edition is
   `series` and `year`, which every entry carries (the 12 papers of 2026-11-19 too); the quota counts
   the entries that carry a `field`, those of a sampled batch, so a new batch raises the quotas in
   `queries.json` by its own share in the commit that adds its papers. Whether the kept papers were
   the first passing ones is in the log, not in the test.

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
- **The second batch (2026-11-20)** uses the same choice, made by the script (`presetFor`): an
  edition preset when one ships — `paperlint:neurips-2026` (2 papers) and `paperlint:emnlp-2026`
  (2) — otherwise the family of the template: `paperlint:acm-sigconf` 16, `paperlint:acl-latex` 10,
  `paperlint:icml-style` 6, `paperlint:acm-acmsmall` 6, `paperlint:ieee-conference` 6,
  `paperlint:neurips-style` 4, `paperlint:aaai-press` 4. **24 papers have no preset and no family**
  (ICLR 2025 and 2026, IJCAI 2025 and 2026, USENIX Security 2025, CVPR 2025, ICCV 2025, OSDI 2025,
  SOSP 2025, EuroSys 2025, NSDI 2025 and 2026, SIGGRAPH 2025): their cycle's venue is
  `{"kind": "named"}`, so no venue rule applies and they measure the writing rules only. No paper of
  the batch names a `kind`.
- **No preset has a camera-ready kind.** The kind is the submission's (`research`, `regular`,
  `short`, …), so a page limit would be the submission's, one page short for venues that give the
  camera-ready an extra page. This test does not build, so no page limit is measured here
  (`pdf/measured` says so on every paper); a built run would have to account for it.

### What is weak about this

- **Not classified yet** (above).
- **The record is not TeX's answer**: `record-by-hand.json` is written as in `preprints/` —
  `paper.tex`, the class and style files at the root, then the `\input`/`\include` files in the
  order the source names them. Nothing was compiled. Whether every `\input` resolves to a file
  here, and every file it resolves to is in the record, is held by `../inputs.test.ts` over both
  folders. It caught one paper (2610.17767v1) whose main file sat in a subfolder: the collector
  staged from that subfolder, while arXiv compiles from the archive's root, so the sections went
  unread and its baseline counted little more than the abstract. Restaged by hand; the collector now stages
  from the archive root (`stagingPlan` in `scripts/grow-real-papers/archive.ts`), and its test with a
  main file in a subfolder fails against the old rule.
- **An arXiv source is the author's, not the publisher's file.** Several carry acmart's `nonacm`
  option, which drops the ACM furniture the proceedings add; the class and its format option are
  the venue's.
- **The kind is a guess when the comment names no track** (each README says when).
- **Ninety-two papers**: twelve of seven venues chosen on 2026-11-19, and eighty of 28 venue series
  sampled on 2026-11-20 (below).
- **The second batch's acceptance wording is judged by regex** (`judgeComment` in
  `sampling/sample.mjs`). It keeps orals, spotlights and special tracks of the main conference,
  which are accepted papers but not always the research track: ICSE 2026's Future of Software
  Engineering (2601.21761v1) and Industry Challenge (2603.21530v1) tracks, ACL 2025 Industry-Oral
  (2604.08115v1), EMNLP 2025 Industry Track (2602.22696v1), NeurIPS 2026's Track on Evaluations and
  Datasets (2611.24904v1), «Accepted to CHI 2026 (preprint)» (2603.19504v1) and OOPSLA 2026 «R1»
  (2602.20049v1). One entry is EMNLP 2025 Findings (`track: "Findings"`, 2604.24052v1).
- **The style's mode is not a rule.** For NeurIPS the script checks only that `neurips_20xx` is
  loaded, and a bare `\usepackage{neurips_2025}` is the submission layout. In this batch every
  NeurIPS paper loads `[final]`, every ICML paper `[accepted]`, every ICLR paper sets
  `\iclrfinalcopy`, and one ACL paper (2603.05996v1) loads `acl` with no option;
  `sampling/staging-notes.json` records each paper's class and style options.
- **A Semantic Scholar paper's arXiv version is not confirmed to be the camera-ready**: the script
  kept the latest arXiv version (`versionNote` in `staging-notes.json`), and the manifest's `quote`
  for these eight papers is a string the script wrote from the listing («Semantic Scholar venue
  listing: venue …, year …, publication date …»), not text an author wrote.
- **On a family preset, an older edition's style is a `tex/template` finding**: the family requires
  the newest style it knows (`neurips_2026`, `icml2027`, `aaai2027`), so 14 papers of 2025 and 2026
  draw one each (below).

### The papers

The 12 chosen on 2026-11-19:

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

The 79 of the 80 sampled on 2026-11-20 that remain, generated from `venue-manifest.json` and `sampling/staging-notes.json`
(by field, then edition; «S2 listing»: the acceptance is the Semantic Scholar listing):

| paper | field | accepted at | linted as | class | licence | text |
| --- | --- | --- | --- | --- | --- | ---: |
| [2607.00671v1](2607.00671v1/README.md) | ml | ICLR 2025 | named, no preset | `article` + `iclr2025_conference` | CC BY 4.0 | 293 KB |
| [2607.22012v1](2607.22012v1/README.md) | ml | ICLR 2025 | named, no preset | `article` + `iclr2025_conference` | CC BY 4.0 | 209 KB |
| [2610.05501v1](2610.05501v1/README.md) | ml | ICLR 2025 | named, no preset | `article` + `iclr2025_conference` | CC BY 4.0 | 212 KB |
| [2607.22039v1](2607.22039v1/README.md) | ml | ICLR 2026 | named, no preset | `article` + `iclr2026_conference` | CC BY 4.0 | 253 KB |
| [2607.26723v1](2607.26723v1/README.md) | ml | ICLR 2026 | named, no preset | `article` + `iclr2026_conference` | CC BY 4.0 | 219 KB |
| [2611.01870v1](2611.01870v1/README.md) | ml | ICLR 2026 | named, no preset | `article` + `iclr2026_conference` | CC BY 4.0 | 171 KB |
| [2606.16301v1](2606.16301v1/README.md) | ml | ICML 2025 | `paperlint:icml-style` | `article` + `icml2025[accepted]` | CC BY 4.0 | 246 KB |
| [2608.30295v1](2608.30295v1/README.md) | ml | ICML 2025 | `paperlint:icml-style` | `article` + `icml2025[accepted]` | CC BY 4.0 | 208 KB |
| [2611.02620v1](2611.02620v1/README.md) | ml | ICML 2025 | `paperlint:icml-style` | `article` + `icml2025[accepted]` | CC BY 4.0 | 225 KB |
| [2611.06244v1](2611.06244v1/README.md) | ml | ICML 2026 | `paperlint:icml-style` | `article` + `icml2026[accepted]` | CC BY 4.0 | 278 KB |
| [2611.18370v1](2611.18370v1/README.md) | ml | ICML 2026 | `paperlint:icml-style` | `article` + `icml2026[accepted]` | CC BY 4.0 | 251 KB |
| [2611.20445v1](2611.20445v1/README.md) | ml | ICML 2026 | `paperlint:icml-style` | `article` + `icml2026[accepted]` | CC BY 4.0 | 252 KB |
| [2604.14149v2](2604.14149v2/README.md) | ml | NeurIPS 2025 | `paperlint:neurips-style` | `article` + `neurips_2025[final]` | CC BY 4.0 | 126 KB |
| [2605.29097v2](2605.29097v2/README.md) | ml | NeurIPS 2025 | `paperlint:neurips-style` | `article` + `neurips_2025[final]` | CC BY 4.0 | 111 KB |
| [2609.07876v1](2609.07876v1/README.md) | ml | NeurIPS 2025 | `paperlint:neurips-style` | `article` + `neurips_2025[final]` | CC BY 4.0 | 193 KB |
| [2610.22056v1](2610.22056v1/README.md) | ml | NeurIPS 2025 | `paperlint:neurips-style` | `article` + `neurips_2025[final]` | CC BY 4.0 | 97 KB |
| [2611.24376v1](2611.24376v1/README.md) | ml | NeurIPS 2026 | `paperlint:neurips-2026` | `article` + `neurips_2026[main, final]` | CC BY 4.0 | 191 KB |
| [2611.24904v1](2611.24904v1/README.md) | ml | NeurIPS 2026 | `paperlint:neurips-2026` | `article` + `neurips_2026[eandd, final]` | CC BY 4.0 | 235 KB |
| [2511.17153v1](2511.17153v1/README.md) | nlp | ACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 170 KB |
| [2603.02248v1](2603.02248v1/README.md) | nlp | ACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 195 KB |
| [2604.08115v1](2604.08115v1/README.md) | nlp | ACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 141 KB |
| [2609.32684v1](2609.32684v1/README.md) | nlp | ACL 2026 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 171 KB |
| [2610.17767v1](2610.17767v1/README.md) | nlp | ACL 2026 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 92 KB |
| [2511.23391v1](2511.23391v1/README.md) | nlp | EMNLP 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 230 KB |
| [2602.22696v1](2602.22696v1/README.md) | nlp | EMNLP 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 198 KB |
| [2604.24052v1](2604.24052v1/README.md) | nlp | EMNLP 2025 (Findings) | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 105 KB |
| [2611.23530v1](2611.23530v1/README.md) | nlp | EMNLP 2026 | `paperlint:emnlp-2026` | `article` + `acl[final]` | CC BY 4.0 | 236 KB |
| [2611.23969v1](2611.23969v1/README.md) | nlp | EMNLP 2026 | `paperlint:emnlp-2026` | `article` + `acl[final]` | CC BY 4.0 | 132 KB |
| [2603.05996v1](2603.05996v1/README.md) | nlp | NAACL 2025 | `paperlint:acl-latex` | `article` + `acl` | CC BY 4.0 | 192 KB |
| [2606.04286v1](2606.04286v1/README.md) | nlp | NAACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 152 KB |
| [2607.13812v1](2607.13812v1/README.md) | ai | AAAI 2025 | `paperlint:aaai-press` | `article` + `aaai25` | CC BY 4.0 | 106 KB |
| [2610.17635v1](2610.17635v1/README.md) | ai | AAAI 2025 | `paperlint:aaai-press` | `article` + `aaai25` | CC BY 4.0 | 115 KB |
| [2611.05979v1](2611.05979v1/README.md) | ai | AAAI 2026 | `paperlint:aaai-press` | `article` + `aaai2026` | CC0 1.0 | 110 KB |
| [2611.15538v1](2611.15538v1/README.md) | ai | AAAI 2026 | `paperlint:aaai-press` | `article` + `aaai2026` | CC BY 4.0 | 173 KB |
| [2603.01806v1](2603.01806v1/README.md) | ai | IJCAI 2025 | named, no preset | `article` + `ijcai25` | CC BY 4.0 | 150 KB |
| [2609.20699v2](2609.20699v2/README.md) | ai | IJCAI 2025 | named, no preset | `article` + `ijcai25` | CC BY 4.0 | 73 KB |
| [2607.00058v1](2607.00058v1/README.md) | ai | IJCAI 2026 | named, no preset | `article` + `ijcai26` | CC BY 4.0 | 104 KB |
| [2607.17290v1](2607.17290v1/README.md) | ai | IJCAI 2026 | named, no preset | `article` + `ijcai26` | CC BY 4.0 | 96 KB |
| [2509.07941v1](2509.07941v1/README.md) | security | ACM CCS 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 264 KB |
| [2509.09331v1](2509.09331v1/README.md) | security | ACM CCS 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 254 KB |
| [2509.10895v1](2509.10895v1/README.md) | security | ACM CCS 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 250 KB |
| [2410.15215v1](2410.15215v1/README.md) | security | IEEE S&P 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 156 KB |
| [2411.10883v2](2411.10883v2/README.md) | security | IEEE S&P 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 175 KB |
| [2503.09022v3](2503.09022v3/README.md) | security | IEEE S&P 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC0 1.0 | 216 KB |
| [2502.03718v1](2502.03718v1/README.md) | security | USENIX Security 2025 | named, no preset | `article` + `usenix2019_v3` | CC BY-SA 4.0 | 147 KB |
| [2503.03494v2](2503.03494v2/README.md) | security | USENIX Security 2025 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 204 KB |
| [2503.10239v1](2503.10239v1/README.md) | security | USENIX Security 2025 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 168 KB |
| [2507.16372v1](2507.16372v1/README.md) | security | USENIX Security 2025 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 165 KB |
| [2510.00446v1](2510.00446v1/README.md) | se | ASE 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 183 KB |
| [2510.14465v1](2510.14465v1/README.md) | se | ASE 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY-SA 4.0 | 80 KB |
| [2601.21761v1](2601.21761v1/README.md) | se | ICSE 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 250 KB |
| [2603.21530v1](2603.21530v1/README.md) | se | ICSE 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 217 KB |
| [2609.14475v1](2609.14475v1/README.md) | se | ICSE 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 266 KB |
| [2412.16620v1](2412.16620v1/README.md) | se | ISSTA 2025 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 241 KB |
| [2503.17220v2](2503.17220v2/README.md) | se | ISSTA 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 199 KB |
| [2608.28713v1](2608.28713v1/README.md) | se | ISSTA 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 192 KB |
| [2501.18588v1](2501.18588v1/README.md) | hci | CHI 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 196 KB |
| [2503.00228v1](2503.00228v1/README.md) | hci | CHI 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 272 KB |
| [2503.22283v1](2503.22283v1/README.md) | hci | CHI 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 99 KB |
| [2609.17278v1](2609.17278v1/README.md) | hci | CHI 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 156 KB |
| [2603.19504v1](2603.19504v1/README.md) | hci | CHI 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 158 KB |
| [2603.26520v1](2603.26520v1/README.md) | hci | CHI 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 194 KB |
| [2604.10875v1](2604.10875v1/README.md) | hci | CHI 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 252 KB |
| [2504.18044v1](2504.18044v1/README.md) | hci | CSCW 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 170 KB |
| [2503.03003v1](2503.03003v1/README.md) | systems | NSDI 2025, S2 listing | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 173 KB |
| [2601.19162v2](2601.19162v2/README.md) | systems | NSDI 2026 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 177 KB |
| [2602.20049v1](2602.20049v1/README.md) | systems | OOPSLA 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 291 KB |
| [2505.02146v1](2505.02146v1/README.md) | systems | OSDI 2025 | named, no preset | `article` + `usenix2019_v3` | CC BY 4.0 | 196 KB |
| [2505.21661v1](2505.21661v1/README.md) | systems | OSDI 2025 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 131 KB |
| [2411.10188v2](2411.10188v2/README.md) | systems | POPL 2025 | `paperlint:acm-acmsmall` | `acmart` | CC BY-SA 4.0 | 175 KB |
| [2603.19671v1](2603.19671v1/README.md) | systems | SIGMOD 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 293 KB |
| [2603.21710v2](2603.21710v2/README.md) | systems | SIGMOD 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 249 KB |
| [2501.05408v3](2501.05408v3/README.md) | systems | SOSP 2025, S2 listing | named, no preset | `acmart` | CC BY 4.0 | 249 KB |
| [2501.00740v3](2501.00740v3/README.md) | other | CVPR 2025, S2 listing | named, no preset | `article` + `cvpr[pagenumbers]` | CC BY 4.0 | 172 KB |
| [2606.21736v1](2606.21736v1/README.md) | other | CVPR 2025 | named, no preset | `article` + `cvpr` | CC BY 4.0 | 161 KB |
| [2501.02885v2](2501.02885v2/README.md) | other | ICCV 2025, S2 listing | named, no preset | `article` + `iccv` | CC BY 4.0 | 191 KB |
| [2501.17311v2](2501.17311v2/README.md) | other | ICRA 2025, S2 listing | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 66 KB |
| [2502.00626v2](2502.00626v2/README.md) | other | SIGGRAPH 2025, S2 listing | named, no preset | `acmart` | CC BY 4.0 | 175 KB |
| [2501.10143v1](2501.10143v1/README.md) | other | SIGIR 2025, S2 listing | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 103 KB |

The 68 of the 69 sampled on 2026-11-27 that remain, generated the same way:

| paper | field | accepted at | linted as | class | licence | text |
| --- | --- | --- | --- | --- | --- | ---: |
| [2509.18627v1](2509.18627v1/README.md) | ml | ICLR 2025 | named, no preset | `article` + `iclr2025_conference` | CC BY 4.0 | 286 KB |
| [2604.01709v1](2604.01709v1/README.md) | ml | ICLR 2025 | named, no preset | `article` + `iclr2025_conference` | CC BY 4.0 | 204 KB |
| [2606.20112v1](2606.20112v1/README.md) | ml | ICLR 2026 | named, no preset | `article` + `iclr2026_conference` | CC BY 4.0 | 216 KB |
| [2611.27050v1](2611.27050v1/README.md) | ml | ICLR 2026 | named, no preset | `article` + `iclr2026_conference` | CC BY 4.0 | 211 KB |
| [2606.14416v1](2606.14416v1/README.md) | ml | ICML 2025 | `paperlint:icml-style` | `article` + `icml2025[accepted]` | CC BY 4.0 | 197 KB |
| [2611.27511v1](2611.27511v1/README.md) | ml | ICML 2025 | `paperlint:icml-style` | `article` + `icml2025[accepted]` | CC BY 4.0 | 259 KB |
| [2611.27253v1](2611.27253v1/README.md) | ml | ICML 2026 | `paperlint:icml-style` | `article` + `icml2026[accepted]` | CC BY 4.0 | 289 KB |
| [2611.30168v1](2611.30168v1/README.md) | ml | ICML 2026 | `paperlint:icml-style` | `article` + `icml2026[accepted]` | CC BY 4.0 | 256 KB |
| [2604.11223v1](2604.11223v1/README.md) | ml | NeurIPS 2025 | `paperlint:neurips-style` | `article` + `neurips_2025[final]` | CC BY 4.0 | 283 KB |
| [2611.33759v1](2611.33759v1/README.md) | ml | NeurIPS 2026 | `paperlint:neurips-2026` | `article` + `neurips_2026[main,final]` | CC BY 4.0 | 108 KB |
| [2611.34825v1](2611.34825v1/README.md) | ml | NeurIPS 2026 | `paperlint:neurips-2026` | `article` + `neurips_2026[eandd,final]` | CC BY 4.0 | 127 KB |
| [2611.34881v1](2611.34881v1/README.md) | ml | NeurIPS 2026 | `paperlint:neurips-2026` | `article` + `neurips_2026[eandd, final]` | CC BY 4.0 | 267 KB |
| [2508.18740v1](2508.18740v1/README.md) | nlp | ACL 2025 (Findings) | `paperlint:acl-latex` | `article` + `acl` | CC BY 4.0 | 231 KB |
| [2509.18719v1](2509.18719v1/README.md) | nlp | ACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 138 KB |
| [2609.23257v2](2609.23257v2/README.md) | nlp | ACL 2026 (Findings) | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 143 KB |
| [2611.31848v1](2611.31848v1/README.md) | nlp | ACL 2026 (Findings) | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 111 KB |
| [2603.14525v1](2603.14525v1/README.md) | nlp | EACL 2026 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY-SA 4.0 | 225 KB |
| [2603.20851v1](2603.20851v1/README.md) | nlp | EACL 2026 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 207 KB |
| [2511.03128v1](2511.03128v1/README.md) | nlp | EMNLP 2025 (Findings) | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 195 KB |
| [2511.11473v1](2511.11473v1/README.md) | nlp | EMNLP 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 218 KB |
| [2611.17107v1](2611.17107v1/README.md) | nlp | EMNLP 2026 | `paperlint:emnlp-2026` | `article` + `acl` | CC BY 4.0 | 183 KB |
| [2611.30052v1](2611.30052v1/README.md) | nlp | EMNLP 2026 | `paperlint:emnlp-2026` | `article` + `acl[final]` | CC BY 4.0 | 211 KB |
| [2505.22993v1](2505.22993v1/README.md) | nlp | NAACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 128 KB |
| [2506.11076v1](2506.11076v1/README.md) | nlp | NAACL 2025 | `paperlint:acl-latex` | `article` + `acl[final]` | CC BY 4.0 | 141 KB |
| [2511.10837v1](2511.10837v1/README.md) | ai | AAAI 2025 | `paperlint:aaai-press` | `article` + `aaai25` | CC BY-SA 4.0 | 114 KB |
| [2601.06406v1](2601.06406v1/README.md) | ai | AAAI 2025 | `paperlint:aaai-press` | `article` + `aaai25` | CC BY 4.0 | 183 KB |
| [2609.08162v1](2609.08162v1/README.md) | ai | AAAI 2026 | `paperlint:aaai-press` | `article` + `aaai2026` | CC BY 4.0 | 175 KB |
| [2610.02517v1](2610.02517v1/README.md) | ai | AAAI 2026 | `paperlint:aaai-press` | `article` + `aaai2026` | CC BY 4.0 | 66 KB |
| [2509.02276v1](2509.02276v1/README.md) | ai | IJCAI 2025 | named, no preset | `article` + `ijcai24` | CC BY 4.0 | 114 KB |
| [2602.00718v1](2602.00718v1/README.md) | ai | IJCAI 2025 | named, no preset | `article` + `ijcai25` | CC BY 4.0 | 97 KB |
| [2606.18672v1](2606.18672v1/README.md) | ai | IJCAI 2026 | named, no preset | `article` + `ijcai26` | CC BY 4.0 | 170 KB |
| [2606.26487v1](2606.26487v1/README.md) | ai | IJCAI 2026 | named, no preset | `article` + `ijcai26` | CC BY 4.0 | 204 KB |
| [2509.00662v2](2509.00662v2/README.md) | security | ACM CCS 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 281 KB |
| [2509.03821v2](2509.03821v2/README.md) | security | ACM CCS 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 259 KB |
| [2410.10128v2](2410.10128v2/README.md) | security | IEEE S&P 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 160 KB |
| [2502.00765v1](2502.00765v1/README.md) | security | USENIX Security 2025 | named, no preset | `article` + `usenix-2020-09` | CC BY 4.0 | 281 KB |
| [2606.02797v2](2606.02797v2/README.md) | security | USENIX Security 2026 | named, no preset | `article` + `usenix` | CC BY 4.0 | 137 KB |
| [2607.06371v1](2607.06371v1/README.md) | security | USENIX Security 2026 | named, no preset | `article` + `usenix` | CC BY 4.0 | 233 KB |
| [2607.10315v2](2607.10315v2/README.md) | security | USENIX Security 2026 | named, no preset | `article` + `usenix` | CC BY 4.0 | 122 KB |
| [2607.19957v2](2607.19957v2/README.md) | security | USENIX Security 2026 | named, no preset | `article` + `usenix` | CC BY 4.0 | 137 KB |
| [2608.00543v1](2608.00543v1/README.md) | security | USENIX Security 2026 | named, no preset | `article` + `usenix` | CC BY 4.0 | 156 KB |
| [2506.01427v3](2506.01427v3/README.md) | se | ASE 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 95 KB |
| [2506.18824v2](2506.18824v2/README.md) | se | ASE 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 78 KB |
| [2509.16861v1](2509.16861v1/README.md) | se | ASE 2025 | `paperlint:ieee-conference` | `IEEEtran` | CC BY 4.0 | 102 KB |
| [2601.09440v1](2601.09440v1/README.md) | se | ICSE 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 109 KB |
| [2601.14132v2](2601.14132v2/README.md) | se | ICSE 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 252 KB |
| [2607.22883v1](2607.22883v1/README.md) | se | ISSTA 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 293 KB |
| [2608.02974v1](2608.02974v1/README.md) | se | ISSTA 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 210 KB |
| [2608.12144v1](2608.12144v1/README.md) | se | ISSTA 2026 | named, no preset | `acmart` | CC BY 4.0 | 258 KB |
| [2502.18683v1](2502.18683v1/README.md) | hci | CHI 2025 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 237 KB |
| [2603.08080v1](2603.08080v1/README.md) | hci | CHI 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 249 KB |
| [2603.12000v1](2603.12000v1/README.md) | hci | CHI 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 245 KB |
| [2409.19450v2](2409.19450v2/README.md) | hci | CSCW 2025 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 201 KB |
| [2608.11442v1](2608.11442v1/README.md) | hci | CSCW 2026 | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 147 KB |
| [2608.22146v1](2608.22146v1/README.md) | hci | CSCW 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 153 KB |
| [2609.00808v1](2609.00808v1/README.md) | hci | CSCW 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 196 KB |
| [2609.12070v1](2609.12070v1/README.md) | hci | CSCW 2026 | `paperlint:acm-acmsmall` | `acmart` | CC BY 4.0 | 138 KB |
| [2505.01616v3](2505.01616v3/README.md) | systems | NSDI 2025, S2 listing | named, no preset | `article` + `usenix` | CC BY 4.0 | 81 KB |
| [2601.13496v1](2601.13496v1/README.md) | systems | NSDI 2026, S2 listing | named, no preset | `article` + `usenix_2020_09` | CC BY 4.0 | 129 KB |
| [2506.03437v2](2506.03437v2/README.md) | systems | OSDI 2025, S2 listing | named, no preset | `article` + `usenix2019_v3` | CC BY 4.0 | 227 KB |
| [2504.17096v2](2504.17096v2/README.md) | systems | SOSP 2025, S2 listing | named, no preset | `acmart` | CC BY 4.0 | 198 KB |
| [2505.01603v2](2505.01603v2/README.md) | systems | SOSP 2025, S2 listing | named, no preset | `acmart` | CC BY-SA 4.0 | 229 KB |
| [2601.00664v2](2601.00664v2/README.md) | other | CVPR 2026, S2 listing | named, no preset | `article` + `cvpr[pagenumbers]` | CC BY 4.0 | 178 KB |
| [2501.16684v1](2501.16684v1/README.md) | other | ICRA 2025, S2 listing | named, no preset | `ieeeconf` | CC BY 4.0 | 274 KB |
| [2601.04356v2](2601.04356v2/README.md) | other | ICRA 2026, S2 listing | named, no preset | `ieeeconf` | CC BY 4.0 | 247 KB |
| [2502.09608v2](2502.09608v2/README.md) | other | SIGGRAPH 2025, S2 listing | named, no preset | `acmart` | CC BY 4.0 | 289 KB |
| [2501.15915v1](2501.15915v1/README.md) | other | SIGIR 2025, S2 listing | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 265 KB |
| [2601.15820v1](2601.15820v1/README.md) | other | SIGIR 2026, S2 listing | `paperlint:acm-sigconf` | `acmart` | CC BY 4.0 | 120 KB |

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
| `paper/edition-over` | 0 | 2611.10830v1 got «AIDC 2026 is over» (its last deadline, camera-ready 2026-11-09, passed) until #654: its cycle is accepted, and an accepted paper's stage turns the rule off. The rule reads the clock, so `real-papers.test.ts` lints on a fixed day (2026-11-19): on the real clock `sp-2027` would add one to `preprints/2611.07576v1` on 2027-04-09 (measured with the clock set to 2027-05-01) |

Not classified yet: these are the next step's rows.

On the 80 papers of the second batch, from the run that recorded their baselines (clock at
2026-11-19), not classified: `tex/template` 14 (14 papers: a 2025 or 2026 style on the NeurIPS, ICML
and AAAI families, which require the newest they know), `tex/venue-leftover` 12 (7 papers: «ICSE»,
and on one of them «MSR 2021», in three ICSE 2026 papers linted on `acm-sigconf`; «AAAI» in two AAAI
papers linted on `aaai-press`; «ICML 2024» in an IEEE S&P 2025 paper's introduction and an ICML 2026
paper's appendix), `tex/acm-frontmatter-override` 5 (4 papers: `\pagestyle{plain}` or `{empty}`,
`\setcopyright{none}`, a redefined `\footnotetextcopyrightpermission`), `format/layout-override` 5 (2608.28713v1, `\linespread`),
`tex/required-section` 2 and `pdf/profile` 2 (the two `neurips-2026` papers: no «NeurIPS Paper
Checklist» section; no `kind`), `paper/edition-over` 2 (the same two: NeurIPS 2026's last deadline,
2026-11-07, has passed), `pdf/measured` 80.

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

With the paper's stage (#654), measured 2026-11-23 by the same run: `paper/edition-over` 1 → 0 on
each of 2611.10830v1, 2611.24376v1 and 2611.24904v1, whose cycles are accepted; an accepted paper's
stage turns the rule off. No other count moved.

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
| accepted (this change) | `paper/edition-over` reports an edition as over on a paper whose cycle was accepted at it (2611.10830v1, AIDC 2026) | fixed by #654: an accepted paper's stage turns the rule off; `src/settled-paper.test.ts` pins it |
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

