# pdf/venue-shape

**Level:** warn, optional (on where the venue preset turns it on) · **Reads:** `paper.tex` →
`paperlint.json` (the venue preset and its `shape`) and `_build/paper.facts.json` (the text of the
PDF `paperlint build` measured)

## What it catches

A built paper whose shape is unlike the shape of the papers its venue accepted:

- words before the references, figures, tables or references **below the lower quartile or above
  the upper quartile** of the venue's measured papers (`below`, `above`);
- an abstract **longer than 1.5 × the median** abstract, or shorter than the median ÷ 1.5
  (`above`, `below`; the factor is the `abstractFactor` option — issue #170's rule, folded in here);
- a measure the counter could not read in the paper's PDF — no «References» heading, no «Abstract»
  heading with an end on the first two pages, a bibliography that is not numbered (`unmeasured`);
- a measure fewer than eight of the venue's papers carry (`thin`), and a preset that carries no
  `shape` at all while the rule is on (`noShape`).

Each message names the paper's number, the venue's lower quartile, median, upper quartile and range,
how many papers they come from, which papers they are, and the day they were measured.

The five measures, all counted by one function on the text pdf.js reads from a PDF
(`src/domain/venue-shape.ts`):

| measure          | what is counted                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `body_words`     | tokens holding a letter before the references heading — the title, abstract, captions and table cells included; numbers and review line numbers not                                        |
| `figures`        | distinct numbers of «Figure N:» / «Fig. N.» captions, at the start of a line or glued to the words drawn inside the figure (pdf.js runs an axis label into the caption with no line break) |
| `tables`         | distinct numbers of lines opening «TABLE IV» / «Table 2»                                                                                                                                   |
| `abstract_words` | tokens holding a letter between the «Abstract» heading and the first «Index Terms», «Keywords», «CCS Concepts», «ACM Reference Format» or introduction heading, on the first two pages     |
| `references`     | the highest «[N]» opening a line after the references heading                                                                                                                              |

## Why

Reviewers read a paper against the papers they accepted last year, and a paper's shape is the first
thing they see of it: a results section told in tables where the venue's papers plot, ten thousand
words where they run to eight, an abstract half again as long as theirs. None of this is a rule of
the call for papers, so none of it fails a build. It is a difference worth knowing before
submitting, and the author decides what, if anything, to do about it — the rule warns, proposes a
place to look, and changes nothing.

**The venue's numbers come from the same counter as the paper's.** `scripts/measure-venue-shape.ts`
reads each accepted paper's PDF with pdf.js — the reader `paperlint build` uses — and runs the same
`shapeOf` on it; the preset stores one row per paper and the quartiles are derived from the rows on
every run, so no summary can drift from its data. A threshold borrowed from a figure someone else
counted differently would compare two different things.

**Checked on real accepted papers.** The MSR preset's 29 rows are the open PDFs of MSR 2025's
Technical Track (the last edition in the IEEE template MSR 2027 requires). An independent count of
the same 29 PDFs, with poppler's `pdftotext` and regular expressions, gave the same tables and
references on all 29; the same figures on 28 — the 29th has five captions, which pdf.js reads and
`pdftotext`'s text held four of; and abstracts within 13 words, except one whose abstract that count
did not find. Before figure captions glued to the figure's own words were counted, the counter found
4 of 8 captions on one of these papers: the line-start form alone is not enough on real PDFs.

**Quartiles, not the range.** By construction a quarter of the accepted papers sit past each
quartile, so a finding here is common, and every message says so. The range would warn only on
papers stranger than every accepted one — and with 29 papers, the range is set by two of them.

## Examples

An MSR paper with two figures and 9,346 words before its references:

> words before the references: 9346, above the upper quartile (8219) of MSR's accepted papers. Its 29
> measured papers: lower quartile 7604, median 7882, upper quartile 8219, range 6423–9302 (MSR 2025
> Technical Papers: the accepted full papers (10 to 13 pages) with an open PDF — arXiv preprints and
> authors' copies, not the proceedings' version, measured 2026-10-11). A quarter of accepted papers
> sit past each quartile, so this is a difference to weigh, not a requirement. Denser than most
> accepted papers at the same page limit; detail that could move to the artifact or an appendix is
> one option, smaller type is not.

> figures (numbered captions): 2, below the lower quartile (4) of MSR's accepted papers. Its 29
> measured papers: lower quartile 4, median 6, upper quartile 9, range 2–14 (…). A quarter of
> accepted papers sit past each quartile, so this is a difference to weigh, not a requirement. The
> venue's accepted papers show more of their results as figures; a table or a run of numbers that
> would read better as a plot is one place to look.

An abstract of 340 words:

> words in the abstract: 340, above 1.5 × the median (331.5) of MSR's accepted papers. Its 29
> measured papers: lower quartile 168, median 221, upper quartile 241, range 122–304 (…). The factor
> is a choice (the rule's `abstractFactor` option), so this is a difference to weigh, not a
> requirement. Longer than most accepted abstracts, which reviewers read first and skim.

An MSR paper with six figures, four tables, 7,900 words before its 56 references and a 220-word
abstract passes: every measure is inside the venue's band.

## Options / preset fields

| option           | default  | what it does                                                                                 |
| ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| `measures`       | all five | which measures are judged: `body_words`, `figures`, `tables`, `abstract_words`, `references` |
| `abstractFactor` | `1.5`    | the abstract's band is median ÷ factor … median × factor (at least 1)                        |

```json
{
  "rules": {
    "pdf/venue-shape": ["warn", { "measures": ["figures", "abstract_words"] }]
  }
}
```

From the preset: `shape` — `source` (which papers, in words; messages quote it), `url` (the accepted
list), `measured` (the day), and `papers`, one row per paper with its `url`, `pages` and the five
measures (a measure the counter could not read in that PDF is `null`). Written by
`node scripts/measure-venue-shape.ts <preset.jsonc> --corpus <corpus.json>` in paperlint's
repository; without `--corpus` it measures again the papers the preset already lists. A preset that
carries a `shape` turns the rule on in its `rules`; a child preset's `shape` replaces its parent's.

| preset          | `shape`                                           |
| --------------- | ------------------------------------------------- |
| `paperlint:msr` | 29 MSR 2025 Technical papers, measured 2026-10-11 |
| the others      | none — the rule is off for them                   |

## What it does not check

- **Whether a difference matters.** A paper with fewer figures than the venue's papers may be right
  to have them; the rule cannot tell, and does not try.
- **Strong papers against ordinary ones.** The rows are "accepted", award winners included. What
  separates the papers a venue rated highest from the rest is the `study-accepted-papers` skill's
  contrast-set step, read with judgement, not a count.
- **The proceedings' versions.** The rows are open copies — arXiv preprints, authors' pages — which
  may differ from the published paper by a page or a figure.
- **A caption set inside an image**, or a figure without a numbered caption: not text, not counted.
- **An author-year bibliography**: `references` is not counted, and says so.
- **A paper that is not built**, or built against another PDF: `pdf/measured` and `pdf/fresh` speak,
  and this rule is silent.

## How to fix

Read the finding as a question, not an instruction: is the difference one the paper should have?
If it is, leave it — or narrow the rule with `measures`, or set it `"off"` in the paper's
`paperlint.json`. If it is not, the hint names one place to look. Rebuild (`paperlint build`) and
lint again. To give a venue a shape, list its accepted papers' open PDFs in a corpus file and run the
script in paperlint's repository; `unmeasured` is fixed in the paper (a «References» heading, an
«Abstract» heading followed by keywords or the introduction), `thin` by adding papers to the corpus.
