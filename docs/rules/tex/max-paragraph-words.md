# tex/max-paragraph-words

**Level:** off by default · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body longer than `max` words (default 150; 150 itself is allowed). It reports once
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
  "rules": { "tex/max-paragraph-words": ["warn", { "max": 150 }] }
}
```

or in one paper's own `paperlint.json`, for that paper alone. See
[optional rules](../../optional-rules.md).

## Why

A reader sees a paragraph's length before reading a word. A page-long block is skimmed past, and what
the argument turns on in the middle of it is lost. 150 is the wall the `grade-paper-writing` skill
names; it is a general default, not a venue's.

Measured with this rule's own counter on the accepted papers of `fixtures/accepted-papers/`
(p50 / p95 / p99 / max in words; one finding per paragraph over 150):

| paper                                     | layout          | paragraphs | p50 | p95 | p99 | max | over 150 |
| ----------------------------------------- | --------------- | ---------: | --: | --: | --: | --: | -------: |
| `llm-splained-acsac25` (ACSAC 2025)       | IEEE two-column |        190 |  44 | 132 | 151 | 174 |        2 |
| `secure-acsac24` (ACSAC 2024)             | IEEE two-column |        101 |  71 | 150 | 191 | 214 |        5 |
| `barovox-acsac24` (ACSAC 2024)            | IEEE two-column |        101 |  67 | 154 | 196 | 229 |        8 |
| `rr-dataset-quality-acsac24` (ACSAC 2024) | IEEE two-column |        117 |  50 | 209 | 262 | 431 |       12 |
| `leaking-queries-acsac25` (ACSAC 2025)    | IEEE two-column |         99 |  87 | 170 | 213 | 213 |       11 |
| pooled, the five IEEE papers              | IEEE two-column |        608 |  63 | 154 | 214 | 431 |       38 |
| `agenticdev-acm26` (AgenticDev '26)       | ACM sigconf     |         43 |  90 | 194 | 282 | 282 |        9 |
| pooled, all six                           |                 |        651 |  63 | 157 | 214 | 431 |       47 |

150 sits at the pooled 95th percentile of the five IEEE papers (154), so it is **not quiet on
accepted papers**: about one paragraph in twenty of an accepted paper is over it. That is why the
rule is off by default and why accepted papers are not in the rule's baseline. The one ACM paper has
a longer median (90 words against 63); one paper cannot set a ceiling, so a project that wants its
own number sets `max`.

## Examples

```latex
A paragraph of two hundred words that states the method, the three baselines, the metric,
the dataset, its size and its limits all in one block ...      % fires: over 150 words

The method has three parts.                                    % passes
```

## Options / preset fields

`{ "max": 150 }` — an integer, the largest paragraph that does not fire. No preset field.

## What it does not check

How wide the column is. The wall a reader meets is in the rendered PDF, where 150 words fill more of
a narrow two-column page than of a one-column one; the rule counts words, not lines. A paragraph that
is a list in disguise is counted as written. A sentence is split where `tex/register` splits it.

## How to fix

Split the paragraph where its topic turns. Move a list of cases into a list, numbers into a table,
detail into the appendix.
