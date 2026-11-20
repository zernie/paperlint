# tex/max-paragraph-words

**Level:** off by default; in the opt-in set [`paperlint:writing`](../../optional-rules.md#the-writing-set-paperlintwriting) · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body longer than `max` words (default 250; 250 itself is allowed). It reports once
per paragraph, at its start, with the word count and the paragraph's first words.

Words are counted as [`tex/register`](register.md) counts them: a citation, a cross-reference or
inline math is one word. The rule reads the body's prose only: paragraphs, list items and footnotes.
A heading, a caption, a float, a table, code, a math environment and the bibliography are not read.

## Turning it on

The rule is registered and silent until a project turns it on. No call for papers states a paragraph
limit, so no venue preset can carry the number; it is a project's own choice. In the root
`paperlint.json`, for every paper:

```json
{
  "rules": { "tex/max-paragraph-words": ["warn", { "max": 250 }] }
}
```

or in one paper's own `paperlint.json`, for that paper alone. See
[optional rules](../../optional-rules.md).

## Why

A reader sees a paragraph's length before reading a word. A page-long block is skimmed past, and what
the argument turns on in the middle of it is lost.

The default is the 99th percentile per unit over the accepted real papers in
`fixtures/real-papers/accepted/` (96 papers with at least 2,500 body words, 7,994 paragraphs,
measured with this rule's counter). The author chose it on 2026-11-20.

| unit            | accepted p95 | p99 | p99.9 | old default | default | units over the old default | papers quiet at the old default |
| --------------- | -----------: | --: | ----: | ----------: | ------: | -------------------------: | ------------------------------: |
| paragraph words |          184 | 252 |   344 |         150 |     250 |                     10.02% |                            0/96 |

A pilot on ICLR 2025 reviewer presentation scores (30 papers per side) found no link between long sentences or paragraphs and the score (inconclusive; Cliff's delta for the share of sentences over 55 words -0.12, CI [-0.39, +0.18]), so the default rests on what 99% of accepted units pass, not on reviewer evidence.

## Examples

```latex
A paragraph of three hundred words that states the method, the three baselines, the metric,
the dataset, its size and its limits all in one block ...      % fires: over 250 words

The method has three parts.                                    % passes
```

## Options / preset fields

`{ "max": 250 }` — an integer, the largest paragraph that does not fire. No preset field.

## What it does not check

How wide the column is. The wall a reader meets is in the rendered PDF, where 250 words fill more of
a narrow two-column page than of a one-column one; the rule counts words, not lines. A paragraph that
is a list in disguise is counted as written. A sentence is split where `tex/register` splits it.

## How to fix

Split the paragraph where its topic turns. Move a list of cases into a list, numbers into a table,
detail into the appendix.
