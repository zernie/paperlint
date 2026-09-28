# tex/claim-provenance

**Level:** warn · **Reads:** `paper.tex`

## What it catches

A sentence of the body that states a number and does not say whose the number is. The sentence is
reported once, however many numbers it holds. Any one of these owners silences it:

| owner                        | in the sentence                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| a work outside the paper     | a `\cite` (any of natbib's or biblatex's forms), a `\url`, an `\href`, or a footnote that cites or links                          |
| the authors                  | _we_, _our_, _ours_, _us_ (the capitalised country _US_ is not the authors)                                                       |
| a place in the paper         | `\ref`, `\cref`, `\autoref` and their kin, or the words _Section 4_, _Table 2_, _Fig. 3_, _Appendix B_, _§4_                      |
| a claimant named as one      | _advertises_, _claims_: _"the skill advertises a 65% reduction"_, _"(claim 63%)"_                                                 |
| the sample the number counts | _n = 134_ (in prose or in math), or a count followed by what it counts: _48 runs_, _48 independent runs_, _of 1,836 repositories_ |

It reads the body: from the start of the document, the abstract included, to `\appendix` or the
bibliography. Footnotes are read as sentences of their own. A citation or a footnote set right after
the full stop belongs to the sentence the full stop ends.

A number is digits a reader sees — `42\%`, `0.37`, `1,836`, `3x`, `3×`. Not a number: a year on its
own (1900–2099); a number right after a capitalised word inside the sentence (_Claude 3_, _Python
3.12_, _Node 22_), which is a name; the level of an interval (the 95 of _95% CI_); digits glued to a letter, a hyphen or a point (`GPT-4`, `COVID-19`, `v1.2`, `10k`,
`0x1F`); anything inside math, a table, a figure, a caption, a heading, code, a comment, a macro
definition, or the title block.

## Why

A reviewer who cannot tell a property of the world from a cited finding from the authors' own
measurement says so, and scores the paper's soundness on it. Academic prose carries the owner by
default — _we found_, _[12] report_, _(Table 2)_ — and a sentence rewritten for punch loses it first:
_"Under test the rules held in 97% of cases"_ has no subject, and a reader takes it
for a result from the literature. This rule is the floor under the rules that shorten sentences.

## Examples

```latex
Agents ignore 42\% of the rules they are given.            % warns
Under test the rules held in 97\% of cases.                  % warns: no one ran the test
We find that agents ignore 42\% of the rules.                % silent: the authors
Agents ignore 42\% of the rules~\cite{smith2025}.            % silent: a citation
Agents ignore 42\% of the rules (Table~\ref{t:rates}).       % silent: a place in the paper
Of 1,836 repositories, 12\% ship hooks.                      % silent: the sample
In 2024 the first agents shipped with GPT-4.                 % silent: a year and a name
```

The first line reports:

> «42%» — whose number is this? A reader cannot tell a cited finding from your own measurement from
> a general fact. Say it in the sentence: cite the work (\cite), claim it (we measured, our census),
> point to where it is shown (\ref, Section N, Table N), or name the sample it counts (n = 134, 48
> runs)

## Options / preset fields

None. It is on, as a warning, for every `paper.tex`; turn it off or up in the `rules` setting like
any other rule.

## What it does not check

- Whether the owner is the right one: a citation that does not report the number, or a _we_ in a
  sentence about someone else's work, silences the sentence all the same.
- What a custom macro prints: `\rate{}` defined as `42\%` is not a number here. Text pulled in with
  `\input` is not read.
- Which numbers are names, beyond the two shapes it knows: a number after a lowercase word (_version
  3 of the model_) is read as a quantity, and so is the number of a name that opens the sentence
  (_Claude 3 fails …_).
- Whether a count followed by a plural noun is really the sample (_3 times faster_ passes as one).
- Markdown papers (`paper.md`): it reads the LaTeX parse tree only.

## How to fix

Say whose the number is, in the sentence — usually by putting back the subject a punchy rewrite took
out: _"We ran the rules in 48 sessions and saw no violation"_, not _"No violation in 48 runs."_ A
number that is common knowledge, or quoted on purpose, keeps its sentence with ESLint's directive and
the reason:

```latex
% eslint-disable-next-line tex/claim-provenance -- the venue's own page limit, quoted
The limit is 8.
```
