# anonymity/identity

**Level:** error · **Reads:** `paper.tex` → `paperlint.json`, the preset it extends, and
`_build/paper.facts.json` (what `paperlint build` read from the PDF)

## What it catches

For a venue that reviews double-blind — its preset says `"blind": true` — two things:

- the paper declares no `identity`, so there is nothing to check the PDF against;
- a string from `identity` appears in the built PDF: on a page, in its metadata (the Info
  dictionary and the XMP packet: `Author`, `Title`, `Keywords`, …), or in the target of a link.

A rule cannot know who wrote a paper, so the authors say it once, in `paperlint.json`. Given that
list, finding it is mechanical. A missing list is an error, not a pass: a check with no input and a
check that found nothing would otherwise look the same.

The PDF is what reviewers get, so the PDF is what is read — not the source. A name reached through
a macro (`\newcommand\me{Ada Example}`), a self-citation's author list from the `.bib`, a
`\hypersetup{pdfauthor=…}` that is in no page's text, a `\href` whose visible text differs from its
target: each ends up in the PDF, and each is found there.

## Why

> Submissions must be properly anonymized for double-blind review.

— AIDC's call for papers, and most double-blind venues say the same. A paper that names its authors
is desk-rejected, and the ways a name gets in are mostly invisible when reading the PDF: metadata
the class copies from `\author`, a link to your own GitHub account, a name in a figure.

## How a name is matched

PDF text is not the source text; the same name comes out spelled several ways, and each is matched:

| in the PDF                               | matched as                                           |
| ---------------------------------------- | ---------------------------------------------------- |
| `ADA EXAMPLE` (small caps), `ада пример` | Unicode case folding, no locale — Cyrillic folds too |
| `ﬁ` ligature                             | NFKC on both sides                                   |
| `Ex` `ample` (two items, kerning)        | the page's items are joined without a space          |
| `A d a  E x a m p l e` (letter-spaced)   | whitespace may stand between any two characters      |
| `Exam-` ⏎ `ple`, `Ada` ⏎ `Example`       | so may a hyphen or a line break                      |
| `AdaExample`, `Ada-Example`              | a token's own spaces and hyphens are optional        |

Only the ends of a token are anchored: `Ada` does not match inside `Canada`, `MIT` not inside
`submitted`. Two tokens that find the same text in the same place are one finding.

Anonymous hosting needs no exception: an `osf.io/…?view_only=…` or `anonymous.4open.science` link
names nobody, so nothing in `identity` matches it.

## Examples

```json
{
  "extends": "paperlint:aidc",
  "kind": "regular",
  "identity": [
    "Ada Example",
    "adaexample",
    "ada@example.org",
    "Example University",
    "exampletool"
  ]
}
```

Findings:

> PDF, page 1: «Ada Example» matches «Ada Example» in `identity`, and aidc reviews double-blind —
> remove it, or refer to your own work in the third person

> PDF metadata: Author: «Ada Example» matches «Ada Example» in `identity`, …

> link target on page 4 (https://github.com/adaexample/exampletool): «adaexample» matches …

With no `identity`:

> aidc reviews double-blind, and this paper declares no `identity`, so nothing in the PDF can be
> checked against the authors. Declare it in paperlint.json (the root's for every paper, or this
> paper's): "identity": ["Your Name", "your-handle", "you@example.org", "Your University", "your-project"]

## Options / preset fields

No rule options.

- `identity` in `paperlint.json` — a list of strings, each with a letter or digit. The root file's
  list and the paper's own are **joined**: a paper adds its co-authors to the project's author and
  cannot drop them by accident. Put in everything that identifies you: every spelling of every
  author's name, handles, emails, affiliations, your own tools' and repositories' names.
- `blind` in the preset — `true` where the venue's call says the review is double-blind. Shipped:
  `paperlint:aidc`. A venue that is not blind: the rule is silent, `identity` or not.

## What it does not check

- **Text inside raster images.** A screenshot with your name, a logo, a scanned figure: text
  extraction reads text, not pixels, so a name there is not seen. Look at the figures yourself.
- **What you did not declare.** A co-author missing from `identity`, a nickname, an old handle.
- **Self-citation in the third person** is allowed by most double-blind venues, and a cited name is
  still a declared name: the rule reports it. Check the venue's policy; if it allows the citation,
  cite in the third person and keep the finding in mind, or drop that token for this paper.
- **A name split by hyphenation inside a token** that the PDF does not mark (a hyphen is matched,
  a missing space between two lines of a hyphenated compound is).
- **Words that are also names.** `identity` entries match as whole words anywhere; a common word
  used as a handle will be found in ordinary prose.
- **The source.** Comments, `\iffalse` blocks and files not in the build are not read — they are
  not in the PDF reviewers get. Supplementary material uploaded separately is not read either.

## How to fix

Remove the name from where the message says: the author block, the acknowledgments (for review),
`\hypersetup{pdfauthor=…}` / `pdfusetitle`, a link to your account (use an anonymous mirror), a
self-citation in the first person. Rebuild (`paperlint build`) and lint again.
