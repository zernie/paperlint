# tex/venue-leftover

**Level:** warn · **Reads:** `paper.tex`, and the shipped venue presets

## What it catches

The paper mentions a venue other than the one set in its `paperlint.json`. Usually that is text
left over from an earlier submission: "Submission to VenueA 2026" in the author block of a paper
now going to VenueB.

It only knows the venues paperlint ships a preset for, by each preset's `name` and `aliases`. A
venue with no preset is not recognized.

It reads the whole paper — `paper.tex` with the files it `\input`s, `\include`s or `\subfile`s
spliced in; a name found in an included file is reported at that include, with the file and line at
the front of the message. It looks at what a reader sees — prose, the author block, captions, footnotes, a citation's note in
square brackets, and front-matter macros such as `\acmConference` — and ignores comments, citation
keys, labels, URLs (a `\url`, and the address of an `\href` — its link text is read), math, code and
the bibliography. Names are matched as whole words, case-sensitive.

A macro definition that names another venue — `\newcommand{\oldvenue}{VenueA}` — is reported at the
definition, whether or not the macro is used: the rule does not expand macros, so a use such as
`Submitted to \oldvenue` has no text of its own, and the definition is where the old name lives.

## Why

A reviewer reads the author block before the abstract. A line naming the previous venue tells them
the paper was written for somewhere else, and at a double-blind venue it can say more than that.
Nothing else compares what the source says about the venue with what the settings say.

## Examples

Under `"extends": "paperlint:realm"`, where the `agenticdev` preset's alias is `AgenticDev`:

```latex
\acmConference[AgenticDev '26]{Workshop on Agentic Development}  % warns: «AgenticDev»
As shown~\cite{agenticdev2025}.                                   % silent: a citation key
% AgenticDev draft                                                 % silent: a comment
```

The first line reports:

> «AgenticDev» names agenticdev, and this paper extends realm — a leftover from an earlier
> submission? A reviewer reads it before the abstract. Comments and citation keys are not
> reported; a sentence that names the other venue on purpose can keep it with a disable directive

The same line passes under `"extends": "paperlint:agenticdev"`: it names the paper's own venue.

## Preset fields

No rule options. It reads every shipped preset's `name` and `aliases`, collected along `extends`:

```jsonc
"aliases": ["AgenticDev"]
```

A name the paper's own chain also declares (two workshops of one parent conference) is never
reported.

```jsonc
"mentions": "with-year"
```

A venue whose name is also a common acronym counts only with a year beside the name: under
`paperlint:msr`, «First written for MSR 2027.», «MSR'27» and «MSR~2027» are reported, and
«Manual Speech Recognition (MSR)», «Microsoft Research (MSR)» or «MSR, in 2027» are not. Any
whole-word use counted for MSR at first, and an accepted ACSAC paper that defines «MSR» for itself
drew six warnings. Per preset, not hard-coded: a name that only a venue uses (`AgenticDev`) stays
reported with or without a year.

## What it does not check

- A venue no shipped preset describes.
- A name split by markup (`\textbf{AI}Sec`).
- A `with-year` venue named without a year («submitted to MSR»): the rule cannot tell it from the
  acronym.

## How to fix

Remove or replace the old venue's name. A sentence that names another venue on purpose keeps it
with ESLint's directive and the reason:

```latex
% eslint-disable-next-line tex/venue-leftover -- comparing with the venue that published [3]
Unlike AgenticDev, this workshop …
```
