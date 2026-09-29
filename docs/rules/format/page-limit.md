# format/page-limit

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (the venue preset and the paper's
`kind`) and `_build/paper.facts.json` (what `paperlint build` measured in the PDF)

## What it catches

A PDF longer than its venue allows for the paper's kind: more body pages than `body_pages_max`, or
more reference pages than `ref_pages_max`.

How the body is counted depends on the preset:

- **By default**, body and reference pages are banal's count: a page holding any text that is not
  bibliography is a body page.
- **With `"body_ends_at": "references"`** (AIDC), the body is every page up to where it ends: at
  the references or at the appendix, whichever comes first — «excluding references and
  appendices» excludes an appendix wherever it sits. What follows is not counted. The page the body
  ends on counts as body when body text stands above the heading there: a body that runs half a
  page past the limit is over the limit.

## How it finds where the body ends

Each end is found by a structural signal first, then its heading line on that page.

**The references.**

1. **hyperref's first bibliography entry.** hyperref writes a destination named `cite.<key>` for
   every `\bibitem`; the lowest page any of them is on is where the bibliography is. The build
   records it as `bib_anchor_page`.
2. **The heading.** A line that reads `References` or `Bibliography` — any case, spaces ignored
   (IEEEtran prints `REFERENCES` in small capitals, which the PDF may give as `R EFERENCES`),
   optionally numbered (`7 References`, `VII. REFERENCES`). A heading whose next line opens the
   first entry, `[1]`, is **confirmed**.

With the anchor, the references start on its page, at the confirmed heading there, else at the last
heading line on that page. Without hyperref: at the first confirmed heading, else at the first
heading line.

**The appendix.** hyperref's destination for the appendix's first section (`appendix.A` in the
standard classes) or the first bookmark titled «Appendix…» (IEEEtran's `\appendices`) gives its
page, recorded as `appendix_anchor_page`; on that page, the line reading `Appendix A.`,
`APPENDIX` or `Appendices`. Without hyperref the appendix is not looked for: a sentence can end on
a line reading «Appendix A.», and nothing would tell it from the heading.

On the page the body ends on, the lines above the heading decide: a line with a letter in it is
body text, unless it is a running header or footer — the same line, digits aside, on at least three
pages and a third of them. A page number is not body text either.

A line reading «References» that is not the bibliography's heading — a `\subsection*{References}`,
a table column headed «References» — is not taken for it: the anchor names another page, or the
line is not followed by `[1]`. When a structural signal and the text disagree — a `cite.<key>` page
with no heading on it, a confirmed heading on another page, an appendix page with no «Appendix»
line — the count is not made, and the rule says so (`unclear`).

## Why

AIDC limits the paper to 12 pages «excluding references and appendices», and places the LLM Usage
Statement after the references, where it «does not count towards the page limit». banal counts any
page with non-bibliography text as body, so a statement or appendix after the bibliography would
fail a correct paper. A body that runs onto the references page, even by a few lines, is a
thirteenth page — the desk-reject case this rule exists to catch.

## Examples

A 12-page AIDC paper whose conclusion ends at the foot of page 12, «References» at the top of page
13: body 12 pages, passes.

The same paper with the conclusion running four lines onto page 13, «References» below them:

> body pages (up to the references on page 13): 13, over the limit 12 for aidc/regular — a desk
> reject; cut the text

An accepted ACSAC paper that places its appendix tables before the bibliography: the appendix starts
at the top of page 12, the references on page 15. The body is 11 pages.

When a structural signal and the text disagree, the count is not made and the rule says so:

> could not tell where the body ends, so it was NOT counted against aidc's limit: the first
> bibliography entry is on page 14 (hyperref's destination), and no line on page 14 reads
> «References». Check the headings of the bibliography and the appendix, and that nothing before
> them reads «References» above a [1]

## Options / preset fields

No rule options. It reads, from the preset, `format.kinds.<kind>.body_pages_max`,
`format.kinds.<kind>.ref_pages_max` and `format.body_ends_at`; from the paper's `paperlint.json`,
`kind`. A preset with no kinds, or a kind with no limits, has nothing to check.

## What it does not check

- **An appendix before the references, without hyperref**, is counted as body: nothing structural
  says where it starts. With hyperref it ends the body.
- **An appendix whose heading does not read «Appendix…»** (the standard classes print `A` and the
  title) is reported as `unclear` when hyperref anchors it.
- **A bibliography that is not numbered and not linked by hyperref** has no confirmed heading and no
  anchor; the first line reading «References» is then taken, and a body line reading exactly that
  would be taken for it.
- **A running header that repeats on fewer than three pages** (a two-page paper) counts as body
  text above a heading at the top of a page.
- Whether the venue counts pages the same way for other kinds of material (supplementary files,
  artifact appendices).

## How to fix

Cut the body until it ends within the limit. With `body_ends_at`, check where the body ends on the
rendered PDF: body text above the heading on that page counts that page. For `unclear`, give the
bibliography its heading (`\bibliography`, `thebibliography`) and the appendix one reading
«Appendix», and make sure no line before them reads «References» above a `[1]`.
