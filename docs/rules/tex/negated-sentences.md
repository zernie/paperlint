# tex/negated-sentences

**Level:** off by default; in the opt-in set [`paperlint:writing`](../../optional-rules.md#the-writing-set-paperlintwriting) · **Reads:** `paper.tex` and the files it includes → `paperlint.json`

## What it catches

A body in which the share of sentences holding a negator runs outside the band the accepted papers
of its venue set. It is a share of the body's sentences, in percent, not a rate per words: a
sentence with two negators counts once. The negators are the list the earlier prose counter
used, whole words, case ignored:

> not, no, none, never, cannot, n't, neither, nor, without, fail to (fails to, failed to), unable

`n't` is matched where it ends a word (_don't_, _isn't_); the counter it came from wrote it as a
whole word and so never matched it.

Above or below the band it reports once, at the start of the body: the count, the share, the band
and the anchors' own range, and — above it — the first three sentences. A body under 2 000 words is
not judged, and neither is a paper whose preset records no negation for its anchors.

It reads the same body as [`tex/contrast-frames`](contrast-frames.md): from the start of the
document, the abstract included, to `\appendix` or the bibliography, includes spliced in; headings,
run-in headings, captions, tables, figures and code are not prose.

🔴 **A contrast frame is counted here too.** _X, not Y_ and _not X but Y_ hold a negator, so a
sentence with one adds to this share and to [`tex/contrast-frames`](contrast-frames.md). Turning
both on judges that sentence twice; read the two findings as one before rewriting.

## Turning it on

```json
{
  "rules": { "tex/negated-sentences": "warn" }
}
```

It ships off: it is a writing measure, and what share of negation a paper needs is a judgement the
venue does not state. See [optional rules](../../optional-rules.md).

## Why

A paper that says what a thing is not, sentence after sentence, reads as an argument with an
absent opponent. Measured with this rule's counter on the LaTeX source, with each paper's includes
spliced from its recorded build (2026-11-19):

| paper                                     | sentences | negated | share |
| ----------------------------------------- | --------: | ------: | ----: |
| `barovox-acsac24` (ACSAC 2024)            |       400 |      21 |  5.3% |
| `rr-dataset-quality-acsac24` (ACSAC 2024) |       368 |      26 |  7.1% |
| `secure-acsac24` (ACSAC 2024)             |       368 |      28 |  7.6% |
| `leaking-queries-acsac25` (ACSAC 2025)    |       441 |      36 |  8.2% |
| `llm-splained-acsac25` (ACSAC 2025)       |       454 |      81 | 17.8% |
| `agenticdev-acm26` (ours, ACM)            |       171 |      63 | 36.8% |

Over the 106 arXiv preprints of `fixtures/arxiv-papers/` with more than 2 000 words of body, the
share runs from 2.6% to 38.7%, median 13.3%, and 26 of them stand above AIDC's band. The measure
separates a paper that argues by negation from the venue's accepted ones; whether a given paper
should change is the author's call.

## Examples

```latex
The gate does not parse the command; it never reads the operation.   % negated
The gate matches the words of a command and blocks on a match.        % not negated
```

## Options / preset fields

No rule options. The band is the preset's: each anchor in `register.anchors` records its body's
`sentences` and its `negated_sentences`, both or neither, beside the counts the other band rules read:

```jsonc
"register": {
  "anchors": [
    { "paper": "barovox-acsac24", "words": 7670, "contrast_frames": 1, "claim_emphasis": 8,
      "relation_markers": 31, "sentences": 400, "negated_sentences": 21 }
  ]
}
```

The band is the anchors' range of shares widened at each end by two Poisson standard deviations of
the anchor standing there, as for the other band rules. For `paperlint:aidc-2026` the anchors are the five
accepted ACSAC papers above: their shares run **5.3–17.8%**, and the band is **3.0–21.8%**.
`src/register-bands.test.ts` re-measures every anchor that has a fixture. An anchor without the two
fields sets no band, so a preset written before this rule leaves it silent.

## What it does not check

Whether a negation is needed: a limitation, a threat to validity and a null result are negative by
nature. A negation by a word outside the list (_lacks_, _absent_, _ignores_, _nothing_), and anything
in the appendix, are not counted.

## How to fix

Say what a thing is and does, with the evidence; keep a negation where a reader would otherwise
assume the opposite. Check after a rewrite that no claim was softened or strengthened.
