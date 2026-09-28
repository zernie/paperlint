# tex/required-section

**Level:** error · **Reads:** `paper.tex`, and the preset its `paperlint.json` extends

## What it catches

A section the venue requires is missing, or is not where the venue requires it. The preset lists
the required sections by title in `required_sections`; the paper must have a `\section` or
`\section*` with exactly that title (whitespace collapsed), and, when the preset says
`position: "last"`, no section of the main text may come after it.

It only knows the sections a preset lists. A paper whose `paperlint.json` names no preset, or a
preset with no `required_sections`, gets no finding.

## Why

Some venues make a section mandatory and desk-reject without it. ACSAC's AI Usage Policy, which
its AIDC workshop applies (https://www.acsac.org/2026/submissions/ai/):

> If LLMs are used, authors must include a separate, clearly marked section titled "LLM Usage
> Statement" at the end of the paper. This section does not count towards the page limit.

> Failure to comply with these requirements is grounds for desk rejection without further review.

A common near miss is a bold paragraph in another venue's wording («Use of Generative AI.»): not a
section, and not that title.

**"If LLMs are used" is not something a rule can know, so the rule always requires the section for
a preset that lists it.** An author who used none says so in it («No LLMs were used in this
work.»).

## Examples

Under a preset with
`"required_sections": [{ "title": "LLM Usage Statement", "position": "last" }]`:

```latex
\paragraph{Use of Generative AI.} We used an LLM.   % fails: a paragraph, not a section
\section*{LLM usage statement}                      % fails: not the exact title
\section*{LLM Usage Statement}                      % passes, after the last section of the text
```

A missing section reports:

> aidc requires a section titled «LLM Usage Statement» and there is none — add
> `\section*{LLM Usage Statement}` (the title exactly; a bold paragraph does not count)

The right title in the wrong place — before the introduction — reports:

> «LLM Usage Statement» must close the paper at aidc, and the section «Introduction» comes after it
> — move it after the last section of the body (after the bibliography is fine)

## Preset field

No rule options. It reads `required_sections`; a child preset's list replaces its parent's:

```jsonc
"required_sections": [{ "title": "LLM Usage Statement", "position": "last" }]
```

`title` is compared exactly after collapsing whitespace — the venue's words are the contract.
`position: "last"` requires it after every section of the main text, which is every section before
`\appendix` and the bibliography (`\bibliography`, `\printbibliography`, `thebibliography`); after
the bibliography or an appendix is fine. Without `position`, anywhere will do.

## What it does not check

- Whether LLMs were used, or what the section says.
- Sections pulled in with `\input` or `\include`: the rule reads `paper.tex` alone.

## How to fix

Add `\section*{<the title>}` where the message says, with the content the venue asks for.
