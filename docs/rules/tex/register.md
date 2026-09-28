# tex/register

**Level:** warn · **Reads:** `paper.tex` and the files it includes

## What it catches

Two rates over the whole body, each reported once, at the body's first sentence, when it runs above
its limit:

| rate                                                                              | warns above |
| --------------------------------------------------------------------------------- | ----------: |
| the share of the body's sentences that run under eight words                      |         12% |
| sentences that open with _And_, _So_, _But_, _Nor_, _Or_ or _Yet_, per 1000 words |         0.8 |

It reads the body of the whole paper — `paper.tex` with the files it `\input`s, `\include`s or
`\subfile`s spliced in — from the start of the document, the abstract included, to `\appendix` or the
bibliography: paragraphs, list items and footnotes. Headings are not sentences, and neither is a
run-in heading — a bold or italic phrase ending in `.` or `:` that opens a paragraph or an item
(`\textbf{Threats.} …`). Captions, tables, figures, code and math environments are left out. A
citation, a cross-reference or inline math counts as one word, as it reads on the page: _"as shown
in Table~\ref{t}"_ is five words. Sentences are cut exactly as [`tex/claim-provenance`](claim-provenance.md)
cuts them.

A conjunction counts only as the capitalised first word of a sentence; the _and_ that opens a list
item continuing the sentence before the list does not.

A body under 2 000 words is not judged: there one sentence decides a rate.

## Why

Reviewers called our prose "too informal" and "a blogpost". Measured against eleven accepted
papers, two things set our four drafts apart, and this rule counts them:

| measure                                                      |           11 accepted papers | our 4 drafts |
| ------------------------------------------------------------ | ---------------------------: | -----------: |
| sentences under 8 words                                      |                    2.2–10.9% |   11.6–16.0% |
| sentences opening with And/So/But/Nor/Or/Yet, per 1000 words | 0–0.58 (the ACSAC papers: 0) |    0.29–2.98 |

Mean sentence length did **not** separate the two groups, so the rule sets no floor on it. The
limits sit above the accepted range with room to spare: the rule is meant to flag a body that has
drifted to a post's register, not to push every paper toward the median.

The vocabulary of machine-written text (_delve_, _crucial_) is a different question, and a
different check; a paper can avoid every such word and still read as a post.

⚠️ **The calibration was measured on text extracted from the papers, not on this rule's parse of
their source**, and the two differ: on the three papers of this repository's accepted corpus
(`fixtures/accepted-papers/`) this rule measures

| paper                               | under 8 words | conjunction starts per 1000 |
| ----------------------------------- | ------------: | --------------------------: |
| `secure-acsac24` (ACSAC 2024)       |          3.3% |                        0.00 |
| `llm-splained-acsac25` (ACSAC 2025) |          7.3% |                        0.00 |
| `agenticdev-acm26` (ours, accepted) |          7.0% |                        1.60 |

Conjunction starts separate the two there as they did in the calibration. The short-sentence share
does not: most of what read as short sentences in our drafts were run-in headings, which this rule
leaves out. The 12% limit stays as the calibration set it.

## Examples

```latex
We measured the cost on four tools. But the bill barely moves.   % a conjunction start
We measured the cost on four tools, and the bill barely moves.   % none
That is the finding.                                              % a short sentence (4 words)
```

On a body where more than 12% of the sentences read like the third line, the rule reports:

> 14.2% of the body's 210 sentences run under 8 words (30; first: «That is the finding.», …).
> Accepted papers measured 2.2–10.9%; this rule warns above 12%. A run of short sentences reads as
> a post, not a paper — join the ones that carry one step of the same argument

## Options / preset fields

In a paper's `paperlint.json`:

```json
{
  "rules": {
    "tex/register": [
      "warn",
      { "shortSentencePercent": 12, "conjunctionStartsPer1000": 0.8 }
    ]
  }
}
```

| option                     | default | what it is                                                            |
| -------------------------- | ------: | --------------------------------------------------------------------- |
| `shortSentencePercent`     |      12 | the share of sentences under eight words above which it warns (0–100) |
| `conjunctionStartsPer1000` |     0.8 | the conjunction starts per 1000 words above which it warns            |

The eight-word bound is not an option: the calibration counted short sentences that way, and a
different bound would need a different limit.
