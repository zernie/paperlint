# cycle/stage

**Level:** error · **Reads:** the paper's `PIPELINE-STATUS.md` frontmatter (`stages`) and its
`paperlint.json` (`cycles`) · **Reported on:** the frontmatter of `PIPELINE-STATUS.md`

## What it catches

With `cycles` declared in the paper's `paperlint.json`, a `stages` entry in the scorecard's
frontmatter must say which attempt it belongs to, `cycle: <id>`, and that attempt must exist. Three
things can be wrong:

- a stage names no `cycle`;
- a stage names a `cycle` no declared cycle has as its `id`;
- a `submitted` or `camera-ready` stage belongs to a cycle whose `phase` is still `porting` — a PDF
  was sent to the venue while the record says the source is still in the previous venue's template.

Without `cycles` (the flat form) the rule is silent and `venue:` stays what it was.

## Why

A paper's attempts are recorded once, in `paperlint.json`; the scorecard's stages are the evidence
— which PDF, how many bytes, when. A stage that names its cycle says which attempt the evidence
belongs to, and the venue's name is then spelled once, in the preset, instead of as a free string
retyped per stage (`REALM @ EMNLP 2026`, `AISec 2026 @ ACM CCS`, …). A stage whose cycle does not
exist is evidence of nothing.

The `porting` case is the other half of a declaration: `"phase": "porting"` silences the venue's
format rules because the source is, by declaration, not yet in the venue's template. A PDF sent
from such a cycle contradicts that declaration — either the port is done and the phase is stale, or
the stage is wrong.

## Examples

Failing — `paperlint.json` declares one cycle, `open-2027`, and `PIPELINE-STATUS.md` has

```yaml
---
stages:
  - stage: submitted
    date: 2026-07-22
    pdf: versions/a.pdf
    bytes: 1
---
```

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  the «submitted» stage (2026-07-22) names no `cycle` — this paper declares `cycles` in
              paperlint.json, so each stage says which attempt it belongs to: `cycle: <id>`, one of
              open-2027  cycle/stage
```

Passing:

```yaml
---
stages:
  - stage: submitted
    cycle: open-2027
    date: 2026-07-22
    pdf: versions/a.pdf
    bytes: 1
---
```

Also passing: a paper without `cycles`, whatever its stages say.

## Options / preset fields

No rule options.

## What it does not check

- The PDF, its bytes, or the frozen source — [`paper/stages`](../../rules.md) and `paper/source`
  do.
- Whether a stage's `date` falls inside its cycle (after `opened`, before the outcome's `date`).
- Whether a cycle without any `submitted` stage was in fact submitted; that is the portal's record
  (`paperlint submission`), not the scorecard's.
- The rest of the cycle record — [`cycle/record`](record.md) does.

## How to fix

Add `cycle: <id>` to each stage, with the id of the cycle the PDF was sent in. For a stage whose
cycle is still `porting`: if the port is done, remove `"phase": "porting"` from the cycle
([`cycle/port-done`](port-done.md) says when); if no PDF was sent, remove the stage.
