# Optional rules

Some checks matter only for some venues. paperlint ships them **off**. A venue preset that needs one
turns it on for its papers (AgenticDev's turns on `pdf/last-page-balance`), and a paper can turn one
on or off for itself in its own `paperlint.json`
([`configuration.md`](configuration.md#three-levels-of-settings)). No glob is involved: a paper's
rules apply to that paper. The `rules` setting of your `package.json` still overrides both, for one
paper or many ([`configuration.md`](configuration.md#the-rules-key-turning-rules-on-and-off)).

| rule                    | what it checks                                                | who needs it                                              |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `pdf/last-page-balance` | the two columns of the last page end at about the same height | two-column papers whose publisher asks for it — see below |

## `pdf/last-page-balance`

### Turning it on

A paper that extends `paperlint:agenticdev` has it already, at 120 pt. For any other paper, in its
`papers/my-paper/paperlint.json`:

```json
{
  "extends": "paperlint:aisec",
  "kind": "research",
  "rules": { "pdf/last-page-balance": ["error", { "tolerancePt": 120 }] }
}
```

It applies to that paper alone; `"off"` there turns it off for a paper whose preset turns it on. `tolerancePt` is how far apart, in points, the two
columns may end; it defaults to 120. On a real accepted paper the balanced build ended 2.7 pt apart
and the one the publisher sent back 321.4 pt apart — nothing in between — so the default leaves a
wide margin on both sides.

### What it reads

The rule does not open the PDF to measure it. `paperlint build` measures every PDF it builds and writes
the result to `<paper>/_build/paper.facts.json` ([`configuration.md`](configuration.md#how-paperlint-build-compiles-a-paper)),
and the rule judges that file, reporting on the paper's `paper.tex` at the `\documentclass` line.
So: **build, then lint.**

| the rule finds                                      | it says                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| columns further apart than `tolerancePt`            | **the finding**, with both heights and how to fix it (below)                                                                      |
| no `_build/paper.facts.json`                        | build the paper first — unless the paper extends a venue preset: then `pdf/measured` already warns, once, and this rule is silent |
| facts about a different PDF than the one on disk    | the facts are stale (their SHA-256 differs) — rebuild                                                                             |
| facts whose PDF is gone (a failed build removes it) | rebuild                                                                                                                           |
| a last page of a few lines                          | nothing — there is no layout to balance                                                                                           |
| a review build with numbered lines                  | nothing — the numbers run down the whole page, so both columns measure full height, and balance is a camera-ready requirement     |

If you turn the rule on — in a `paperlint.json` beside no `paper.tex`, or with a `files` glob in
`package.json` that reaches none — `paperlint lint` fails and says so, rather than reporting a clean
run for a rule that never ran.

### Which venues need it

Researched 2026-09-24 from the publishers' own pages. The requirement comes from some **production
vendors**, not from the paper templates, and no standard format checker tests it — HotCRP's
[`checkformat.php`](https://github.com/kohler/hotcrp/blob/master/src/checkformat.php) with
[banal](https://github.com/kohler/hotcrp/blob/master/src/banal), ACL's
[aclpubcheck](https://github.com/acl-org/aclpubcheck) and IEEE PDF eXpress all leave it alone.

| venue or publisher                                                                                      | balance required?                                                                                                                   | source                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conference Publishing Consulting** (produces ICSE, ASE and other SIGSOFT/SIGPLAN proceedings for ACM) | **yes** — the paper "has balanced columns on the last page, if the page is not filled"; problem papers are sent back to the authors | [instructions](https://www.conference-publishing.com/Instructions.php?Conf=ICSE12) · [help](https://www.conference-publishing.com/Help.php) · [procedure](https://www.conference-publishing.com/Procedure.html) |
| **Sheridan Communications** (ACM SIG conferences, e.g. CCS)                                             | **yes** — "balance the last page into 2 even length columns"                                                                        | [CCS instructions](https://www.scomminc.com/pp/acmsig/ccs.htm)                                                                                                                                                  |
| ACM `acmart` class                                                                                      | the class balances by default (option `balance`); no ACM-wide written rule was found                                                | [acmart on CTAN](https://ctan.org/pkg/acmart) · [acmart issue #328](https://github.com/borisveytsman/acmart/issues/328)                                                                                         |
| IEEE (`IEEEtran`)                                                                                       | **advised** for camera-ready, not a written rule; PDF eXpress does not check it                                                     | [IEEEtran on CTAN](https://ctan.org/pkg/ieeetran) (`IEEEtran_HOWTO`, pp. 16–17)                                                                                                                                 |
| ACL                                                                                                     | no                                                                                                                                  | [aclpubcheck](https://github.com/acl-org/aclpubcheck) has no such check                                                                                                                                         |
| USENIX, AAAI, ICML                                                                                      | not mentioned in their 2025–2026 author instructions                                                                                | —                                                                                                                                                                                                               |
| NeurIPS, Springer LNCS                                                                                  | not applicable — one column                                                                                                         | —                                                                                                                                                                                                               |

⚠️ **ACM TAPS venues:** ACM's TAPS system compiles the final PDF itself from your source. A fix that
lives only in a generated file (an edited `.bbl`) may never reach the proceedings; put the fix in
your source.

### Fixing it by hand

paperlint does not fix it for you, deliberately: every mechanism is documented as unreliable by its own
authors, and a layout change can silently move a page break in a paper whose page count is
limited. Conference Publishing Consulting's own advice, in its order:

1. > "For the ACMART style, use option 'balance' or, if this does not work, option 'pbalance'."

   `balance` is already acmart's default, and it calls `\balance` from the **second** column of the
   last page — where balance.sty does nothing. That is the usual case when the last page is all
   bibliography. So try `\documentclass[…,pbalance]{acmart}` (acmart calls it experimental; it
   needs an extra LaTeX pass and may give up).

2. `\usepackage{flushend}`. IEEEtran's guide warns of "a spacing anomaly between two lines within
   a reference in the second column of the last page".
3. `\balance` (from balance.sty) placed in what would be the **first** column of the last page. In
   a bibliography that means inside `\begin{thebibliography}`, before the `\bibitem` that starts the
   last page's first column; the balance documentation says it "should be issued somewhere in the
   text of what would be the first column of the last page".
4. A `\newpage` between references in the `.bbl` file (the vendor's fourth option) — the most
   fragile, since bibtex rewrites the `.bbl` on every build.

For IEEEtran, the class's own guide recommends `\IEEEtriggeratref{N}` over any package.

Then `paperlint build` again and `paperlint lint` again.

### Why it is not part of `paperlint build`

Until 2026-09-24 `paperlint build` searched for a `\balance` position itself — rebuilding once per
bibliography entry — and failed the build, deleting the PDF, when none worked. It was removed:
only some venues ask for balance, a build step cannot be turned on per venue, given a severity or
suppressed with a reason, and an automatic layout change was the one place the build rewrote a
paper's output behind the author's back. The build now only measures; the rule judges.
