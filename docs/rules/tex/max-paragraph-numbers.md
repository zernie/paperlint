# tex/max-paragraph-numbers

**Level:** warn · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body holding more than `max` numbers (default 8, so a ninth fires) in its running text. It reports once per paragraph, at its start. A number is what [`tex/claim-provenance`](claim-provenance.md) reads as one (`42`, `3.5`, `12,000`, `7%`, `2×`); a number inside math, and a plain year, are not counted.

Words and sentences are counted as [`tex/register`](register.md) counts them: a citation, a
cross-reference or inline math is one word. The rule reads the body's prose only: paragraphs, list
items and footnotes. A heading, a caption, a float, a table, code, a math environment and the
bibliography are not read.

## Why

A paragraph with nine figures is a table set as prose: a reader cannot hold them, and the two or three the argument turns on are lost among the rest. The ceiling mirrors an earlier ad hoc check, which blocked at 9 or more.

Measured with this rule's own counter on the accepted papers of `fixtures/accepted-papers/`
(p50 / p95 / p99 / max in the columns; one finding per paragraph or sentence over the default):

| paper                        | paragraphs | p50 | p95 | p99 | max | fires at the default |
| ---------------------------- | ---------: | --: | --: | --: | --: | -------------------: |
| `llm-splained-acsac25`       |        190 |   0 |   3 |   8 |  11 |                    1 |
| `secure-acsac24`             |        101 |   0 |   3 |   5 |   9 |                    1 |
| `barovox-acsac24`            |        101 |   0 |   6 |   8 |  10 |                    1 |
| `rr-dataset-quality-acsac24` |        117 |   0 |   8 |  12 |  30 |                    4 |
| `leaking-queries-acsac25`    |         99 |   0 |   3 |   6 |   6 |                    0 |
| pooled, the five IEEE papers |        608 |   0 |   5 |   9 |  30 |                    — |
| `agenticdev-acm26`           |         43 |   0 |   5 |   6 |   6 |                    0 |
| pooled, all six              |        651 |   0 |   5 |   9 |  30 |                    7 |

**The default is not quiet on accepted papers, by design.** It sits at the pooled percentile named
above, so it fires on the longest few percent of an accepted paper too. Every paper's findings are
recorded in its `baseline.json` (growth fails, a drop never does) and classified in
`fixtures/accepted-papers/README.md`. A level of `warn` is the right one for that: the rule points at
the places a reader is most likely to skim past, not at errors. The layout check found no reason for a
second default: the one two-column ACM paper has a longer median than the IEEE ones, but one paper
cannot set a per-layout ceiling, so a venue that wants its own sets `max` in its preset's `rules`.

## Examples

```latex
The run took 3 seconds, then 4, 5, 6, 7, 8, 9, 10 and 11 seconds.   % fires: 9 numbers, over 8

The run took 3 seconds; Table~\ref{t:runs} lists the other eight.      % passes
```

## Options / preset fields

`{ "max": 8 }` — an integer, the largest count that does not fire. Set it in `paperlint.json` under `rules`, or in a venue preset's `rules`.

## What it does not check

A number written as a word ("three"), a number in a table or caption (not prose), and the rendered length of the paragraph. A results section may need its numbers; this rule is switched off alone, without giving up the other two ceilings.

## How to fix

Put the numbers in a table and keep in the text the two or three the argument turns on.
