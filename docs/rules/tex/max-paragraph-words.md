# tex/max-paragraph-words

**Level:** warn · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body longer than `max` words (default 150). It reports once per paragraph, at its start, with the word count and the paragraph's first words.

Words and sentences are counted as [`tex/register`](register.md) counts them: a citation, a
cross-reference or inline math is one word. The rule reads the body's prose only: paragraphs, list
items and footnotes. A heading, a caption, a float, a table, code, a math environment and the
bibliography are not read.

## Why

A reader sees a paragraph's length before reading a word. A page-long block is skimmed past, and what the argument turns on in the middle of it is lost. The ceiling mirrors the one an earlier ad hoc check applied by hand, `150`; it is also the wall named by the `grade-paper-writing` skill.

Measured with this rule's own counter on the accepted papers of `fixtures/accepted-papers/`
(p50 / p95 / p99 / max in the columns; one finding per paragraph or sentence over the default):

| paper                                     | paragraphs | p50 | p95 | p99 | max | fires at the default |
| ----------------------------------------- | ---------: | --: | --: | --: | --: | -------------------: |
| `llm-splained-acsac25` (ACSAC 2025)       |        190 |  44 | 132 | 151 | 174 |                    2 |
| `secure-acsac24` (ACSAC 2024)             |        101 |  71 | 150 | 191 | 214 |                    5 |
| `barovox-acsac24` (ACSAC 2024)            |        101 |  67 | 154 | 196 | 229 |                    8 |
| `rr-dataset-quality-acsac24` (ACSAC 2024) |        117 |  50 | 209 | 262 | 431 |                   12 |
| `leaking-queries-acsac25` (ACSAC 2025)    |         99 |  87 | 170 | 213 | 213 |                   11 |
| pooled, the five IEEE papers              |        608 |  63 | 154 | 214 | 431 |                    — |
| `agenticdev-acm26` (AgenticDev '26)       |         43 |  90 | 194 | 282 | 282 |                    9 |
| pooled, all six                           |        651 |  63 | 157 | 214 | 431 |                   47 |

**The default is not quiet on accepted papers, by design.** It sits at the pooled percentile named
above, so it fires on the longest few percent of an accepted paper too. Every paper's findings are
recorded in its `baseline.json` (growth fails, a drop never does) and classified in
`fixtures/accepted-papers/README.md`. A level of `warn` is the right one for that: the rule points at
the places a reader is most likely to skim past, not at errors. The layout check found no reason for a
second default: the one two-column ACM paper has a longer median than the IEEE ones, but one paper
cannot set a per-layout ceiling, so a venue that wants its own sets `max` in its preset's `rules`.

## Examples

```latex
A paragraph of two hundred words that states the method, the three baselines, the metric,
the dataset, its size and its limits all in one block …      % fires: 200 words, over 150

The method has three parts.                               % passes
```

## Options / preset fields

`{ "max": 150 }` — an integer, the largest paragraph that does not fire (the ceiling is inclusive: 150 words is allowed). Set it per paper in `paperlint.json`: `"rules": { "tex/max-paragraph-words": ["warn", { "max": 180 }] }`, or per venue in the preset's `rules`.

## What it does not check

How wide the column is. The wall a reader meets is in the rendered PDF, where 150 words fill more of a narrow two-column page than of a one-column one; the rule counts words, not lines. A paragraph that is a list in disguise is counted as written.

## How to fix

Split the paragraph where its topic turns. Move a list of cases into a list, numbers into a table, detail into the appendix.
