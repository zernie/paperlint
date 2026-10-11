# Venue shape — a paper's words, figures, tables, abstract and references against its venue's accepted papers

Status: **built** on branch `claude/venue-shape` (2026-10-11): `src/domain/venue-shape.ts`,
`src/venue-shape-rule.ts` (`pdf/venue-shape`), `scripts/measure-venue-shape.ts`, the `shape` and
`accepted` blocks of `presets/venue-profile.schema.json`, the MSR preset's data. Issues: #170 (the
abstract rule this generalises), #200 (the contrast-set step of `study-accepted-papers`, which
reads the same venue data).

## 1. The defect, and its class

"Is this abstract much longer than the abstracts this venue accepts?" (#170) was answered downstream
by a local rule that read a median, by regular expression, out of a sentence in a per-paper notes
file. The number was prose: nothing validated it, it stayed when the paper changed venue (a stand-in
from the previous venue, labelled by hand), and every paper had to write the sentence and the regex
again. The same happened to figures per paper, words per paper and references per paper: a
measurement of the venue's accepted papers, written as a sentence, compared by hand.

**The class:** a fact about a venue, measured once, held as prose where a check needs data — and,
worse, measured by a different counter than the one applied to the paper. Fixing the abstract alone
would leave the figures and the words in prose.

## 2. Decisions

| question                                       | chosen                                                                                                            | rejected, and why                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| what is counted, the paper's LaTeX or its PDF? | **the PDF's text**, as pdf.js reads it (`pages_text` in the facts file)                                           | LaTeX source: the register anchors do this, and it needs every accepted paper's source. A venue's accepted papers are public as PDFs; their sources mostly are not. One counter on PDFs measures both sides. |
| what does the preset store?                    | **one row per accepted paper**; the quartiles are derived on every run                                            | stored quartiles: a summary that can drift from the rows, and a row added by hand would not move it. The register anchors set the same precedent (rows, band derived).                                       |
| where does the venue's data live?              | **the venue preset** (`shape`), so a paper reaches it through `extends`; a project's own preset may carry its own | a per-paper data file: the shape is a property of the venue, and a per-paper copy goes stale exactly as #170's sentence did                                                                                  |
| one rule or one per measure?                   | **one rule**, `pdf/venue-shape`, a `measures` option to narrow it                                                 | `tex/abstract-length` plus four siblings: one requirement ("looks like a paper this venue accepts"), five reasons to switch off are served by the option                                                     |
| the band                                       | **the interquartile range**, two-sided; the abstract at median ÷ / × factor (1.5, #170)                           | the range: set by the two most unusual of ~30 papers, it warns on almost nothing. A ceiling only: the repository's first writing principle — a check with only a ceiling pushes toward a blog post           |
| severity                                       | **warn**, optional, turned on by a preset that has data                                                           | error: a quarter of accepted papers sit past each quartile by construction; this is a difference to weigh                                                                                                    |
| who writes the data?                           | **`scripts/measure-venue-shape.ts`**, from a corpus of PDF URLs, into the JSONC on its syntax tree                | by hand: a number no command produced                                                                                                                                                                        |

Author in the loop (`docs/design/author-in-the-loop.md`, on its own branch until it merges): the rule reports and proposes
a place to look; it never edits the paper and never says the paper must change. Which differences
matter is the author's call.

## 3. What the counter is, and how it was checked

Five measures on a PDF's text (the rule page has the table): words before the references heading,
distinct figure captions, distinct table captions, abstract words, the last numbered reference. A
measure the counter cannot read is `null` and reported as such, never zero.

Checked on the 29 MSR 2025 PDFs against an independent count (poppler's `pdftotext` and regular
expressions): tables and references equal on all 29; figures equal on 28 after one fix — pdf.js runs
the words drawn inside a figure into its caption without a line break (`…CorrectionFig. 8:`), and the
line-start form alone read 4 of 8 captions on one paper; the 29th paper has five captions, of which
`pdftotext`'s text held four. Two small builds, IEEEtran and acmart in review mode, are committed in
`fixtures/venue-shape/` with their shapes stated in their sources.

## 4. The `accepted` block

Where the venue's accepted papers are, as data the `study-accepted-papers` skill reads instead of
re-deriving each run: the accepted list per edition (`{year}` template), the DBLP stream, the editions
and the template each used, the proxies for a strong review score with their limits, and what blocks
automated access. No rule reads it. Filled for MSR; `{}` in the other venues, which the skill treats
as "ask the author, then propose the block as a patch".

## 5. Not done, on purpose or for later

- **A consumer command.** The script runs from paperlint's checkout. A consumer with its own venue
  preset cannot run it from `node_modules` (Node does not strip types there); a shipped entry point
  is left for an issue rather than a new verb designed in passing.
- **Strong vs ordinary.** The rows are "accepted"; the separating levers are the skill's job (#200),
  with judgement and counts, not a rule.
- **Other venues' data.** Only MSR is measured. AgenticDev, AISec, AIDC and REALM wait for a corpus.
