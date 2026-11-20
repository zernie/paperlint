# tex/max-paragraph-numbers

**Level:** off by default; in the opt-in set [`paperlint:writing`](../../optional-rules.md#the-writing-set-paperlintwriting) · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body with more than `max` numbers (default 10, so an eleventh fires). It reports once per paragraph, at its start, with the count and the paragraph's first words.

## How it counts

- Digits in the paragraph's prose: an integer, a decimal (`2.5`), a percentage (`30\%`), a number with thousands commas (`4,000`) and `3x` each count once. Digits glued to a letter before them (`v2`, `RQ1`) do not.
- Each `\num…` macro in the paragraph's prose counts once (`\num{7}`, `\numA`, `\numTotal`), because a consumer's registered numbers leave no digits in the parsed prose. The parser counts them where it reads the prose, so one inside inline math, on a commented-out line, or inside a footnote (a passage of its own, counted there) adds nothing to the paragraph. TeX's own `\number` and `\numberwithin` are not counted.
- A citation, a `\ref` and inline math are marks, not text: their keys and contents are never counted.
- A place typed by hand counts: `Section 4`, `Fig. 4`, `Tables 2 and 3` and `§4` each add their numbers. Write a place with `\ref`, which does not count.
- A year in prose counts like any other number.
- Scope: paragraphs, list items and footnotes of the body, as for [`tex/max-paragraph-words`](max-paragraph-words.md).

## Turning it on

The rule is registered and silent until a project turns it on. No call for papers states this limit,
so no venue preset carries the number. In the root `paperlint.json`, or in one paper's own:

```json
{
  "rules": { "tex/max-paragraph-numbers": ["warn", { "max": 10 }] }
}
```

See [optional rules](../../optional-rules.md).

## Why

A paragraph with many figures reads as a table written in prose; the reader cannot hold them.

The default is the 99th percentile per unit over the accepted real papers in
`fixtures/real-papers/accepted/` (96 papers with at least 2,500 body words, 7,994 paragraphs,
measured with this rule's counter). The author chose it on 2026-11-20.

| unit                  | accepted p95 | p99 | p99.9 | old default | default | units over the old default | papers quiet at the old default |
| --------------------- | -----------: | --: | ----: | ----------: | ------: | -------------------------: | ------------------------------: |
| numbers per paragraph |            5 |  10 |    19 |           8 |      10 |                      1.66% |                           49/96 |

A pilot on ICLR 2025 reviewer presentation scores (30 papers per side) found no link between numbers per paragraph and the score (inconclusive; Cliff's delta for the share of sentences over 55 words -0.12, CI [-0.39, +0.18]), so the default rests on what 99% of accepted units pass, not on reviewer evidence.

## Examples

```latex
In 2023 we saw 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 11 cases ...      % fires: eleven numbers
```

## Options / preset fields

`{ "max": 10 }` — an integer, the largest value that does not fire. No preset field.

## What it does not check

A number inside inline math (`$p<0.05$`, `$\num{9}$`) is not counted. A `\num…` macro inside the argument of a macro paperlint does not know (`\mymacro{\numA}`) is not prose and is not counted. A paragraph that is a list in disguise is counted as written.

## How to fix

Put the figures in a table and keep in the prose the ones the argument turns on.
