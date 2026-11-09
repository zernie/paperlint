# tex/ref-list-same-number

**Level:** error · **Reads:** `paper.tex` and the files it includes — the source only, no build

## What it catches

One reference list that prints the same number twice for two different labels:

```latex
\subsection{Check}\label{sec:check}                      % II-A
\textbf{Merged history.}\label{sec:rq2} We compared ...  % a run-in: steps no counter
\subsection{Other}\label{sec:rq3}                        % II-B
...
Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}   % prints "II-A, II-A and II-B"
```

A **reference list** is two or more `\ref`, `\autoref`, `\cref` or `\Cref` keys (`\cref{a,b}` is two)
in one sentence, joined by nothing but commas, "and", "or" and spaces (a tie `~` is a space). A full
stop, another word, a `\cite` or math ends it. The rule reports a key whose label takes the number of
the same step as an earlier, different key of its list — once per key, at that key's reference.

What a label takes its number from is read from the source: the heading, caption or counter command
that stepped last before it in its paragraph. A label right after a numbered heading takes the
heading's number. A label after a run-in — a bold, italic, small-caps or underlined phrase ending in
`.` or `:` that opens a paragraph (`\textbf{RQ2.}`), a starred heading, or a heading deeper than the
class numbers — takes the number of the step before it. How deep headings are numbered is the
`\setcounter{secnumdepth}{…}` in force at the heading (the preamble's, else the class's own default, then each change in the body, in document order), else the class's own default (`article`, `acmart` and
the rest: 3; `IEEEtran`: 4, or 3 with `technote` or `compsoc` with `conference`; `llncs`: 2;
`acmart` in its `acmcp` format: none), as each class file sets it. A numbered `\part` or `\chapter`
(`book`, `report`) steps a counter of its own, like a section; a starred one steps none.

Two keys of one `\cref{a,b}` or `\Cref{a,b}` are never reported against each other: cleveref prints an
equal number once inside a command (`cleveref.sty` lines 990–996 of
`fixtures/accepted-papers/rr-dataset-quality-acsac24`). `\cref{a}, \cref{b}` as separate commands are.

A finding in an included file is reported at its `\input` in `paper.tex`, with the file, line and
column at the front of the message.

## Why

`\label` records the number of the last `\refstepcounter`. A numbered heading, a caption and a
numbered environment step one; a bold phrase does not. So the label after `\textbf{Merged history.}`
prints the number of the subsection before it. That alone is harmless: the reader is sent to the
right section. It is a defect when one list prints the number twice: a paper's body said
`Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}` and the PDF printed **"Sections V-A, V-A
and V-B"**. Every label is defined once, so neither "undefined references" nor "multiply defined
labels" fires; a reader caught it, not a check.

## Examples

```latex
Sections~\ref{sec:check}, \ref{sec:rq2}.     % fails: rq2 is a run-in's label, it prints Check's number
\cref{sec:check}, \cref{sec:rq2}            % fails: the same, two commands
\cref{sec:check,sec:rq2}                     % passes: cleveref prints an equal number once inside one command
\ref{sec:third} and \ref{sec:starred}        % fails: \subsection*{…}\label{sec:starred} steps no counter
\ref{sec:rq2}, \ref{sec:rq2}                 % passes: one label twice is not two labels
See \ref{sec:rq2}. Then \ref{sec:check}.     % passes: two sentences
\ref{sec:rq2}                                % passes: a run-in's label cited alone
\ref{sec:check} in \ref{sec:rq2}             % passes: a word between them ends the list
```

The rule reports:

> \ref{sec:check} and \ref{sec:rq2} print the same number: sec:rq2 follows «Merged history.», which
> steps no counter, so it takes the number of \subsection «Check»

## Options / preset fields

None.

## What it does not check

- A label inside an environment (a float, a list, an equation, a theorem): it takes that
  environment's number and is not read, so a list that cites it is never judged.
- A label in running text with no run-in or heading in its paragraph (`we did X\label{x}`) or one
  defined twice: its number is unknown, and unknown is not the same.
- References in a caption, a float or a table, and `\eqref`, `\pageref`, `\nameref`.
- Macros of the author's own that wrap a heading or a reference, and `secnumdepth` set by a package
  or a class option other than the ones above.
- A heading that is numbered in the source but not by its class when the depth cannot be read (no
  class line, several behind a switch): it is taken as numbered.

## How to fix

Give the place a number of its own — make the run-in a numbered `\subsubsection` or `\paragraph`, or
a numbered environment — and put the label right after it. Or drop the label and refer to the place
in words ("the merged-history comparison in Section~\ref{sec:check}").

## Measured

The rule against the `.aux` of a real `pdflatex` run, where `\newlabel{key}{{<number>}…}` is what
`\ref` prints (2026-11-09, TeX Live 2026 from `paperlint toolchain`). Per list: the rule reports it
exactly when the `.aux` shows two different keys printing one number.

- A fake IEEEtran paper (`test/fixtures/ref-list-same-number/paper.tex`, one compile,
  `test/e2e/tex/ref-list-same-number.e2e.ts`, runs in CI): four lists with the bug (a run-in,
  two separate `\cref` commands, a starred heading, a heading deeper than `secnumdepth`) and the control
  lists; findings equal the `.aux`'s duplicates exactly.
- The six accepted papers in `fixtures/accepted-papers/` (one-off, not in CI):

| paper                        | compiled?                                                | ref lists | rule hits | `.aux` duplicates | disagreements |
| ---------------------------- | -------------------------------------------------------- | --------- | --------- | ----------------- | ------------- |
| `agenticdev-acm26`           | yes                                                      | 0         | 0         | 0                 | 0             |
| `barovox-acsac24`            | yes                                                      | 1         | 0         | 0                 | 0             |
| `leaking-queries-acsac25`    | yes                                                      | 0         | 0         | 0                 | 0             |
| `llm-splained-acsac25`       | no: `subfig`, `relsize`, `titlesec` not in the toolchain | 1         | 0         | no `.aux`         | not compared  |
| `rr-dataset-quality-acsac24` | yes                                                      | 4         | 0         | 0                 | 0             |
| `secure-acsac24`             | yes                                                      | 1         | 0         | 0                 | 0             |

Seven lists in all, none with a duplicate: real papers rarely contain the bug, which is why the
positive cases are in the fake one. The sources of this repository (110 `.tex` files besides the
fake paper; 11 lists) draw no finding.
