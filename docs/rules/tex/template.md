# tex/template

**Level:** error · **Reads:** `paper.tex`, and the preset its `paperlint.json` extends

## What it catches

The paper is not set in the class its venue requires. The rule compares the `\documentclass` line
of `paper.tex` with the preset's `template`: the class must be the same, every option the
template names must be there, and no option the preset forbids (`template_forbids`) may be. The
paper may add other options of its own.

A source that keeps one file for several venues and picks the class behind a TeX switch has several
`\documentclass` lines. The switch is not evaluated: each line is a candidate, the paper passes when
one of them is the template's class with its options, and when none is, one finding at the first
candidate names every one:

```latex
\def\venue{2}
\if\venue1 \documentclass{article} \fi
\if\venue2 \documentclass[conference,compsoc]{IEEEtran} \fi   % passes: the second candidate matches
```

An option given to the class before its line with `\PassOptionsToClass` is in effect, as LaTeX
reads it, and counts as the line's: it satisfies a required option, and a forbidden one is reported
where it is passed. One passed after the `\documentclass`, or to another class, does nothing in
LaTeX and counts for nothing here:

```latex
\PassOptionsToClass{compsoc}{IEEEtran}
\documentclass[conference]{IEEEtran}   % passes under AIDC: compsoc is passed above
```

With a build's record, a class line kept in a file `paper.tex` `\input`s is read where the
`\input` stands, and a finding in it is reported at that `\input`, naming the file and line.

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

Under a preset that forbids options — MSR: «LaTeX users must use \documentclass[10pt,conference]{IEEEtran}
without including the compsoc or compsocconf options» (https://2027.msrconf.org/track/msr-2027-technical-papers):

```latex
\documentclass[10pt,conference,compsoc]{IEEEtran} % fails: compsoc is forbidden
\documentclass[10pt,conference]{IEEEtran}         % passes
```

> the class option `compsoc` is forbidden: MSR requires `\documentclass[10pt,conference]{IEEEtran}` without `compsoc`, `compsocconf`

## Preset field

No rule options. It reads `template`, merged along `extends` (a child's replaces its parent's):

```jsonc
"template": "\\documentclass[conference,compsoc]{IEEEtran}"
```

A whole `\documentclass[…]{…}` line, or a bare class name (`"article"`), which requires the class
and no option. A value that is neither is reported as a finding that names the preset file.

```jsonc
"template_forbids": ["compsoc", "compsocconf"]
```

Class options the venue's call forbids, each reported where the class line carries it. Read with the
`template` of the same file, and only with it: the schema refuses it alone, and a child preset's
`template` replaces both.

## What it does not check

- An option a venue forbids that its preset does not list in `template_forbids` (`review` in a
  camera-ready).
- The version of the class file (#94).
- A `\documentclass` inside a comment, a `verbatim` or `filecontents` block, or behind `\iffalse …
\fi`: TeX does not read it, and the rule does not count it.
- Which branch of a TeX switch builds: with several class lines, one matching candidate is enough.
- A line it cannot read, which stays silent rather than guess. No macro is expanded, so the rule
  does not know what a macro holds:
  - an option built by a macro (`\documentclass[\opts]{IEEEtran}`, or `\PassOptionsToClass{\opts}{…}`):
    no option is said to be missing; a forbidden option written out beside it is still reported,
    since it is in effect whatever the macro holds;
  - a class name built by a macro (`\documentclass{\cls}`): no finding; behind a TeX switch, such a
    candidate may be the venue's, so the switch gets no finding either;
  - no `\documentclass` at the top of `paper.tex`, but one inside another macro's argument, or an
    `\input` before `\begin{document}` whose file the rule has not read (no build yet, so no record
    of the files TeX read): no finding — the class may be there. After `paperlint build`, the
    included file is read and judged.

  [`cycle/port-done`](../cycle/port-done.md) does not take such a line for the venue's either.

## How to fix

Set the `\documentclass` line to the one the message quotes, keeping your own extra options
and dropping a forbidden one. A new
paper made with `paperlint new <name> --venue <preset>` already has it.

If a finding is wrong for your paper, put a comment with the reason on the line above the one it
points at — `% eslint-disable-next-line tex/template -- <why>` — or, for a finding at the top of the
file, `% eslint-disable tex/template -- <why>` on the first line.
