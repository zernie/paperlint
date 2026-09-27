# tex/required-section

**Level:** error · **Reads:** `paper.tex`, and the preset its `paperlint.json` extends

## What it catches

A section the venue preset lists in `required_sections` is missing — there is no `\section` or
`\section*` whose title equals it once whitespace is collapsed — or, for `position: "last"`, a
section of the body comes after it.

## Why

Some venues make a section mandatory and desk-reject without it. AIDC applies the ACSAC AI Usage
Policy (https://www.acsac.org/2026/submissions/ai/):

> If LLMs are used, authors must include a separate, clearly marked section titled "LLM Usage
> Statement" at the end of the paper. This section does not count towards the page limit.

> Failure to comply with these requirements is grounds for desk rejection without further review.

The paper this was built for carried a bold paragraph «Use of Generative AI.» after the
bibliography — what its previous venue asked for, and exactly the shape that does not meet this:
not a section, not that title.

**"If LLMs are used" is not something a rule can know, so the rule always requires the section for
a preset that lists it.** An author who used none writes that in it («No LLMs were used in this
work.»).

## Examples

Failing, under `"extends": "paperlint:aidc"`:

```latex
\bibliography{refs}
\paragraph{Use of Generative AI.} We used an LLM to polish the prose.
\end{document}
```

> aidc requires a section titled «LLM Usage Statement» and there is none — add
> `\section*{LLM Usage Statement}` (the title exactly; a bold paragraph does not count)

```latex
\section*{LLM Usage Statement}
No LLMs were used.
\section{Introduction}
```

> «LLM Usage Statement» must close the paper at aidc, and the section «Introduction» comes after it
> — move it after the last section of the body (after the bibliography is fine)

Passing — after the last section of the body, before or after the bibliography, before or after an
appendix:

```latex
\section{Conclusion}
…
\section*{LLM Usage Statement}
No LLMs were used.
\bibliography{refs}
```

## Options / preset fields

No rule options. It reads the preset's `required_sections`:

```jsonc
"required_sections": [{ "title": "LLM Usage Statement", "position": "last" }]
```

`title` is compared exactly, after collapsing whitespace — the venue's words are the contract, so
«LLM usage statement» does not count. `position: "last"` requires it after every section of the
body; the body is every section before `\appendix` and the bibliography (`\bibliography`,
`\printbibliography`, `thebibliography`). Without `position`, anywhere will do. A child preset's
list replaces its parent's.

## What it does not check

- Whether LLMs were used (see Why).
- What the section says.
- Sections pulled in with `\input` or `\include`: the rule reads `paper.tex` alone.
- A paper that names no preset, or a preset with no `required_sections`: silent.

## How to fix

Add `\section*{<the title>}` where the message says — for AIDC, after the conclusion or after the
bibliography, with what LLMs did in the work, or that none were used.
