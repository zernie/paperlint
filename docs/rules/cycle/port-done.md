# cycle/port-done

**Level:** error · **Reads:** `paper.tex` → the paper's `paperlint.json` (`cycles`) → the venue
preset's `template` · **Reported on:** `paper.tex`

## What it catches

The current cycle declares `"phase": "porting"` — the source is still in the previous venue's
template, so the venue's format rules are silent — and the paper's `\documentclass` is already the
one the venue's preset requires. The port is done and the declaration is stale.

## Why

`"phase": "porting"` is a record of open work, not a softer severity: the day a new venue is chosen
the source is still in the old venue's template, and a page count under the wrong template says
nothing about the new limit. While the phase is declared, every `pdf/*`, `format/*`, `anonymity/*`
and `tex/*` venue rule stays silent for that paper. A declaration that silences rules must not be
able to stay on after its reason is gone: once the class line is the venue's, this rule fires, and
the only way to be quiet again is to drop the phase — which turns the format rules back on.

## Examples

Failing — `paperlint.json`:

```json
{
  "cycles": [
    {
      "id": "blind-2027",
      "venue": { "kind": "preset", "extends": "./blindconf.jsonc" },
      "opened": "2026-09-09",
      "phase": "porting"
    }
  ]
}
```

where the preset's `template` is `\documentclass[conference,compsoc]{IEEEtran}`, and `paper.tex`
begins with that very line:

```text
papers/my-paper/paper.tex
  1:1  error  the \documentclass is already `\documentclass[conference,compsoc]{IEEEtran}`, which
              BlindConf requires, and the cycle «blind-2027» still declares "phase": "porting" — the
              port is done: remove the phase, so the venue's format rules judge this paper again
              cycle/port-done
```

Passing:

- the same paper with the phase removed (or `"phase": "prepared"`);
- a cycle still porting whose `paper.tex` still has the old venue's class line — the port is open
  work, as declared;
- a preset that names no `template`: there is nothing to compare, as for `tex/template`;
- a paper whose `paperlint.json` has no `cycles`.

## Options / preset fields

No rule options. It reads the preset's `template`, the field [`tex/template`](../tex/template.md)
reads, and compares the way that rule does.

## What it does not check

- Whether the port is complete beyond the class line — the page limit, the fonts, the sections. Those
  are the format rules' to judge, and they judge again the moment the phase is dropped.
- A cycle declared `porting` whose class line is still the old one: that is the state the phase
  describes.
- A `porting` cycle that has already sent a PDF — [`cycle/stage`](stage.md) reports that on the
  scorecard.

## How to fix

Remove `"phase": "porting"` from the current cycle in `paperlint.json`, then run `paperlint lint`
and `paperlint build`: the venue's format rules judge the paper again, and what they report is the
rest of the port.
