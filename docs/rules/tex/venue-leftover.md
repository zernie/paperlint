# tex/venue-leftover

**Level:** warn · **Reads:** `paper.tex`, and the shipped venue presets

## What it catches

The text a reader sees names another shipped venue than the one the paper extends: that venue's
`name`, or one of its `aliases`, as a whole word, case-sensitive. "The text a reader sees" is prose,
the author block, footnotes, captions, and the preamble's front-matter macros (`\acmConference`,
`\acmBooktitle`).

## Why

A paper resubmitted to AIDC still said, on page 1, in its author block:

```latex
\institution{Submission to AISec 2026 @ ACM CCS --- double-blind review}
```

That was the previous venue, and a reviewer sees it before the abstract. The paper's
`paperlint.json` said `aidc`, and nothing compared what the source says about the venue with what
the settings say.

## Examples

Failing, under `"extends": "paperlint:aidc"`:

```latex
\institution{Submission to AISec 2026 @ ACM CCS --- double-blind review}
```

> «AISec» names aisec, and this paper extends aidc — a leftover from an earlier submission? A
> reviewer reads it before the abstract. Comments and citation keys are not reported; a sentence
> that names the other venue on purpose can keep it with a disable directive

(and a second finding for «ACM CCS».)

Passing — the same line under `"extends": "paperlint:aisec"`, and under any preset:

```latex
As shown~\cite{aisec2025}.   % AISec 2026 — a comment
\begin{thebibliography}{1}\bibitem{a} In Proc. AISec.\end{thebibliography}
```

## Options / preset fields

No rule options. It reads each preset's `name` and `aliases`, collected along `extends`:

```jsonc
"aliases": ["AISec", "ACM CCS"]
```

The shipped aliases: `aisec` AISec, ACM CCS · `agenticdev` AgenticDev · `realm` REALM, EMNLP ·
`aidc` AIDC, ACSAC. The families (`acm-sigconf`, `ieee-conference`) declare none. The names of the
paper's own chain are never reported, even when another venue shares one.

## What it does not check

- Comments, citation keys (`\cite`, `\citep`, biblatex's), `\label`/`\ref` keys, URLs, file names,
  math, code environments and the bibliography: excluded on the parse tree, not by a pattern.
- A venue no shipped preset describes, and a project's own presets other than the one the paper
  extends.
- A name split by markup (`\textbf{AI}Sec`), and text pulled in with `\input`.

## How to fix

Remove or replace the old venue's name. A sentence that names another venue on purpose («unlike
AISec, …») keeps it with ESLint's directive and the reason:

```latex
% eslint-disable-next-line tex/venue-leftover -- comparing with the venue that published [3]
Unlike AISec, this workshop …
```
