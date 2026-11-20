# tex/max-sentence-words

**Level:** off by default; in the opt-in set [`paperlint:writing`](../../optional-rules.md#the-writing-set-paperlintwriting) · **Reads:** `paper.tex` and the files it includes

## What it catches

A sentence of the body longer than `max` words (default 55, so a 56th word fires). It reports once per sentence, at its start, with the word count and the sentence's first words.

## How it counts

- Words are counted as [`tex/register`](register.md) counts them: a citation, a cross-reference or inline math is one word.
- A sentence is cut by the one splitter every rule over the body uses (`src/domain/sentences.ts`): the sentence boundaries of `Intl.Segmenter`, with a break after an abbreviation undone. The abbreviations are `e.g.`, `i.e.`, `cf.`, `vs.`, `et al.`, `Fig.`, `Figs.`, `Sec.`, `Secs.`, `Tab.`, `Eq.`, `Eqs.`, `No.`, `App.`, `approx.`, `resp.`. A decimal (`2.5`) does not end a sentence.
- `Intl.Segmenter` never breaks before a lowercase word (rule SB8 of Unicode's UAX #29), so the splitter puts that break back: `16 GB. fp16 is …` is two sentences, and so is a sentence that opens with a `\citet`, a `\cref` or a macro that prints nothing, followed by a lowercase verb. A citation that opens a sentence this way counts in the sentence it opens. Before a lowercase word, a full stop also ends no sentence after a dotted abbreviation (`i.i.d.`, `w.r.t.`, `Ph.D.`), an initial (`Y.`), an ellipsis, `etc.`, `Appx.`, `Art.`, `Def.`, `Thm.`, `Lem.`, `Prop.`, `Alg.`, `Ch.`, `Vol.`, `pp.`, `Ref.`, `Refs.`, `refs.`, `Eqn.`, `Eqns.`, `eqn.`, `eq.`, `eqs.`, `Co.`, `Inc.`, `Ltd.`, `Corp.`, `avg.`, `func.` and `dim.`, or when a bracket follows it (`(Disp.) is`).
- A sentence never crosses a paragraph, a list item or a footnote.
- Scope: the body's prose, as for [`tex/max-paragraph-words`](max-paragraph-words.md).

## Turning it on

The rule is registered and silent until a project turns it on. No call for papers states this limit,
so no venue preset carries the number. In the root `paperlint.json`, or in one paper's own:

```json
{
  "rules": { "tex/max-sentence-words": ["warn", { "max": 55 }] }
}
```

See [optional rules](../../optional-rules.md).

## Why

A very long sentence loses its subject before its verb, and a skimming reviewer stops reading it.

The default is a general one, not measured per venue. It has not been checked against the accepted
papers of `fixtures/real-papers/accepted/` in this version; the earlier draft of the issue recorded that
every accepted paper fires at least one of the two sibling ceilings, which is why both are off.

## Examples

```latex
One sentence of sixty words that never reaches its full stop ...      % fires: over 55 words
```

## Options / preset fields

`{ "max": 55 }` — an integer, the largest value that does not fire. No preset field.

## What it does not check

An abbreviation outside the lists above, such as `etc.` or `Dr.` followed by a capital letter, or a paper's own truncation (`Comp.`, `Det.`) followed by a lowercase word, ends a sentence early, so a long sentence may be seen as two. A `\num…` macro leaves no word in the parsed prose, so it is not counted as a word.

## How to fix

Cut the sentence where a clause could stand alone, or turn a run of cases into a list.
