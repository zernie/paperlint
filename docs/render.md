# Building and looking at the paper

Three commands turn `paper.tex` into a PDF you can trust and pages you can read on a phone. None of
them judges the writing; they say whether the paper builds clean.

```sh
npx paperlint toolchain                                              # TeX Live with the venue's packages, once
npx paperlint build papers/my-paper                                  # the PDF and its facts
bash node_modules/paperlint/skills/render-paper/check-render.sh papers/my-paper   # the render gate
```

## The toolchain

`npx paperlint toolchain` installs TeX Live with exactly the packages the venue presets declare, and
banal (HotCRP's page-geometry script). `--check` reports what is missing and changes nothing. Where
it installs, what it needs and why: [toolchain.md](toolchain.md). The package list lives in the venue
presets (`presets/*.jsonc`, the `tex` block; `tex-base.jsonc` for every paper) and nowhere else: a
TeX Live without `libertine` builds an acmart paper green in Computer Modern, which is why the files
are checked, not the exit code.

## Compile

`npx paperlint build <paper-dir>` picks a TeX Live that has every package the venue declares,
runs pdflatex and bibtex until the references settle, fails on an undefined `\ref` or `\cite`
through `presets/tex/paper-guards.tex`, then measures the PDF into `_build/paper.facts.json` (fonts,
Type 3, the last page's column heights). It judges nothing; the lint rules read the facts file.
Without a terminal and without a qualifying TeX Live it stops with one line naming
`npx paperlint toolchain`.

## The render gate

An overfull box on page 9 (text or a table bleeding past the column into the margin) is invisible
on pages 1 and 2. LaTeX reports every one in the log, and `check-render.sh` turns them into an exit
code:

```sh
bash node_modules/paperlint/skills/render-paper/check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]
```

It compiles, then exits 1 on any `Overfull \hbox` at or over the threshold, any `Overfull \vbox`,
or any undefined reference, citation or control sequence. It warns on a literal space inside
`\texttt{…}` (failure 6 below). A paper renders clean when it exits 0. The usual fixes:

- a long `\texttt{…}`, a literal command or a URL: `\seqsplit{}`, `\url{}` (breakable), a `p{width}`
  table column instead of `l`, or `\small` / `\footnotesize` on the block;
- a wide table: `\small` and fixed-width `p{}` columns so cells wrap, or
  `\resizebox{\columnwidth}{!}{…}`.

## Known failures

1. **`pdfTeX error (font expansion): auto expansion is only possible with scalable fonts`.** acmart
   with microtype wants Libertine outlines. Add `\microtypesetup{expansion=false}` after
   `\documentclass`.
2. **`Undefined control sequence \lesssim` / `\gtrsim`.** Add `\usepackage{amssymb}`, or write `\le` /
   `\ge`.
3. **A bibliography in `\begin{filecontents*}[overwrite]{refs.bib}`** keeps the paper one file, and
   overwrites `refs.bib` on every build: fix a citation inside the block, never in `refs.bib`.
   Ignore the generated `refs.bib` in git so it cannot drift from the block.
4. **Double-blind.** ACM: `\documentclass[sigconf,review,anonymous]{acmart}`, author
   `Anonymous Author(s)`. `anonymity/identity` checks the built PDF against the paper's `identity`.
5. **Build files in git.** Ignore `*.aux *.log *.out *.bbl *.blg`; keep `paper.pdf` only if you mean to.
6. **A shell command in `\texttt{}` breaks at its inner space** (`rm` ⏎ `-rf`). The break is legal, so
   no overfull warning fires. Tie the command's tokens with `~` (`\texttt{rm~-rf~/}`) or wrap them in
   `\mbox{}`; the space before an argument may stay breakable.
7. **The page count comes from the built PDF, not from a label in the `.aux`.** An `.aux` label
   reflects the previous build's pagination. `format/page-limit` reads the body pages from the facts
   file of the current build.

## Pages as images

Drawing the pages needs [`@napi-rs/canvas`](https://www.npmjs.com/package/@napi-rs/canvas)
(`npm install --save-dev @napi-rs/canvas`); the PDF is read by `unpdf`, which paperlint already
installs (if it does not resolve from your project root, install it the same way). From the project root:

```sh
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';
const data = readFileSync('paper.pdf');
const { numPages } = await getDocumentProxy(new Uint8Array(data));
for (let p = 1; p <= numPages; p++)
  writeFileSync('p' + p + '.png', Buffer.from(await renderPageAsImage(new Uint8Array(data), p,
    { canvasImport: () => import('@napi-rs/canvas'), scale: 200 / 72 })));
console.log('rendered', numPages);
"
```

200 DPI reads on a phone; 150 is a quick preview, 300 a print check. Write the images outside the
repository. The render gate cannot see collisions inside a figure (a legend on an axis tick, TikZ
nodes overlapping), colour and legibility, or misaligned sub-figures: look at every page with a
figure.
