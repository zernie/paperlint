# tex/max-paragraph-numbers

**Level:** off by default · **Reads:** `paper.tex` and the files it includes

## What it catches

A paragraph of the body with more than `max` numbers (default 8, so a ninth fires). It reports once per paragraph, at its start, with the count and the paragraph's first words.

## How it counts

- Digits in the paragraph's prose: an integer, a decimal (`2.5`), a percentage (`30\%`), a number with thousands commas (`4,000`) and `3x` each count once. Digits glued to a letter before them (`v2`, `RQ1`) do not.
- Each `\num…` macro in the paragraph's source counts once (`\num{7}`, `\numA`, `\numTotal`), because a consumer's registered numbers leave no digits in the parsed prose. TeX's own `\number` and `\numberwithin` are not counted.
- A citation, a `\ref` and inline math are marks, not text: their keys and contents are never counted.
- A place named in words does not count: `Section 3.2`, `Sec. 3`, `Tables 2 and 3`, `Fig. 4`, `Appendix 1`, `§4`.
- A year in prose counts like any other number.
- Scope: paragraphs, list items and footnotes of the body, as for [`tex/max-paragraph-words`](max-paragraph-words.md).

## Turning it on

The rule is registered and silent until a project turns it on. No call for papers states this limit,
so no venue preset carries the number. In the root `paperlint.json`, or in one paper's own:

```json
{
  "rules": { "tex/max-paragraph-numbers": ["warn", { "max": 8 }] }
}
```

See [optional rules](../../optional-rules.md).

## Why

A paragraph with many figures reads as a table written in prose; the reader cannot hold them.

The default is a general one, not measured per venue. It has not been checked against the accepted
papers of `fixtures/accepted-papers/` in this version; the earlier draft of the issue recorded that
every accepted paper fires at least one of the two sibling ceilings, which is why both are off.

## Examples

```latex
In 2023 we saw 1, 2, 3, 4, 5, 6, 7, 8 and 9 cases ...      % fires: nine numbers
```

## Options / preset fields

`{ "max": 8 }` — an integer, the largest value that does not fire. No preset field.

## What it does not check

A number inside inline math (`$p<0.05$`) is not counted. A `\num…` macro standing before a paragraph's first word or after its last piece of text is not seen, because the macro is read from the source between the paragraph's first and last piece. A paragraph that is a list in disguise is counted as written.

## How to fix

Put the figures in a table and keep in the prose the ones the argument turns on.
