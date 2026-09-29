# format/layout-override

**Level:** error · **Reads:** `paper.tex` and the files it includes, and the preset its
`paperlint.json` extends

## What it catches

A command that changes the page layout the venue's template sets for the whole document:

| command                                                                                                                                                                                | changes          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `\usepackage{geometry}` (alone or in a list), `\geometry{…}`, `\newgeometry{…}`                                                                                                        | the margins      |
| `\setlength` / `\addtolength` on `\textheight`, `\textwidth`, `\topmargin`, `\oddsidemargin`, `\evensidemargin`, `\columnsep`, `\headsep`, `\headheight`, `\footskip`, `\baselineskip` | the text block   |
| `\linespread{…}`, `\renewcommand{\baselinestretch}{…}`                                                                                                                                 | the line spacing |

It reads the parse tree, not the text: a command in a comment is not a command, and a `comment`
environment is skipped. A macro definition is read: `\newcommand{\tall}{\setlength{\textheight}{10in}}`
sets the length wherever it is used, so it is reported where it is defined.

It is silent for a paper whose `paperlint.json` names no preset, or a preset that names no
`template` — there is no mandated layout to compare against.

## Why

Venues set the page through their template and reject papers that change it: IEEE and ACM venues
run format checks, and a shrunken margin or a tightened line spacing is a classic desk reject.
AIDC: «LaTeX submissions must use the IEEEtran.cls version 1.8b template». The page-limit and
geometry checks see the result only in the built PDF; this rule points at the line that does it.

## Examples

```latex
\usepackage[margin=0.7in]{geometry}      % reported
\setlength{\textheight}{9.6in}           % reported
\linespread{0.95}                        % reported
\setlength{\parindent}{0pt}              % not reported: not a layout length
Text.\vspace{-2mm}                       % not reported: local space, not the template's layout
```

> `\usepackage{geometry}` changes the page layout aidc's template sets
> (`\documentclass[conference,compsoc]{IEEEtran}`) — a desk-reject reason at venues that check the
> format. Remove it; if the venue allows it, disable this line with a comment saying so

## Options / preset fields

No rule options. It reads the preset's `template`.

## What it does not check

- Local spacing: a negative `\vspace`, `\vspace*` or `\vskip` around a float or a heading. It
  changes one spot, not the layout the template sets, and no venue's call names it.
- Font size changes (`\small` body text, `\fontsize`), `\baselineskip` changed by `\fontsize`,
  `\enlargethispage`, `\looseness`, or float spacing lengths (`\textfloatsep`, `\abovecaptionskip`).
- Conditionals are not evaluated: a command inside an `\iffalse … \fi` block in the preamble is
  still reported.
- Layout lengths set with plain TeX assignment (`\textheight=9in`).

## How to fix

Remove the command and let the template set the page. If the venue explicitly allows it, keep it
with `% eslint-disable-next-line format/layout-override -- <the venue's words>`.
