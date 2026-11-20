# tex/term-before-definition

**Level:** off by default · **Reads:** `paper.tex` and the files it includes

## What it catches

A term the body defines, used before that definition. A paper that sets a new word in italics where
it explains it (`a file the two readings disagree on is a \emph{witness}`) has marked the definition;
a reader who meets the word earlier meets it with no meaning. The rule reports once per term, at the
**first** earlier use, with the command and place of the definition and how many uses come before it.

When the rule is on and the body sets no term with the configured commands, it reports that once, at
the body's start: a rule that checks nothing must not look like a clean pass.

## What counts as a definition

A phrase set with a command in `commands` (default `\emph` alone) that:

- stands in the body, after the abstract and before `\appendix` or the bibliography;
- is not a run-in heading (`\emph{Scope.} …` opening a paragraph). A list item's label without a
  stop (`\item \emph{Gate}: blocks …`) is a definition;
- is 1 to `maxWords` words (default 4);
- holds no digit and does not end on `.`, `:`, `;`, `,`, `!` or `?`;
- holds at least one word that is not a function word (a closed list of about 100 articles,
  conjunctions, negations, quantifiers, modals, pronouns, prepositions and auxiliaries in
  `src/domain/term-definitions.ts`: `\emph{not}` stresses a word, it defines none).

## What counts as a use

- The term in a sentence of the body: paragraphs, list items, footnotes; never a heading, a caption,
  a float, a table, code or math.
- Whole words, case ignored, any spacing between the words of a multi-word term. A term written in
  capitals (`CI`) keeps its case.
- The last word as written, with `s`, with `es`, `y` → `ies`, or — when it ends in `s` — without it.
- Not a use: one in the abstract (a summary read on its own), and one in the sentence that holds the
  definition (`a file, which we call a \emph{witness}` defines once).

## Turning it on

```json
{
  "rules": {
    "tex/term-before-definition": [
      "warn",
      { "commands": ["emph"], "maxWords": 4 }
    ]
  }
}
```

`warn` is the level to use: `error` makes the edit hook block, and on the papers below a share of
the findings are italics used for stress. See [optional rules](../../optional-rules.md).

## Why it is off by default

The rule is right only for a paper that marks its definitions with the commands it reads. On the
real-papers corpus (`fixtures/real-papers/accepted/`, `fixtures/real-papers/preprints/`; 114 papers, each with the
files its build recorded spliced in), with the default options, measured 2026-11-19:

|                                                                          | papers    | findings |
| ------------------------------------------------------------------------ | --------- | -------- |
| a term used before its definition                                        | 61        | 299      |
| a term defined twice ([`tex/term-defined-twice`](term-defined-twice.md)) | 40        | 176      |
| either                                                                   | 64 of 114 |          |
| no term set with `\emph` (the "checks nothing" notice)                   | 38        | 38       |

The findings were not judged one by one. A sample reads as a mix: real terms used early
(«bilateral trade», «simulation corpus») and words in italics for stress («below», «better»). Among
other people's papers, italics mostly stress a word or label an item; a paper that uses them to
define one is the paper this rule is for.

## Examples

```latex
A gate runs before every call.                     % fires: «gate» before its definition
...
A \emph{gate} is a check that blocks a call.
```

```latex
A \emph{gate} is a check that blocks a call.       % passes: defined, then used
The gate holds.
```

## Options / preset fields

- `commands`: the commands that mark a definition. Any of `emph`, `textit`, `textsl`, `textbf`,
  `underline`, `uline`, `em`, `itshape`, `it`, `slshape`, `bfseries`, `bf`; default `["emph"]`.
- `maxWords`: the longest phrase read as a term; default 4.

No preset field.

## What it does not check

- A term defined in plain words without the marking command (`we call such a file a witness`).
- Whether an earlier use already explains itself (`eligible requirements, those that …`).
- Synonyms, hyphen variants, irregular plurals: `witnesses` is not `witness`.
- A term used only inside a macro (`\toolname`), a caption, a table or a heading.
- A dedicated definition macro such as `\defn{…}`: an unknown macro's argument is not read as prose.

## How to fix

Move the definition to the first use, or say at the first use in plain words what the term means.
