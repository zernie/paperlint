# paper/study-mode-claim

**Level:** error · **Reads:** `paper.tex` (its includes spliced), its `% study:` comments,
`repro/studies.json`, each study's `plan.json`, and git's history of the decide-first ones ·
**Reported on:** the claim word in `paper.tex`

## What it catches

A paragraph linked to a study — a comment on one of its lines, `% study: P1-S03` (several:
`% study: P1-S03, P1-S04`) — that calls the study **pre-registered**, **preregistered**,
**pre-registration**, **decided before**, **blind** or **blinded**, when:

- the study's plan declares it `exploratory`;
- the study's plan declares no mode;
- the study is declared decided before its run, but its history does not show the decision first
  ([`repro/outputs-before-decision`](../repro/outputs-before-decision.md) reports it).

And a `% study:` comment that names an id the registry does not hold.

```latex
The exclusions were pre-registered, and 41 of 60 runs pass. % study: P1-S03
```

with `P1-S03`'s plan `{ "mode": { "kind": "exploratory", "reason": "…" } }` is one finding, at
"pre-registered".

## Why

An overclaim is the dangerous direction: a reader who takes an exploratory result for a tested
prediction gives it a weight it has not earned, and a reviewer who checks the repository and finds
no decision before the run reads every other claim of the paper with that in mind. The plan and the
history say what each study is; this rule holds the text to them. The design is
[`docs/design/sealed-studies.md`](../../design/sealed-studies.md), "The paper side".

## Examples

Failing:

```text
papers/example/paper.tex
  14:23  error  This paragraph is linked to P1-S03 and calls it «pre-registered», but its plan
                declares it exploratory. What to do: say what the study is — exploratory, with its
                reason — or link the paragraph to the study that was decided first.  paper/study-mode-claim
```

Passing: the same sentence linked to a study decided before its run whose history shows it; a
paragraph that says "exploratory"; a paragraph with no `% study:` link.

## Options / preset fields

No rule options.

## What it does not check

- A paragraph with no `% study:` link: the rule cannot know which study its words are about. The
  link is the only one from the text to the registry; `npx paperlint studies methods <paper-dir>`
  prints the sentences to start from.
- Claims in other words ("registered in advance", "fixed beforehand"), or a claim about a study the
  paragraph does not link.
- Whether a blind study was really blind: that is the manifest's and `studies verify`'s.

## How to fix

Say what the study is, or link the paragraph to the study the claim is about:

```latex
In an exploratory look, 41 of 60 runs pass. % study: P1-S03
```
