# tex/contrast-frames

**Level:** warn · **Reads:** `paper.tex` and the files it includes → `paperlint.json`

## What it catches

A body whose contrast frames — a claim set against a rejected alternative — run outside the band
the accepted papers of its venue set. Counted per 10,000 words of the body, in these forms:

| form                            | example                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| _X, not Y_ (and `;`, `---`)     | _they react to the dangerous word, not the dangerous operation_ |
| _X, and not Y_ · _X, but not Y_ | _it reads the field, and not the raw input_                     |
| _not X but Y_ (one clause)      | _over-blocking is not a side metric but a precondition_         |
| _rather than_                   | _it fires on the mention rather than the act_                   |
| _instead of_                    | _it reads the whole event instead of the command_               |
| _as opposed to_                 | _it matches words as opposed to operations_                     |

Not counted: _not only … but also_; a negated clause followed by _, but_ (_the audit is not
reported, but …_); _, not yet_ · _not already_ · _not necessarily_ and their kin, which reject
nothing; _without_ and _unlike_ — both measured, both as frequent in accepted papers as in the
paper reviewers called a blog post, so they would add noise and no signal.

Above the band it reports once at the start of the body — the count, the rate, the band and the
anchors' own range, with the first three sentences — and then once at every frame, with the words
around it, so an editor shows where to rewrite. Below the band it reports once. A body under 2 000
words is not judged, and neither is a paper whose preset records no anchors.

It reads the same body as [`tex/register`](register.md): from the start of the document, the
abstract included, to `\appendix` or the bibliography, includes spliced in; headings, run-in
headings, captions, tables, figures and code are not prose.

## Why

Reviewers called a paper "too informal" and "a blogpost". Its body set a claim against what it is
not several times per page — the device carries the argument in place of a word that names the
relation (_because_, _therefore_). Measured on the LaTeX source, per 10,000 words:

| paper                                                      | words | frames | per 10,000 |
| ---------------------------------------------------------- | ----: | -----: | ---------: |
| `barovox-acsac24` (ACSAC 2024)                             |  7670 |      1 |        1.3 |
| `rr-dataset-quality-acsac24` (ACSAC 2024)                  |  8130 |      3 |        3.7 |
| `secure-acsac24` (ACSAC 2024)                              |  7519 |      3 |        4.0 |
| `llm-splained-acsac25` (ACSAC 2025)                        |  9529 |      4 |        4.2 |
| `leaking-queries-acsac25` (ACSAC 2025)                     |  9133 |      5 |        5.5 |
| the paper reviewers called a blog post, before its rewrite |  6128 |     62 |      101.2 |
| the same paper, after a rewrite aimed at contrast frames   |  6121 |     25 |       40.8 |
| the same paper, as resubmitted to AIDC                     | 10476 |     29 |       27.7 |
| `agenticdev-acm26` (ours, "too informal", ACM)             |  4374 |     22 |       50.3 |

An independent blind hand count — a reader who did not know which text was which, counting every
explicit negation that rejects one named term for another, _without_ and _unlike_ included — put the
first version at ~86 per 10,000 words and four accepted ACSAC excerpts at ~9–19: a different counter,
the same five- to tenfold gap. Compare rates only within one counter.

## Examples

```latex
The guards react to the dangerous word, not the dangerous operation.      % a frame
The guards match the words of a command; they do not parse the operation. % none
Because the guards match words, 24 of 46 block a harmless echo.          % none
```

## Options / preset fields

No rule options. The band is the preset's: `register.anchors` in the venue preset, each anchor a
paper with its body's `words` and its count of each measure, as these rules count them:

```jsonc
"register": {
  "anchors": [
    { "paper": "barovox-acsac24", "words": 7670, "contrast_frames": 1, "claim_emphasis": 8, "relation_markers": 31 }
  ]
}
```

The band is the anchors' range widened at each end by two Poisson standard deviations of the anchor
standing there (an anchor with no occurrence is widened as if it had one; below zero is zero), so a
paper of that anchor's length and register falls outside it about one time in forty. For
`paperlint:aidc`, the anchors are the five accepted ACSAC papers above — AIDC has no accepted papers of
its own yet, and uses ACSAC's template — and the band is **0–10.4**. `src/register-bands.test.ts`
re-measures every anchor that has a fixture, so a change to a counter changes the preset with it.

A preset of your own gets a band the same way: measure accepted papers of the venue, as LaTeX
source, and record them (`anchorOf` in `src/register-bands.ts` is the one way an anchor is measured).

## What it does not check

Whether a given frame is needed. A frame is the right sentence where a reader would otherwise assume
the rejected alternative; the rule counts, and judging each one is the job of the `grade-paper-writing`
skill. It does not read a frame split over two sentences (_It is fast. Not exact._), a negation by
synonym (_ignores_, _fails to_), or anything in the appendix.

## How to fix

Say what the thing is and why, with the evidence, and name the relation to the sentence before —
_because_, _therefore_, _for example_ — instead of setting it against what it is not. Replacing
_, not_ with _rather than_ changes nothing: both are counted. Keep a frame where the rejected reading
is the one a reviewer brings to the page, and check after each rewrite that every claim and number
still says what it said.
