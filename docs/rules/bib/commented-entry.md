# bib/commented-entry

**Level:** warn · **Reads:** `paper.tex`, and the bibliography TeX reads for it — the
`filecontents` block, or the `.bib` files `\bibliography` and `\addbibresource` name

## What it catches

A bibliography entry written behind `%`, as if commented out:

```bibtex
% @misc{dead2020, title = {An Old Entry}}
```

## Why

bibtex has no comment character. Outside an entry it skips everything up to the next `@`, so the
`%` is skipped as text and the entry after it is read like any other — and a `%` at the start of
each line INSIDE an entry becomes part of its fields. Measured with bibtex 0.99d
(`fixtures/paper-sources/v5-percent-entry`, `tex-truth.json`): the `%`-prefixed `dead2020` is in the
`.bbl`, and bibtex reports `to sort, need author or key in dead2020` because its `author` field was
eaten. LaTeX's own `%` and the ESLint view of the file both read the line as a comment, so the entry
is invisible exactly where an author looks.

paperlint's bibliography checks read the entry as bibtex does, so this rule says why an entry the
author believes is gone still shows up in their findings.

## Examples

Reported (at the `%`):

```bibtex
% @misc{dead2020, title = {An Old Entry}}
  %% @article{old, title = {X}}
```

> `dead2020` is behind `%`, and bibtex has no comment character: it reads this entry anyway, and a `%`
> inside an entry corrupts its fields. Delete the entry, or remove its `@` so bibtex skips it as text

Not reported: a `%` line that holds no `@` (a note, a disable directive), and an entry with no `%`
before it.

## Options / preset fields

None.

## What it does not check

- A `%` inside an entry that does not start it (`title = {50% of …}`): bibtex reads that as text of
  the field.
- `@comment{…}`: bibtex skips the word `comment` and reads what follows as junk, so an entry inside
  its braces is read too — not reported.

## How to fix

Delete the entry, or remove its `@` (`% misc{dead2020, …}`) so bibtex skips it as text. An entry kept
on purpose takes `% eslint-disable-next-line bib/commented-entry -- <why>` on the line above.
