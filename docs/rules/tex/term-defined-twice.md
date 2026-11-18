# tex/term-defined-twice

**Level:** off by default · **Reads:** `paper.tex` and the files it includes

## What it catches

A term set as a definition a second time. A reader who sees a word marked as a definition again
wonders whether it names a new idea. The rule reports at each later definition and names where the
first one stands.

What a definition is — the commands, the word count, the filters, the abstract left out — is the same
as for [`tex/term-before-definition`](term-before-definition.md#what-counts-as-a-definition). Two
definitions are of one term when their text is the same, case ignored (a term written in capitals
keeps its case).

## Turning it on

```json
{
  "rules": {
    "tex/term-defined-twice": ["warn", { "commands": ["emph"], "maxWords": 4 }]
  }
}
```

It is a separate rule from `tex/term-before-definition` because an author may keep a definition in
the introduction and again in the method on purpose, and still want to know where a word comes before
its meaning. See [optional rules](../../optional-rules.md).

## Why it is off by default

On the real-papers corpus (114 papers), with the default options, it reports 176 findings in 40
papers (measured 2026-11-19; the table is on the
[`tex/term-before-definition` page](term-before-definition.md#why-it-is-off-by-default)). Italics
used for stress repeat as often as definitions do.

## Examples

```latex
A \emph{witness} is a file the two readings disagree on.
...
Each \emph{witness} is kept.                % fires: defined again
```

```latex
A \emph{witness} is a file the two readings disagree on.
...
Each witness is kept.                       % passes: later mentions in roman
```

## Options / preset fields

`commands` and `maxWords`, as for [`tex/term-before-definition`](term-before-definition.md#options--preset-fields). No preset field.

## What it does not check

Whether the second definition is a deliberate gloss followed by a full definition; a definition in
plain words; `witnesses` against `witness`.

## How to fix

Keep one definition and set later mentions in roman, or point back to the first one.
