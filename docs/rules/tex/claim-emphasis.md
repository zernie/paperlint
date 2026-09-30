# tex/claim-emphasis

**Level:** warn · **Reads:** `paper.tex` and the files it includes → `paperlint.json`

## What it catches

A body that sets its claims in bold inside running sentences more often than the accepted papers of
its venue do. A claim in bold is a `\textbf{…}` (or `{\bfseries …}`, `{\bf …}`) that:

- stands **inside** a sentence — not opening a paragraph or a list item, where bold is a label
  (`\textbf{Varying the volume}. We …`, `\item \textbf{A corpus of questions}: …`), braces around it
  or not; and
- **states** rather than names: six words or more, or holding a number
  (`\textbf{median coverage is 2.5/10}`, `\textbf{they react to the dangerous word}`).

A term in bold (`\textbf{Pressure-Acoustic Transformation (PAT)}`), italics and `\emph`, headings,
run-in headings, captions, tables and figures are not counted. Counted per 10,000 words of the body.

Above the band it reports once at the start of the body, then once at every claim in bold, where it
stands. Below the band it reports once. A body under 2 000 words, or a paper whose preset records no
anchors, is not judged.

## Why

Setting a finding in bold is how a post makes a point land; an accepted paper puts the number in a
sentence that says whose it is, or in a table. Measured on the LaTeX source, per 10,000 words:

| paper                                                          | words | claims in bold | per 10,000 |
| -------------------------------------------------------------- | ----: | -------------: | ---------: |
| `leaking-queries-acsac25` (ACSAC 2025)                         |  9133 |              0 |        0.0 |
| `rr-dataset-quality-acsac24` (ACSAC 2024)                      |  8130 |              0 |        0.0 |
| `secure-acsac24` (ACSAC 2024)                                  |  7519 |              0 |        0.0 |
| `llm-splained-acsac25` (ACSAC 2025)                            |  9529 |              1 |        1.0 |
| `barovox-acsac24` (ACSAC 2024)                                 |  7670 |              8 |       10.4 |
| the paper reviewers called a blog post, as resubmitted to AIDC | 10476 |             42 |       40.1 |
| the same paper, before its rewrite                             |  6128 |             42 |       68.5 |
| `agenticdev-acm26` (ours, "too informal", ACM)                 |  4374 |              8 |       18.3 |

Two shapes were measured and left out, because they do not separate the groups: all bold inside a
sentence (accepted papers 0–44 per 10,000, the resubmitted paper 60 — terms in bold are common), and
phrases of six words or more in italics (accepted 0–7.8, the paper 4.8 — italics carry quotes and
examples). BaroVox's 8 are six of its results set in bold (_0.35_, _4.09/5_, …), its claim of a
_first-ever use of this technique on pressure sensors_, and a dataset name with a digit
(_SpeechCommand256_). That name and LLM-splained's one count, a list of topics in bold, are the two
false positives in the corpus; the band keeps both papers inside.

## Examples

```latex
We find that \textbf{the median guard blocks 2 of 10 disasters}.   % a claim in bold
The median guard blocks 2 of 10 disasters (Table~\ref{t:cov}).      % none
We introduce \textbf{GateBench}, a harness for scraped guards.     % none: a term
\textbf{Threat model.} The attacker controls the prompt.           % none: a run-in heading
```

## Options / preset fields

No rule options. The band is the venue preset's `register.anchors`, exactly as for
[`tex/contrast-frames`](contrast-frames.md), which explains how it is derived. For `paperlint:aidc` it
is **0–17.8**.

## What it does not check

Whether a bold phrase deserves emphasis, a claim in bold shorter than six words with no number
(_it is unsafe_), or emphasis by other means (capitals, colour, a box).

## How to fix

Take the bold off a finding and let the sentence carry it — with its owner (_we measured_, a
`\ref` to the table) — or move the number into a table or figure. Keep bold for a term at its
definition and for a label that opens a paragraph.
