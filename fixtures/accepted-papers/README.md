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
| [`agenticdev-acm26/`](agenticdev-acm26/README.md) | AgenticDev '26 (ASE 2026) | CC BY 4.0 | `[sigconf,screen]{acmart}` |

## The test

`accepted-papers.test.ts` copies each paper under `papers/` in a temporary project, runs
`paperlint lint --json` through the CLI's own `run`, and compares the findings per rule with the
paper's `baseline.json`, using the reader in `../real-markdown-paper/baseline.ts`:

- a rule that reports **more** than recorded fails — a false positive until shown otherwise;
- a recorded rule that goes **fully quiet** fails — that is how a check dies unnoticed;
- a partial drop passes — that is what a fix looks like; lower the recording in the same change.

A new rule is measured here the day it is registered. The corpus is excluded from the npm tarball
(`!fixtures/accepted-papers` in `package.json`).

## What the rules say about the corpus

Every recorded finding, classified. **real** — the paper does what the rule reports, and the rule is
right to say so. **known** — a false positive, or a statement about the fixture rather than the
paper, left for a later change; one line each.

| paper | rule | n | kind | why |
| --- | --- | ---: | --- | --- |
| all three | `pdf/measured` | 1 | known | the fixtures are source only and never built, so the PDF rules cannot run; the rule says so, correctly |
| agenticdev-acm26 | `paper/refs-checked` | 1 | known | the same: the inline bibliography was never checked by `paperlint build` here |
| agenticdev-acm26 | `tex/claim-provenance` | 9 | real | numbers stated with no owner in the sentence ("The first is that the tool cuts output tokens by 65%.") — the paper reviewers called too informal |
| secure-acsac24 | `tex/claim-provenance` | 6 | real | the authors' own results stated without a subject or a pointer ("LLMs experience a significant decrease in accuracy, with a 5.44% drop …"); the owner is in a neighbouring sentence, which the rule does not read |
| secure-acsac24 | `tex/claim-provenance` | 1 | known | a range that defines a scale, not a result ("Typically set between 0 and 1, the temperature …") |
| agenticdev-acm26 | `tex/register` | 1 | real | 7 sentences open with _And_, _So_, _But_ or _Nor_ — 1.60 per 1000 words against a limit of 0.8; the two papers written by others read 0 |
| llm-splained-acsac25 | `paper/leading-zero` | 2 | real | probabilities written without the zero ("with probability greater than $.58$", and `.73`) in `sections/5-discussion.tex`; IEEE style, which the rule follows, asks for `0.58` — APA would omit it for a probability |
| llm-splained-acsac25 | `tex/claim-provenance` | 11 | real | the authors' own results in `sections/*.tex` stated without a subject or a pointer ("GPT errors exceeded 30% in both categories …"); the owner is in a neighbouring sentence. One ("ranged from 1 to 13") is in a list item, which the rules did not read before; one is in the reviews' disabled branch (below) |

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
