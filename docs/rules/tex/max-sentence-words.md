# tex/max-sentence-words

**Level:** warn · **Reads:** `paper.tex` and the files it includes

## What it catches

A sentence of the body longer than `max` words (default 55). It reports once per sentence, spanning it, with the word count and the first words.

Words and sentences are counted as [`tex/register`](register.md) counts them: a citation, a
cross-reference or inline math is one word. The rule reads the body's prose only: paragraphs, list
items and footnotes. A heading, a caption, a float, a table, code, a math environment and the
bibliography are not read.

## Why

A sentence is read in one breath; past about fifty words it carries more than one claim and the reader loses the subject. The ceiling mirrors an earlier ad hoc check, `55`.

Measured with this rule's own counter on the accepted papers of `fixtures/accepted-papers/`
(p50 / p95 / p99 / max in the columns; one finding per paragraph or sentence over the default):

| paper                        | sentences | p50 | p95 | p99 | max | fires at the default |
| ---------------------------- | --------: | --: | --: | --: | --: | -------------------: |
| `llm-splained-acsac25`       |       454 |  20 |  40 |  61 |  94 |                    5 |
| `secure-acsac24`             |       368 |  20 |  34 |  43 |  59 |                    1 |
| `barovox-acsac24`            |       400 |  19 |  32 |  43 |  74 |                    2 |
| `rr-dataset-quality-acsac24` |       368 |  21 |  42 |  58 |  68 |                    5 |
| `leaking-queries-acsac25`    |       441 |  19 |  36 |  62 | 119 |                    6 |
| pooled, the five IEEE papers |      2031 |  20 |  37 |  54 | 119 |                    — |
| `agenticdev-acm26`           |       171 |  24 |  49 |  68 |  85 |                    5 |
| pooled, all six              |      2202 |  20 |  39 |  57 | 119 |                   24 |

**The default is not quiet on accepted papers, by design.** It sits at the pooled percentile named
above, so it fires on the longest few percent of an accepted paper too. Every paper's findings are
recorded in its `baseline.json` (growth fails, a drop never does) and classified in
`fixtures/accepted-papers/README.md`. A level of `warn` is the right one for that: the rule points at
the places a reader is most likely to skim past, not at errors. The layout check found no reason for a
second default: the one two-column ACM paper has a longer median than the IEEE ones, but one paper
cannot set a per-layout ceiling, so a venue that wants its own sets `max` in its preset's `rules`.

## Examples

```latex
The harness runs every task, records the tokens, the cost and the outcome, compares them with the
baseline, which was run last month, and then, if the difference is significant, flags it …   % fires if over 55 words
```

## Options / preset fields

`{ "max": 55 }` — an integer, the largest sentence that does not fire. Set it in `paperlint.json` under `rules`, or in a venue preset's `rules`.

## What it does not check

How hard a short sentence is to read, and sentences that a list or a footnote splits. A sentence is split where `tex/register` splits it, so an unusual abbreviation can cut one in two.

## How to fix

Cut the sentence where it changes subject or adds a second claim.
