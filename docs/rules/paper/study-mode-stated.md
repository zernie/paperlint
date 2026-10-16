# paper/study-mode-stated

**Level:** warning · **Reads:** `paper.tex` (its includes spliced), its `% study:` comments,
`repro/studies.json` and each study's `plan.json` · **Reported on:** the first number of the
paragraph

## What it catches

A paragraph linked to an exploratory study (`% study: P1-S03`, the study's plan
`{ "mode": { "kind": "exploratory", "reason": "…" } }`) that states a number and never says
"exploratory".

```latex
In all, 12 runs stall on the first tool call. % study: P1-S03
```

## Why

An exploratory result is a question for the next study, not an answer. Reported without the label,
it reads as a tested prediction. The label belongs in the paragraph that states the number, where a
reader who skims meets it. The design is
[`docs/design/sealed-studies.md`](../../design/sealed-studies.md), "The paper side".

## Examples

Failing (a warning):

```text
papers/example/paper.tex
  21:8  warning  This paragraph states 12 from P1-S03, an exploratory study, and never says so. What to
                 do: label the result exploratory in this paragraph — a reader must not take it for a
                 tested prediction.  paper/study-mode-stated
```

Passing: "In an exploratory look, 12 runs stall on the first tool call. % study: P1-S03"; a
paragraph linked to a study decided before its run, or blind.

## Options / preset fields

No rule options.

## What it does not check

- A paragraph with no `% study:` link: no number in paperlint is tied to a study except through it.
- Whether the number really comes from that study.
- A year (1900–2099) is not read as a number.

## How to fix

Say "exploratory" in the paragraph, or the reason the study gives (its plan's `mode.reason`);
`npx paperlint studies methods <paper-dir> --format tex` prints a sentence for it.
