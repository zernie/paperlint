# tex/relation-markers

**Level:** warn · **Reads:** `paper.tex` and the files it includes → `paperlint.json`

## What it catches

A body that names how its sentences relate less often — or far more often — than the accepted papers
of its venue. A relation marker is one of: _therefore_, _thus_, _hence_, _consequently_, _as a
result_, _because_, _since_, _this means_, _this implies_, _which explains_, _in turn_, _that is,_,
_i.e._, _in contrast_, _by contrast_, _however_, _nevertheless_, _nonetheless_, _whereas_, _in other
words_, _for this reason_, _it follows_, _accordingly_, _specifically,_, _in particular,_, _for
example_, _for instance_, _e.g._ — as whole words, anywhere in a sentence. Counted per 10,000 words of
the body.

Outside the band it reports once, at the start of the body, with the count, the rate, the band and
the anchors' range. A body under 2 000 words, or a paper whose preset records no anchors, is not
judged.

This is the FLOOR among the register checks: [`tex/contrast-frames`](contrast-frames.md) and
[`tex/claim-emphasis`](claim-emphasis.md) catch a device used too often; this one catches the
relation left for the reader to infer, which is what a rewrite that only deletes devices leaves
behind.

## Why

A reviewer wrote: _"Readers are often required to infer the intended relationships between claims."_
Measured on the LaTeX source, per 10,000 words:

| paper                                                          | words | markers | per 10,000 |
| -------------------------------------------------------------- | ----: | ------: | ---------: |
| `rr-dataset-quality-acsac24` (ACSAC 2024)                      |  8130 |      32 |       39.4 |
| `barovox-acsac24` (ACSAC 2024)                                 |  7670 |      31 |       40.4 |
| `secure-acsac24` (ACSAC 2024)                                  |  7519 |      38 |       50.5 |
| `llm-splained-acsac25` (ACSAC 2025)                            |  9529 |      84 |       88.2 |
| `leaking-queries-acsac25` (ACSAC 2025)                         |  9133 |     103 |      112.8 |
| the paper reviewers called a blog post, as resubmitted to AIDC | 10476 |      20 |       19.1 |
| the same paper, before its rewrite                             |  6128 |       9 |       14.7 |
| `agenticdev-acm26` (ours, "too informal", ACM)                 |  4374 |      13 |       29.7 |

_However_ alone stands 6–11 times in every accepted paper and never in the resubmitted one. The
separation survives dropping any one marker from the list: with each of the 24 that occur removed in
turn, the lowest accepted paper stays at least 1.38 times the highest version of ours (the worst case
is dropping _however_). The list was fixed before this
corpus was measured (it is the one a register diagnosis of the same papers used, on text extracted
from PDFs, where the gap was narrow); on the parse tree the gap is twofold.

## Examples

```latex
Most guards match words. 24 of 46 block a harmless echo.                  % the relation is left to infer
Because most guards match words, 24 of 46 block a harmless echo.          % named
Most guards match words; as a result, 24 of 46 block a harmless echo.     % named
```

## Options / preset fields

No rule options. The band is the venue preset's `register.anchors`, exactly as for
[`tex/contrast-frames`](contrast-frames.md), which explains how it is derived. For `paperlint:aidc` it
is **25.4–135.0**.

## What it does not check

Whether a marker names the right relation, or a relation named another way (_this is why_, _so that_,
a colon). The list counts only words whose meaning does not depend on context; _since_ is on it and
is sometimes temporal.

## How to fix

Where two sentences stand side by side, say whether the second is the cause, the consequence, an
example or a limit of the first — with the word, not with a dash, a colon or a short sentence left to
land the point. The fix adds words; pay for them by moving detail to a table or the appendix, not by
cutting the connectives from another paragraph.
