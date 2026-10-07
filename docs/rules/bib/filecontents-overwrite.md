# bib/filecontents-overwrite

**Level:** error · **Reads:** `paper.tex` and the files it includes; the `.bib` of the same name,
and whether it is committed · **Fixable:** `--fix` when it loses nothing, else a suggestion

## What it catches

A `filecontents` block in `paper.tex`, or in a file it includes, that writes a `.bib` without
`[overwrite]` (or `[force]`):

```latex
\begin{filecontents*}{refs.bib}
@misc{a2024, …}
\end{filecontents*}
```

Only a live block counts: one in a comment or inside `\iffalse … \fi` is not a block. A block that
writes anything other than a `.bib` is not judged. A block in an included file is reported at the
`\input` that brings it in, with its file and line first (`bibblock.tex:1:1: …`).

## Why

LaTeX's `filecontents` writes its file only when no file of that name exists. LaTeX News 30:
_"by default nothing is written if a file with the given name exists anywhere in the search tree"_.
So a block without `[overwrite]` is the bibliography TeX reads only until a `refs.bib` exists, and
one exists after the first build: TeX writes it from the block, and from then on reads that file.
Edits to the block stop reaching the PDF, and a checkout with a committed `refs.bib` never reads the
block at all. Measured on TeX Live 2023 (`fixtures/paper-sources/v1-stale`, `tex-truth.json`): with
a `refs.bib` beside it, a cited entry that is only in the block comes out undefined.

With `[overwrite]` the block is written on every run, so it is what TeX reads on every machine, a
fresh checkout and a built working copy alike. That is also what paperlint's own bibliography checks
read (`paperSources`): the references check, `bib/reachable-entry`, `extract-ref-facts` and
`bib-authors` judge the block's entries.

## Examples

Reported:

```latex
\begin{filecontents*}{refs.bib}            % no option
\begin{filecontents}[nosearch]{refs.bib}   % [nosearch] does not overwrite either
```

> `\begin{filecontents*}{refs.bib}` has no `[overwrite]`: TeX writes refs.bib only when no file of
> that name exists, so once one does — from an earlier build, or committed — edits to this block stop
> reaching the PDF. `--fix` adds `[overwrite]`

When a committed `refs.bib` holds other entries than the block, the message says what TeX reads
today:

> TeX reads the committed refs.bib, not this block: the two hold different entries, and without
> `[overwrite]` TeX never writes the block over the file. `--fix` adds `[overwrite]`, which makes the
> block what TeX reads

Not reported:

```latex
\begin{filecontents*}[overwrite]{refs.bib}
\begin{filecontents*}[force]{refs.bib}
% \begin{filecontents*}{refs.bib}           % a comment, not a block
\begin{filecontents*}{data.csv}             % not a bibliography
```

## Options / preset fields

None.

## What it does not check

- Whether the paper declares the database the block writes (`\bibliography{refs}`): a block nothing
  declares is written and never read.
- A `refs.bib` left on this machine by an earlier build does not change the finding: it is about the
  committed bytes, the same on every machine. Whether the PDF of one build used the block is a fact
  of that build. The file only decides whether the fix is safe (below).
- With `eslint --cache`, a change to an included file alone does not re-run the rule; `paperlint
lint` does not cache.

## How to fix

`paperlint lint --fix` adds `[overwrite]` (into the option list when there is one:
`[overwrite,nosearch]`) — but only when that loses nothing: no file of the block's name exists in the
paper's directory, or the file holds the block's entries, `@string` and `@preamble` commands (TeX's
own copy from an earlier build).

When the file holds OTHER entries or commands — committed, or a local file such as a reference manager's
export — adding `[overwrite]` would write the block over it on the next build, so `--fix` leaves it
and the finding carries a suggestion instead, which your editor applies on request:

> Add `[overwrite]`: the next build writes this block over refs.bib, which holds other entries

Decide which one is the bibliography: keep the block and apply the suggestion (after saving the
file's entries you want into the block), or keep the file and delete the block. For a block in an
included file, add `[overwrite]` there.
