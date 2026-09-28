# tex/template

**Level:** error · **Reads:** `paper.tex`, and the preset its `paperlint.json` extends

## What it catches

The paper is not set in the class its venue requires. The rule compares the `\documentclass` line
of `paper.tex` with the preset's `template`: the class must be the same, and every option the
template names must be there. The paper may add options of its own.

A source that keeps one file for several venues and picks the class behind a TeX switch has several
`\documentclass` lines. The switch is not evaluated: each line is a candidate, the paper passes when
one of them is the template's class with its options, and when none is, one finding at the first
candidate names every one:

```latex
\def\venue{2}
\if\venue1 \documentclass{article} \fi
\if\venue2 \documentclass[conference,compsoc]{IEEEtran} \fi   % passes: the second candidate matches
```

It only knows the class a preset names. A paper whose `paperlint.json` names no preset, or a
preset with no `template`, gets no finding.

## Why

A venue checks the template before anyone reads the paper, and a paper in the wrong template can
be rejected with no review. Venues that name a class say so plainly — AIDC, for one: «LaTeX
submissions must use the IEEEtran.cls version 1.8b template with the
\documentclass[conference,compsoc]{IEEEtran} document class option», and «This requirement will be
strictly enforced» (https://aidcworkshop.github.io/).

The `pdf/*` rules see the consequences of a wrong class only after a build — fonts, page size,
columns — and some not at all: `compsoc` changes the text block and the headings, not the fonts.
This rule reads the cause, in the source, before any build.

## Examples

Under a preset with `"template": "\\documentclass[conference,compsoc]{IEEEtran}"`:

```latex
\documentclass[conference]{IEEEtran}               % fails: compsoc is missing
\documentclass[sigconf]{acmart}                    % fails: another class
\documentclass[compsoc, conference]{IEEEtran}      % passes: any order, spaces allowed
\documentclass[conference,compsoc,final]{IEEEtran} % passes: an extra option of the paper's own
```

The first line reports:

> the class option `compsoc` is missing: aidc requires `\documentclass[conference,compsoc]{IEEEtran}`

## Preset field

No rule options. It reads `template`, merged along `extends` (a child's replaces its parent's):

```jsonc
"template": "\\documentclass[conference,compsoc]{IEEEtran}"
```

A whole `\documentclass[…]{…}` line, or a bare class name (`"article"`), which requires the class
and no option. A value that is neither is reported as a finding that names the preset file.

## What it does not check

- Options a venue forbids (`review`, `anonymous` in a camera-ready): only that what the venue
  requires is there.
- The version of the class file (#94).
- A `\documentclass` inside a comment: the rule reads the parse tree, so it does not count.
- Which branch of a TeX switch builds: with several class lines, one matching candidate is enough.

## How to fix

Set the `\documentclass` line to the one the message quotes, keeping your own extra options. A new
paper made with `paperlint new <name> --venue <preset>` already has it.
