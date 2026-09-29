# pdf/body-size

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (the venue preset) and
`_build/paper.facts.json` (what `paperlint build` measured in the PDF)

## What it catches

A PDF set in another size than its venue's template:

- the body font size more than `body_pt_tol` off the preset's `body_pt` (`body`);
- the reference font size outside the preset's `ref_pt_min`–`ref_pt_max`, widened by `body_pt_tol`
  on both sides (`refPt`);
- a build that measured no body size at all (`bodyMissing`) — rebuild.

Both sizes are what banal measures on the rendered pages: the most common size of the body text,
and of the first bibliography page. It is not the size the source declares, so a
`\documentclass[9pt]`, a `\fontsize` in the preamble or a bibliography wrapped in `\scriptsize` are
all seen, whatever macro did it.

## Why

A call for papers that fixes a template fixes its font size, and shrinking the text is the usual
way a paper is made to fit the page limit. A reviewer or a production editor who notices returns
the paper; a page limit checked on a shrunk paper checks nothing.

It is an error because it was measured to be exact on real papers, not assumed. On five accepted
papers, built (`fixtures/accepted-papers/body-size.json`, `test/e2e/tex/page-count.e2e.ts`):

| paper                          | declared               | rendered (pdf.js)                          | measured (banal) | finding |
| ------------------------------ | ---------------------- | ------------------------------------------ | ---------------- | ------- |
| four ACSAC papers, IEEEtran    | 10 pt, references 8 pt | 10.00 / 8.00 (9.96 / 7.97 without compsoc) | 10.3 / 8.3       | none    |
| AgenticDev '26, acmart sigconf | 9 pt, references 7 pt  | 8.97 / 6.97                                | 9.3 / 7.3        | none    |
| an ACSAC paper with `9pt`      | 9 pt                   | 9.00 / 8.00                                | 9.3 / 8.3        | `body`  |
| references in `\scriptsize`    | 7 pt                   | 10.00 / 7.00                               | 10.3 / 7.3       | `refPt` |
| references in `\small`         | 9 pt                   | 9.96 / 8.97                                | 10.3 / 9.3       | `refPt` |

banal reads every size 0.3 pt above the size the glyphs are set in, on both templates, and
`body_pt_tol` of 0.5 absorbs that. Because of that offset the margins are not symmetric: every accepted body, and every IEEE bibliography (a single size, 8 pt), lands 0.2 pt inside the upper edge, a paper one size smaller (9 pt body, 7 pt
references) 0.2 pt outside the lower edge, and one size larger 0.8 pt outside the upper one. The
offset was exactly 0.3 on all eight builds; a template on which banal reads differently would need
its own measurement. A change of half a point (IEEEtran's 9pt `\small` is 8.5 pt) can pass
unreported.

## Examples

An IEEEtran paper built with `\documentclass[9pt,conference,compsoc]{IEEEtran}`:

> the body font size measures 9.3 pt against 10 ± 0.5 pt for ieee-conference. The measurement is
> the mode of the rendered text, not the declared size — check \documentclass and its options

The same paper with `{\let\footnotesize\scriptsize\bibliography{refs}}`:

> the reference font size is 7.3 pt, outside 8 pt for ieee-conference (allowing ±0.5 pt for the
> measuring drift) — fix the bibliography's font size

The paper as the template sets it, `\documentclass[conference,compsoc]{IEEEtran}` and a plain
`\bibliography{refs}`, passes.

## Options / preset fields

No rule options. From the preset's `format`: `body_pt` and `body_pt_tol` (both needed for the body
check), `ref_pt_min` and `ref_pt_max` (both needed for the reference check). A preset without them
does not check that size. The shipped presets:

| preset                                    | `body_pt` ± `body_pt_tol` | references |
| ----------------------------------------- | ------------------------- | ---------- |
| `ieee-conference` (and `aidc`)            | 10 ± 0.5                  | 8          |
| `acm-sigconf` (and `agenticdev`, `aisec`) | 9 ± 0.5                   | 7–9        |
| `realm`                                   | 11 ± 0.5                  | 9–11       |

## What it does not check

- **The size of anything but the body and the first bibliography page**: captions, footnotes,
  tables, the title and the appendix are not measured. A table set in `\tiny` passes.
- **A paper that is not built.** Without `_build/paper.facts.json`, or without banal, the rule is
  silent and `pdf/measured` says why.
- **The `realm` preset** has not been checked on built accepted papers of its venue: its body size
  is ACL's stated 11 pt, and its reference range was set from a single measurement.
- A paper with no bibliography has no reference size, and only the body is judged.

## How to fix

Use the template's size: remove the size option from `\documentclass` and any `\fontsize`,
`\small` or `\footnotesize` around the body; for the references, remove what wraps
`\bibliography` or changes `\bibfont`. Rebuild (`paperlint build`) and lint again. If the venue
really allows another size, override the preset's `format` in your own preset, or set the rule to
`"off"` in `paperlint.json`.
