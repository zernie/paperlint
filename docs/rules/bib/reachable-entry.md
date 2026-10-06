# bib/reachable-entry

**Level:** warn · **Reads:** `paper.tex`, and the bibliography TeX reads for it — the
`filecontents` block, or the `.bib` files `\bibliography` and `\addbibresource` name

## What it catches

A bibliography entry with no `doi`, no `url` and no arXiv id: nothing a reader can follow.

## Why

Reviewer A on HotCRP #20 (2026-08-23): "not every entry has a DOI/link" — one paper had 0 of 47
entries reachable. Not "no doi": ICLR, NeurIPS and TMLR issue no DOIs at all (measured 2026-08-24),
so a url or an arXiv id counts.

## Examples

Reported, in a block of `paper.tex` on the entry's own line; in a `.bib` file at the
`\bibliography` that names it, with the entry's file, line and column first:

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
- When which databases TeX reads depends on a switch (`\ifanon\bibliography{anon}\else…`) or a
  macro, every candidate is judged.
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
