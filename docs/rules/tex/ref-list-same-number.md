# tex/label-after-run-in

**Level:** error · **Reads:** `paper.tex` and the files it includes — the source only, no build

## What it catches

A `\label` that stands after a run-in heading in the same paragraph, so it takes the number of the
enclosing section instead of a number of its own. A run-in heading is either:

- a bold, italic, small-caps or underlined phrase ending in `.` or `:` that opens a paragraph
  (`\textbf{RQ2.}`, `\noindent\textit{Threats:}`) — the same phrase the prose rules leave out as a
  heading; the label may stand right after it, inside it, or later in its paragraph;
- a heading that steps no counter: a starred one (`\subsection*{…}`), or one deeper than the paper
  numbers — `\paragraph` in `article` and `acmart`, `\subsubsection` in `llncs`.

How deep headings are numbered is read from the source: its last `\setcounter{secnumdepth}{…}`,
else the class's own default (`article`, `acmart` and the rest: 3; `IEEEtran`: 4, or 3 with
`technote` or `compsoc` with `conference`; `llncs`: 2; `acmart` in its `acmcp` format: none, so
every label after a heading is reported), as each class file sets it. The finding names the heading whose number
the reference will print. A finding in an included file is reported at its `\input` in `paper.tex`,
with the file, line and column at the front of the message.

## Why

`\label` records the number of the last `\refstepcounter`. A numbered heading, a caption and a
numbered environment step one; a bold phrase does not. So

```latex
\subsection{Check}\label{sec:check}
...
\textbf{Merged history.}\label{sec:rq2} We also compared merged changes ...
```

makes `\ref{sec:rq2}` print the number of subsection "Check". A paper's body said
`Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}` and the PDF printed
**"Sections V-A, V-A and V-B"**. Every label is defined once, so neither "undefined references" nor
"multiply defined labels" fires; a reader caught it, not a check.

Measured on 2026-11-09 over one author's papers (68 `.tex` files that use `\ref`): a label right
after a `\textbf{…}` heading in 19 places in 2 papers, the same habit repeated across drafts; a
reference list printing one number twice, once. The symptom is rare and needs a build to see; the
cause is a habit, and the source alone shows it. On this repository's TeX (105 files, 43 of them
from accepted papers in `fixtures/accepted-papers/`), the 110 labels of the running text include
none after a run-in heading.

## Examples

```latex
\subsection{Check}\label{sec:check}            % passes: the subsection's own number
\textbf{Merged history.}\label{sec:rq2} We ... % fails: prints the number of «Check»
\textbf{RQ2.\label{sec:rq2}} We ...            % fails: the same, inside the phrase
\subsection*{Merged history}\label{sec:rq2}    % fails: a starred heading steps no counter
\label{sec:rq2}\textbf{RQ2.} We ...            % passes: before the run-in, in a new paragraph
\begin{figure}\caption{…}\label{fig:a}\end{figure}  % not read: inside an environment
```

The rule reports:

> \label{sec:rq2} follows «Merged history.», which steps no counter, so \ref{sec:rq2} prints the
> number of the enclosing \subsection «Check». Put the label on a numbered heading, a caption or a
> numbered environment, or refer to this place in words

## Options / preset fields

None.

## What it does not check

- A label inside an environment — a float, a list, an equation, a theorem: it takes that
  environment's number or the item's, and is not read.
- A label in running text with no run-in heading before it in its paragraph (`we did X\label{x}`).
  It also takes the enclosing number, but it is not the habit the rule is for, and often meant.
- Whether the label is referenced at all: an unreferenced one is reported too.
- Macros of the author's own that wrap a heading (`\rq{2}`), and `secnumdepth` set by a package or
  a class option other than the ones above.
- With no `\documentclass`, or several behind a switch, how deep headings are numbered is unknown:
  only the bold phrases and the starred headings are judged.

## How to fix

Give the place a number of its own — make the run-in a `\paragraph` the class numbers, a numbered
`\subsubsection`, or a numbered environment — and put the label right after it. Or drop the label
and refer to the place in words ("the merged-history comparison in Section~\ref{sec:check}").
