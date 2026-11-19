# tex/max-caption-words

**Level:** off by default · **Reads:** `paper.tex` and the files it includes

## What it catches

Two things, both a caption that is too long:

- a caption longer than `max` words (default 100, so a 101st word fires), reported at its `\caption`;
- a sentence of a caption longer than `maxSentence` words (default 40), reported at its start.

Captions sit in floats, outside the body every other prose rule reads, so without this rule nothing
counts their words. One rule with two options, as ESLint's `max-len` has `comments`: both findings
are a caption too long, and an author switches them off for the same reason.

## How it counts

- Every `\caption` a reader sees: its last mandatory argument, whatever optional argument
  (`\caption[Short]{…}`), star or space comes before it. Not one in a comment, in `verbatim` or in a
  macro's definition. A caption with no word is left out.
- Words and sentences as the body rules count them ([`tex/max-sentence-words`](max-sentence-words.md)):
  a citation, a cross-reference or a formula is one word; a bold label ending in a stop
  (`\textbf{Overview.}`) is a sentence of its own.

## Turning it on

```json
{
  "rules": {
    "tex/max-caption-words": ["warn", { "max": 100, "maxSentence": 40 }]
  }
}
```

No call for papers states a caption limit, so no venue preset carries the numbers. See
[optional rules](../../optional-rules.md).

## Why

A reader reads a caption in one pass with its figure. A caption that holds the method is a section
under a picture.

**Where 100 and 40 come from.** They are carried over unchanged from the prose counter this rule
replaced, where they were set from one paper's own four
captions. They are not calibrated on accepted papers. On the real-papers corpus (114 papers, the
files each build recorded spliced in), measured 2026-11-19 with this rule's counter:

|                             | captions over 100 words | caption sentences over 40 words |
| --------------------------- | ----------------------- | ------------------------------- |
| the 5 accepted ACSAC papers | 0                       | 0                               |
| all 114 papers              | 42, in 22 papers        | 108, in 34 papers               |

With both checks, 39 of the 114 papers fire at least once; as a default the rule would speak on
about one paper in three, so it ships off.

## Examples

```latex
\caption{Results. We ran each agent five times on every task, then ... (120 words)}   % fires
\caption{Pass rate by model; error bars are 95\% intervals.}                          % passes
```

## Options / preset fields

- `max`: the largest caption, in words, that does not fire; default 100.
- `maxSentence`: the largest caption sentence, in words, that does not fire; default 40.

No preset field.

## What it does not check

- Whether a long caption is needed: a self-contained legend of a dense table. Suppress that one with
  `% eslint-disable-next-line tex/max-caption-words`.
- A caption built by a macro (`\figcap{…}`), and text inside an included PDF figure.
- `\captionof` and `\subcaption`.
- An include the last build did not record: with no current `_build/sources.json`, the paper is
  `paper.tex` alone.

## How to fix

Move the method into the body and keep in the caption what the figure shows; cut a long caption
sentence where a clause could stand alone.
