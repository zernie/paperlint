# `accepted-papers` — every rule, measured on papers that were accepted

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

## The test

`accepted-papers.test.ts` copies each paper under `papers/` in a temporary project, runs
`paperlint lint --json` through the CLI's own `run`, and compares the findings per rule with the
paper's `baseline.json`, using the reader in [`baseline.ts`](baseline.ts):

- a rule that reports **more** than recorded fails — a false positive until shown otherwise;
- a recorded rule that goes **fully quiet** fails — that is how a check dies unnoticed;
- a partial drop passes — that is what a fix looks like; lower the recording in the same change.

A new rule is measured here the day it is registered. The corpus is excluded from the npm tarball
(`!fixtures/accepted-papers` in `package.json`).

## What the rules say about the corpus

Every recorded finding, classified. **real** — the paper does what the rule reports, and the rule is
right to say so. **known** — a false positive, or a statement about the fixture rather than the
paper, left for a later change; one line each. **sampled** — recorded when the paper joined the
corpus for its page count (below); five messages were looked at, the sentences were not read, and
the count is not yet classified.

| paper | rule | n | kind | why |
| --- | --- | ---: | --- | --- |
| all six | `pdf/measured` | 1 | known | the lint test reads the source and never builds, so the PDF rules cannot run; the rule says so, correctly |
| agenticdev-acm26 | `paper/refs-checked` | 1 | known | the same: the inline bibliography was never checked by `paperlint build` here |
| agenticdev-acm26 | `tex/claim-provenance` | 9 | real | numbers stated with no owner in the sentence ("The first is that the tool cuts output tokens by 65%.") — the paper reviewers called too informal |
| secure-acsac24 | `tex/claim-provenance` | 6 | real | the authors' own results stated without a subject or a pointer ("LLMs experience a significant decrease in accuracy, with a 5.44% drop …"); the owner is in a neighbouring sentence, which the rule does not read |
| secure-acsac24 | `tex/claim-provenance` | 1 | known | a range that defines a scale, not a result ("Typically set between 0 and 1, the temperature …") |
| agenticdev-acm26 | `tex/heading-case` | 18 | real | 18 words in 6 of the paper's 9 headings (`Related work`, `The advertised savings don't show up`, `Method: a cost-aware, correctness-gated harness` …) are in sentence case, which the proceedings vendor's checklist does not accept. Every one is a true positive and the rule's fix writes the corrected heading. Its `\title` and short title, read by the rule since 2026-10-04, are in headline style and add none |
| agenticdev-acm26 | `tex/register` | 1 | real | 7 sentences open with _And_, _So_, _But_ or _Nor_ — 1.60 per 1000 words against a limit of 0.8; the papers written by others read 0 to 0.37 |
| llm-splained-acsac25 | `paper/leading-zero` | 2 | real | probabilities written without the zero ("with probability greater than $.58$", and `.73`) in `sections/5-discussion.tex`; IEEE style, which the rule follows, asks for `0.58` — APA would omit it for a probability |
| llm-splained-acsac25 | `tex/claim-provenance` | 11 | real | the authors' own results in `sections/*.tex` stated without a subject or a pointer ("GPT errors exceeded 30% in both categories …"); the owner is in a neighbouring sentence. One ("ranged from 1 to 13") is in a list item, which the rules did not read before; one is in the reviews' disabled branch (below) |
| secure-acsac24 | `format/layout-override` | 2 | real | the source loads `geometry` and sets `\geometry{a4paper, margin=1in}` over IEEEtran's letter layout. It is the arXiv source, not the paper as submitted to ACSAC, and the rule is right to flag it |
| barovox-acsac24 | `tex/claim-provenance` | 28 | sampled | percentages in the evaluation and discussion («81.38%», «90.51%» in `Chapters/08_Discussion.tex`) |
| rr-dataset-quality-acsac24 | `tex/claim-provenance` | 15 | sampled | percentages in the results («31.3%», «17%» in `Result.tex`) and one in the related work («60%») |
| leaking-queries-acsac25 | `tex/claim-provenance` | 25 | sampled | percentages in the experiments and the appendix («86%», «90%», «72%») |
| leaking-queries-acsac25 | `paper/section-word` | 1 | real | `\S\ref{subsec:results}` in `sections_full_version/discussion.tex`, where IEEE style writes «Section» |
| barovox-acsac24, llm-splained-acsac25, rr-dataset-quality-acsac24, secure-acsac24 | `paper/refs-checked` | 1 | known | the bibliography is the `.bib` each paper declares (`\bibliography`, `\addbibresource`), read where TeX reads it; the lint test never builds, so no build checked it |
| barovox-acsac24 | `bib/reachable-entry` | 92 | real / known | entries with no doi, url, arXiv id or `\url`: 55 are cited in the committed `paper.bbl` (real — the reader has nothing to follow), 37 are not cited (known: the rule judges every entry of the database, and bibtex prints only cited ones) |
| llm-splained-acsac25 | `bib/reachable-entry` | 55 | sampled | the same, over its three `bibs/*.bib`; its `paper.bbl` is biblatex's, so the count is not split by citation |
| rr-dataset-quality-acsac24 | `bib/reachable-entry` | 11 | real | all 11 are cited in `paper.bbl` (`chen2022neural`, `fu2022vulrepair`, …) |
| secure-acsac24 | `bib/reachable-entry` | 75 | real / known | 18 cited (real); 57 uncited — the paper's `references.bib` carries ACM's sample entries (`Kosiur01`, `JCohen96`), which it never cites (known, as above) |

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

## Where the body ends — the papers that are also built

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

## What size the text is set in — `body-size.json`

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

## The register band — AIDC's anchors are the ACSAC papers here

`tex/contrast-frames`, `tex/claim-emphasis` and `tex/relation-markers` judge a body against the band
its venue preset's anchors set. The five ACSAC papers are `paperlint:aidc`'s anchors (AIDC is ACSAC's
workshop, on its template, with no accepted papers of its own yet); the preset records each one's
words and counts, and `src/register-bands.test.ts` re-measures them from these sources and requires
the same numbers. The papers here extend `paperlint:ieee-conference`, which records no anchors, so
`accepted-papers.test.ts` sees none of the three rules; the same test file judges every ACSAC paper
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

## Licence rule — read before adding a paper

Only papers under **CC BY, CC BY-SA or CC0** may be added. The licence is the one the arXiv abstract
page states (or the publisher's rights form, for a paper whose author is ours). The arXiv default
licence ("non-exclusive licence to distribute") does **not** allow redistribution, and anonymising a
paper does not change that: copyright covers the wording, and removing the author names leaves the
wording. A rewrite keeping only the structure would drop the prose the rules are meant to be
tested on. Grow the corpus by finding more CC-licensed papers.

## Adding a paper

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
