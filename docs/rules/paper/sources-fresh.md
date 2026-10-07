# paper/sources-fresh

**Level:** warn · **Reads:** `paper.tex` and `_build/sources.json` · **Reported on:** the first line of
`paper.tex`

## What it catches

The paper has no usable record of the last build, so paperlint does not know which files TeX reads for
it. One finding, in one of three forms:

- **not built** — there is no `_build/sources.json`;
- **unreadable** — the file is not JSON, is of another schema number, or does not have the shape of
  schema 1;
- **stale** — a file the build read has other bytes now, was deleted, or appeared where the build saw
  none. The message names each: `sections/intro.tex edited, refs.bib deleted`.

## Why

`paperlint build` asks TeX itself which files it read (`pdflatex -recorder`) and which databases bibtex
opened, and writes the answer, with a SHA-256 of every file, to `_build/sources.json`. Nothing in
paperlint answers "which files make up this paper" or "which bibliography does it use" by reading the
TeX source: `\input` behind a macro, a `.bib` written by `filecontents`, a database named by a
switch are TeX's to decide, and TeX has already decided.

The rules that need that answer — the ones over the bibliography, and the prose rules over the files
`paper.tex` includes — read the record. With no record, or one about an earlier paper, they would
judge files that are not the paper's, so they stay silent, and this rule speaks once in their place.
Without it a paper that was never built would lint clean because nothing was looked at.

## Examples

Failing — a paper that was never built:

```text
papers/my-paper/paper.tex
  1:1  warning  the paper has not been built — run `npx paperlint build`, which records the files TeX
                reads. Until it has, the files `paper.tex` includes are not linted, and the rules that
                read the bibliography say nothing
                paper/sources-fresh
```

Failing — `sections/intro.tex` was edited after the last build:

```text
papers/my-paper/paper.tex
  1:1  warning  the paper changed since the last build (sections/intro.tex edited) — run `npx paperlint
                build`; until then the files `paper.tex` includes are not linted, and the rules that
                read the bibliography say nothing
                paper/sources-fresh
```

Passing: a paper whose files are byte for byte what the last build read. Editing a file TeX did not
read (a figure source the paper does not include, a note beside it) changes nothing.

## Options / preset fields

No rule options. The level is `warn` for every paper; set it in the paper's `paperlint.json`:

```json
{ "rules": { "paper/sources-fresh": "error" } }
```

`error` suits a CI job that builds first; `off` suits one that only lints and would rather not hear it.

## What it does not check

- That the build was clean. A record is written after a build whose pdflatex and bibtex runs ended;
  what they reported is `paper/refs-checked`'s and the build's own.
- Files TeX never read. A file the paper does not include is not in the record, so its edits are not
  changes, and it is not linted.
- A file edited in an editor and not saved: the rule compares the bytes on disk with the record.
- `.bib` files TeX wrote itself (`filecontents`): their bytes are the block's, which is in a file the
  record hashes.

## How to fix

Build the paper again; the record is rewritten from the files as they are:

```sh
npx paperlint build papers/my-paper
```
