# bib/reachable-entry

**Level:** warn · **Reads:** `paper.tex`, and `_build/sources.json` — the databases the last build's
bibtex opened, read through the bibtex reader

## What it catches

A bibliography entry with no `doi`, no `url` and no arXiv id: nothing a reader can follow. The entries
judged are those of the databases bibtex opened in the last build — TeX's own answer, recorded by
`paperlint build`, not a reading of the source for `\bibliography`.

## Why

Reviewer A on HotCRP #20 (2026-08-23): "not every entry has a DOI/link" — one paper had 0 of 47
entries reachable. Not "no doi": ICLR, NeurIPS and TMLR issue no DOIs at all (measured 2026-08-24),
so a url or an arXiv id counts.

## Examples

Reported on the entry's own line when the `.bib` bibtex opened is one TeX wrote from a `filecontents`
block of `paper.tex`; any other entry — a `.bib` file the author keeps, or a block in an included file —
at the top of `paper.tex`, with the entry's file, line and column first:

```bibtex
@book{lost2026, title = {A Book}, year = {2026}}
```

> refs.bib:12:1: `lost2026` has no doi, url or arXiv id — a reader has nothing to follow. If none
> exists, keep the exception with `% eslint-disable-next-line bib/reachable-entry -- <why>` above
> the entry

Not reported:

```bibtex
@article{a, doi = {10.1/x}}
@misc{b, url = {https://example.org}}
@misc{c, note = {arXiv:2310.05736}}
```

## Options / preset fields

None.

## What it does not check

- Whether the link resolves: that is the references check of `paperlint build`.
- `@string` and `@preamble`, which are not entries.
- A paper with no record of a build, or one changed since: the rule is silent, and
  [`paper/sources-fresh`](../paper/sources-fresh.md) says once that it was not built.
- A database bibtex found outside the paper directory, and an entry bibtex reads that the `.bib` reader
  does not (behind `%`, inside `@comment{…}`): that is the post-build check's.
- With `eslint --cache`, a change to a `.bib` alone does not re-run the rule: its findings depend on
  files other than `paper.tex`. `paperlint lint` does not cache.

## How to fix

Add the entry's `doi`, `url` or arXiv id. An entry that has none — a talk, a personal communication
— keeps its exception where it is written, on the line above the entry, in the block or in the
`.bib`:

```bibtex
% eslint-disable-next-line bib/reachable-entry -- an invited talk, no recording exists
@misc{smith2024talk, …}
```
