# tex/ref-list-same-number

**Level:** error · **Reads:** `paper.tex` and the files it includes → the last build's `paper.aux` (and the aux files `\include` writes)

## What it catches

A list of cross-references in which two different labels print the same number:

```latex
Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3} answer the questions.
```

typeset by IEEEtran as "Sections II-A, II-A and II-B answer the questions." when `sec:rq2` is a
`\label` inside the subsection `sec:check` names — for example a `\label` in a figure set before its
`\caption`, which takes the subsection's number. LaTeX says nothing: every label is defined once, so
neither "There were undefined references" nor "multiply defined" fires. The finding stands at the
later reference and names both labels and the number they share.

A **list** is a run of `\ref`, `\eqref`, `\cref`, `\Cref`, `\autoref`, `\Autoref`, `\vref` or `\Vref`
in one paragraph that the text between joins as one: only commas, _and_, _or_, _to_, `\&`, or a dash
(`\ref{a}--\ref{b}`, a range). Any other word, a citation, math or a full stop ends the list. One
`\cref{a,b}` is a list by itself; cleveref prints a number once when two of its labels share it
(measured: `\cref{sec:check,sec:rq2}` printed "section II-A").

`\cref` and `\autoref` print the kind of the place before its number, so two labels of different kinds
are two places: `\Cref{fig:a,tab:a}` printing "Figure 1 and table 1" is silent. Plain `\ref` prints no
kind: `Sections~\ref{sec:method} and~\ref{fig:a}` printing "Sections 1 and 1" fires.

## Why

The reader is told about two places and shown one number twice; the place one of the labels was
meant to name is lost. The defect reached a real paper's text and was caught only by a person
reading the PDF cold. The source reads correctly, so no review of the `.tex` sees it: only the build
knows what each label prints.

## Examples

```latex
Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}.   % fires when sec:check and sec:rq2 both print II-A
See \cref{sec:check,sec:rq2}.                                % fires: one number where two places were meant
Sections~\ref{sec:check} and~\ref{sec:rq3}.                  % silent: II-A and II-B
Section~\ref{sec:check}. Later, Section~\ref{sec:rq2}.       % silent: two sentences, not one list
Section~\ref{sec:check} and Figure~\ref{fig:x}.              % silent: the word "Figure" ends the list
```

## Options / preset fields

None.

## What it does not check

- Nothing before the paper is built by `paperlint build`, nor after the paper changed since its build:
  the numbers in the `.aux` belong to the text that was built. `paper/sources-fresh` says so once. A
  fresh build with no `paper.aux` is silent too.
- A label the build does not know (LaTeX's own "undefined references"), and the same label named twice
  in one list.
- `\pageref`, `\cpageref` and `\nameref`: they print a page or a title, not a number of a place.
- A list that names a section and its own subsection ("Sections IV and IV-A"): the numbers differ.
- References joined by anything other than the words above ("Section 2 as well as 3").

## How to fix

Move the `\label` to the place it should name — in a float, after its `\caption` — or, when two labels
really name the same place, reference it once.
