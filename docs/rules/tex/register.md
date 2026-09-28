# tex/register

**Level:** warn · **Reads:** `paper.tex` and the files it includes

## What it catches

A body in which more than 0.8 sentences per 1000 words open with _And_, _So_, _But_, _Nor_, _Or_ or
_Yet_. It is reported once, at the body's first sentence, with the count, the rate and the first
three such sentences.

It reads the body of the whole paper — `paper.tex` with the files it `\input`s, `\include`s or
`\subfile`s spliced in — from the start of the document, the abstract included, to `\appendix` or the
bibliography: paragraphs, list items and footnotes. Headings are not sentences, and neither is a
run-in heading — a bold or italic phrase ending in `.` or `:` that opens a paragraph or an item
(`\textbf{Threats.} …`). Captions, tables, figures, code and math environments are left out. A
citation, a cross-reference or inline math counts as one word, as it reads on the page. Sentences
are cut exactly as [`tex/claim-provenance`](claim-provenance.md) cuts them.

A conjunction counts only as the capitalised first word of a sentence; the _and_ that opens a list
item continuing the sentence before the list does not.

A body under 2 000 words is not judged: there one sentence decides the rate.

## Why

Reviewers called our prose "too informal" and "a blogpost". Measured against eleven accepted
papers, sentences opening with a coordinating conjunction set our four drafts apart:

| measure                                                      |           11 accepted papers | our 4 drafts |
| ------------------------------------------------------------ | ---------------------------: | -----------: |
| sentences opening with And/So/But/Nor/Or/Yet, per 1000 words | 0–0.58 (the ACSAC papers: 0) |    0.29–2.98 |

The limit sits above the accepted range with room to spare: the rule flags a body that has drifted
to a post's register, not one a little above the median. Mean sentence length did not separate the
two groups. The share of sentences under eight words did not either, once measured on the parse
tree: 3.3–7.3% on the two accepted papers in this repository's corpus, 5.1–7.0% on three of ours.

On the corpus (`fixtures/accepted-papers/`) the rule measures:

| paper                               | per 1000 words |
| ----------------------------------- | -------------: |
| `secure-acsac24` (ACSAC 2024)       |           0.00 |
| `llm-splained-acsac25` (ACSAC 2025) |           0.00 |
| `agenticdev-acm26` (ours, accepted) |           1.60 |

The vocabulary of machine-written text (_delve_, _crucial_) is a different question, and a different
check; a paper can avoid every such word and still read as a post.

## Examples

```latex
We measured the cost on four tools. But the bill barely moves.       % a conjunction start
We measured the cost on four tools, and the bill barely moves.       % none
We measured the cost on four tools. However, the bill barely moves.  % none
```

On a body where such sentences run above the limit, the rule reports:

> 7 sentences open with And, So, But, Nor, Or or Yet — 1.60 per 1000 words (first: «…», «…», «…»).
> Accepted papers measured 0–0.58; this rule warns above 0.8. Join the sentence to the one before,
> or open with the connective a paper uses (However, Therefore, Moreover)

## Options / preset fields

In a paper's `paperlint.json`:

```json
{
  "rules": {
    "tex/register": ["warn", { "conjunctionStartsPer1000": 0.8 }]
  }
}
```

| option                     | default | what it is                                                 |
| -------------------------- | ------: | ---------------------------------------------------------- |
| `conjunctionStartsPer1000` |     0.8 | the conjunction starts per 1000 words above which it warns |
