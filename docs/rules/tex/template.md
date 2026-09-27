# tex/template

**Level:** error · **Reads:** `paper.tex`, and the preset its `paperlint.json` extends

## What it catches

The paper's `\documentclass` is not the class the venue preset's `template` names, or it lacks an
option the template names. `[conference]{IEEEtran}` under AIDC, which requires
`[conference,compsoc]{IEEEtran}`; `{acmart}` (the single-column `manuscript` format) under an ACM
sigconf venue; `[journal,compsoc]{IEEEtran}` for a conference.

## Why

A venue checks the template before anyone reads the paper. A submission was desk-rejected for
template non-compliance, with no reviews (#90), and the venues that state a class say so plainly —
AIDC: «LaTeX submissions must use the IEEEtran.cls version 1.8b template with the
\documentclass[conference,compsoc]{IEEEtran} document class option», and «This requirement will be
strictly enforced» (https://aidcworkshop.github.io/). The `pdf/*` rules see the consequences of a
wrong class only after a build — fonts, page size, columns — and some consequences not at all:
`compsoc` changes the text block and the headings, not the fonts. This rule reads the cause, in the
source, before any build.

## Examples

Failing, under `"extends": "paperlint:aidc"`:

```latex
\documentclass[conference]{IEEEtran}
```

> the class option `compsoc` is missing: aidc requires `\documentclass[conference,compsoc]{IEEEtran}`

```latex
\documentclass[sigconf]{acmart}
```

> the class is `acmart`, and aidc requires `\documentclass[conference,compsoc]{IEEEtran}` — the page
> size, fonts and layout the venue checks come from the class

Passing — options in any order, and the paper's own options besides the required ones:

```latex
\documentclass[compsoc, conference]{IEEEtran}
\documentclass[sigconf,review,anonymous]{acmart}   % under paperlint:aisec
```

## Options / preset fields

No rule options. It reads the preset's `template`, merged along `extends` (a child's replaces its
parent's): a whole `\documentclass[…]{…}` line, or a bare class name, which requires the class and
no option. The shipped values: `acm-sigconf` `\documentclass[sigconf]{acmart}`, `ieee-conference`
`\documentclass[conference]{IEEEtran}`, `aidc` `\documentclass[conference,compsoc]{IEEEtran}`,
`realm` `\documentclass[11pt]{article}` (ACL's template loads `acl.sty` as a package).

## What it does not check

- Options a venue forbids (`review`, `anonymous` in a camera-ready): only that what the venue
  requires is there.
- The version of the class file (#94).
- A paper whose `paperlint.json` names no preset, or a preset that does not resolve (`pdf/profile`
  reports that), or a preset with no `template`: silent.
- A `\documentclass` in a comment: the rule reads the parse tree, so it does not count.

## How to fix

Set the `\documentclass` line to the one the message quotes, keeping your own extra options. A new
paper made with `paperlint new <name> --venue <preset>` already has it.
