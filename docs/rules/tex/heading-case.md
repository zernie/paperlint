# tex/heading-case

**Level:** off unless turned on. Only the AgenticDev preset turns it on (`error`, `chicago-headline`)
· **Reads:** `paper.tex` and the files its body includes, one at a time · **Fixable:** `--fix`, for
`chicago-headline`

## What it catches

A word in the **paper's title** or in a **heading** that is not in the capitalization the venue
asks:

- the title: `\title{…}`, and the short title of `\title[short]{long}`;
- the headings: `\section`, `\subsection`, `\subsubsection`, `\paragraph` and `\subparagraph`,
  starred or not, each with its short title in brackets.

You say which style the title takes and which style the headings take. A level the venue sets
apart gets its own entry:

```ts
type CaseStyle = "chicago-headline" | "sentence" | "any";
type HeadingLevel =
  "section" | "subsection" | "subsubsection" | "paragraph" | "subparagraph";

interface HeadingCaseOptions {
  title: CaseStyle; // \title{…}, short title included
  headings: CaseStyle; // every heading command, starred or not, short title included
  levels?: Partial<Record<HeadingLevel, CaseStyle>>; // a level whose style differs from `headings`
}
```

```jsonc
// a venue preset, or a paper's own paperlint.json
"rules": {
  "tex/heading-case": ["error", { "title": "chicago-headline", "headings": "chicago-headline" }]
}
```

A heading takes `levels[its level]` when that is set, and `headings` otherwise. `levels` never
applies to the title.

Each finding is reported where the word stands, in the file it stands in: a title in the preamble
at its line there, a heading in `sections/results.tex` at that file and line. `--fix` edits that
file.

## The styles

Each style is named after the text that defines it. There is no style called just `headline`: see
[why](#why-not-one-headline-style).

| style              | authority                                                                                                                                                                  | what it checks                                                                                                                                                                                                                                  | what it leaves silent on purpose                                                                                                                                                                                                                           | `--fix`                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `chicago-headline` | Conference Publishing Consulting's quote of the _Chicago Manual of Style_, sections 8.157–8.159 ([Help.php](https://www.conference-publishing.com/Help.php), quoted below) | first and last word, the first word after a colon, and every major word are capitalized; articles, prepositions «regardless of length», `and` `but` `for` `or` `nor`, `to` and `as` are lowercase; hyphenated compounds by the publisher's rule | words that are a preposition in one title and a particle or conjunction in another (`up`, `over`, `in`, `if`, `that`, `using` …) in the middle of a title; the second element after a bound prefix (`Multi-turn`); names, acronyms, code, math (see below) | yes, where the source holds the word's letters side by side |
| `sentence`         | the venue's own words, e.g. NeurIPS: «lower case (except for first word and proper nouns)»                                                                                 | the first word is capitalized                                                                                                                                                                                                                   | every other word: a proper noun (_Python_, _Bayesian_) cannot be told from an over-capitalized word without a dictionary of names                                                                                                                          | no — a product name written in lowercase looks the same     |
| `any`              | —                                                                                                                                                                          | nothing                                                                                                                                                                                                                                         | everything: the venue sets no case for this scope                                                                                                                                                                                                          | —                                                           |

`chicago-headline` is the one headline variant built. Other variants are added one at a time, each
as a new style, when a preset needs one: [Adding a style](#adding-a-style).

## Why

An ACM proceedings publisher accepted a camera-ready with sentence-case headings
(`\section{Related work}`) and said so weeks later, when the paper had to be sent again for another
reason. Nothing in paperlint looked at heading case, so the defect went through every gate.

The requirement, verbatim, from Conference Publishing Consulting's help page
(https://www.conference-publishing.com/Help.php, read 2026-10-03). The vendor produces SIGSOFT and
SIGPLAN proceedings (ASE, ICSE, …) for ACM:

> Headline-Style Capitalization (according to the Chicago Manual of Style, Sections 8.157, 8.158,
> and 8.159)
> Capitalize: first and last word, first word after a colon (subtitle); all major words (nouns,
> pronouns, verbs, adjectives, adverbs)
> Lowercase: articles (the, a, an); prepositions (regardless of length); conjunctions (and, but,
> for, or, nor); to, as
> Hyphenated Compounds: always capitalize first element; lowercase second element for articles,
> prepositions, conjunctions and if the first element is a prefix or combining form that could not
> stand by itself (unless the second element is a proper noun / proper adjective)
> Examples: Multi-stage, Non-termination

Its author instructions name both scopes. The checklist
(https://www.conference-publishing.com/Instructions.php?Conf=ICSE12) asks whether the paper "has
the title and all headings properly capitalized", and an event's instructions
(https://www.conference-publishing.com/Instructions.php?Event=ITICSE18) say:

> The title should use headline-style capitalization (e.g., 'The Best POPL Paper of All Time')

> All levels of headings use headline-style capitalization.

So the rule reads the title as well as the headings.

## Venues, and which preset turns the rule on

What each venue's author text says about case, read 2026-10-04 unless marked. **Only the
`agenticdev` preset turns the rule on.** The others are off for one of two reasons, named in the
last column: the requirement was **not read**, or the venue asks for a **variant that is not built**
(a `chicago-headline` check there would report words the venue wants capitalized). "Not read" means
the page could not be opened. It never means the venue has no requirement.

| venue or publisher                                                      | title                                   | headings                                      | the text, verbatim                                                                                                                                                                                                                                                                                                                                                                | source                                                                                                                                                                                                                                           | paperlint preset                                                              |
| ----------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Conference Publishing Consulting** (ACM SIGSOFT, SIGPLAN; AgenticDev) | headline, Chicago                       | headline, all levels                          | quoted [above](#why)                                                                                                                                                                                                                                                                                                                                                              | [Help.php](https://www.conference-publishing.com/Help.php) · [ITiCSE18](https://www.conference-publishing.com/Instructions.php?Event=ITICSE18)                                                                                                   | `agenticdev`: **on**, `error`, `chicago-headline` for both                    |
| **Sheridan Communications** (ACM CCS)                                   | «Initial Caps», for the submission form | not stated                                    | «Be sure that the title is in Initial Caps -- Initial Caps Meaning First Letter of the Main Words Should be Made Capital Letters.» · «Capitalize the First Letter of Main Words in the Title (Most Nouns), except a, an, the, conjunctions (and, but, or, for,…), & prepositions (of, to, in, on,…)» — in the section on the submission page's fields, not about the PDF          | [CCS instructions](https://www.scomminc.com/pp/acmsig/ccs.htm)                                                                                                                                                                                   | `aisec`, `acm-sigconf`: off — the text is about the form field, not the paper |
| **ACM** (authors.acm.org, TAPS, proceedings template)                   | not read                                | not read                                      | HTTP 403 from the origin                                                                                                                                                                                                                                                                                                                                                          | [LaTeX](https://authors.acm.org/proceedings/production-information/preparing-your-article-with-latex) · [TAPS](https://www.acm.org/publications/taps/word-template-workflow) · [template](https://www.acm.org/publications/proceedings-template) | `acm-sigconf`: off — not read                                                 |
| **Springer LNCS** (guidelines, a conference's copy; `llncsdoc` 2025)    | headline, own wording                   | headline, all levels; corrected by typesetter | «Headings should be capitalized (i.e., nouns, verbs, and all other words except articles, prepositions, and conjunctions should be set with an initial capital)» · «Words joined by a hyphen are subject to a special rule. If the first word can stand alone, the second word should be capitalized.» · «the capitalization of the headings is checked and corrected if need be» | [guidelines](https://adc2020.github.io/documents/typeinst.pdf) · [llncsdoc](https://ctan.math.illinois.edu/macros/latex/contrib/llncs/llncsdoc.pdf) (Springer's own page asks for a login: not read)                                             | none — a `springer-headline` variant is not built                             |
| **IEEE Editorial Style Manual** (journals)                              | headline, IEEE's own list               | differs by level                              | «Prepositions of more than three letters (Before, From, Through, With, Versus, Among, Under, Between, Without) are capitalized.» · «Quaternary headings (subsect3) … only the first letter of the heading is capitalized.»                                                                                                                                                        | [manual (PDF)](https://journals.ieeeauthorcenter.ieee.org/wp-content/uploads/sites/7/IEEE-Editorial-Style-Manual-for-Authors.pdf)                                                                                                                | none — journals, and an `ieee-title` variant is not built                     |
| **IEEEtran HOWTO** (class documentation: guidance)                      | «generally capitalized»                 | not stated                                    | «Titles are generally capitalized except for words such as a, an, and, as, at, but, by, for, in, nor, of, on, or, the, to and up, which are usually not capitalized unless they are the first or last word of the title.»                                                                                                                                                         | [IEEEtran_HOWTO](https://us.mirrors.cicku.me/ctan/macros/latex/contrib/IEEEtran/IEEEtran_HOWTO.pdf)                                                                                                                                              | `ieee-conference`, `aidc`: off                                                |
| **IEEE conference template**                                            | not read                                | not read                                      | the download came back empty                                                                                                                                                                                                                                                                                                                                                      | [template (.docx)](https://www.ieee.org/content/dam/ieee-org/ieee/web/org/conferences/conference-template-a4.docx)                                                                                                                               | `ieee-conference`, `aidc`: off — not read                                     |
| **ACL / EMNLP / NAACL** (ACLPUB)                                        | title case, **APA**                     | not stated                                    | «Write the title in title case [a link to APA title case]; do not write the title in all capital letters, except for acronyms and names (e.g., "BLEU") that are normally written in all capitals.»                                                                                                                                                                                | [ACLPUB formatting](https://acl-org.github.io/ACLPUB/formatting.html) (`acl_latex.tex`: not read)                                                                                                                                                | `realm`: off — an `apa-title` variant is not built                            |
| **APA title case** (the authority ACL links)                            | —                                       | —                                             | capitalize «words of four letters or more (e.g., 'With,' 'Between,' 'From')» and «major words, including the second part of hyphenated major words (e.g., 'Self-Report')»                                                                                                                                                                                                         | [APA](https://apastyle.apa.org/style-grammar-guidelines/capitalization/title-case)                                                                                                                                                               | —                                                                             |
| **NeurIPS** (2023 template; 2025 not read)                              | «initial caps/lower case»               | **sentence**, all levels                      | «The paper title should be 17 point, initial caps/lower case, bold, centered between two horizontal rules.» · «All headings should be lower case (except for first word and proper nouns), flush left, and bold.»                                                                                                                                                                 | [neurips_2023.tex](https://media.neurips.cc/Conferences/NeurIPS2023/Styles/neurips_2023.tex)                                                                                                                                                     | none                                                                          |
| **ICML 2025**                                                           | «content words capitalized»             | «content words capitalized», ≤ 3 levels       | «The title should have content words capitalized.» · «Section headings should be numbered, flush left, and set in 11 pt bold type with the content words capitalized.»                                                                                                                                                                                                            | [example_paper.pdf](https://media.icml.cc/Conferences/ICML2025/Styles/example_paper.pdf)                                                                                                                                                         | none                                                                          |
| **AAAI** (an undated copy of the instructions; the 2026 kit not read)   | «mixed case»                            | «mixed case»                                  | «Your title must follow US capitalization rules» · first-level headings in «mixed case (initial capitals followed by lower case on all words except articles, conjunctions, and prepositions, which should appear entirely in lower case)»                                                                                                                                        | [copy (PDF)](https://pages.cs.wisc.edu/~ansari/nlp-report/formatting-instructions.pdf)                                                                                                                                                           | none                                                                          |
| **LIPIcs / Dagstuhl**                                                   | headline, Chicago **or** a web service  | headline, all headings, `\subparagraph*` too  | «For a detailed description, please use the Chicago Style Guideline or use a web service, such as http://individed.com/code/to-title-case/.» · «All headings, including the title, have to be left aligned and should be capitalized.»                                                                                                                                            | [instructions](https://submission.dagstuhl.de/styles/instructions/66)                                                                                                                                                                            | none                                                                          |
| **ICLR 2026**                                                           | small caps (the class sets it)          | small caps L1–L3 (the class)                  | «Paper title is 17 point, in small caps and left-aligned.»                                                                                                                                                                                                                                                                                                                        | [iclr2026_conference.tex](https://raw.githubusercontent.com/ICLR/Master-Template/master/iclr2026/iclr2026_conference.tex)                                                                                                                        | none                                                                          |
| **USENIX**, **Elsevier**, **PMLR**                                      | not stated                              | not stated                                    | no passage on capitalization in the pages read                                                                                                                                                                                                                                                                                                                                    | [USENIX](https://www.usenix.org/conferences/author-resources/paper-templates) · [Elsevier](https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions) · [PMLR](https://proceedings.mlr.press/faq.html)               | none                                                                          |
| **IJCAI**                                                               | not read                                | not read                                      | the page is silent; the rules are in the kit, which was not opened                                                                                                                                                                                                                                                                                                                | [authors kit](https://www.ijcai.org/authors_kit)                                                                                                                                                                                                 | none                                                                          |
| **Chicago Manual of Style** 8.159 itself                                | —                                       | —                                             | behind a login: not read. What this rule knows of Chicago is Conference Publishing's quote of it                                                                                                                                                                                                                                                                                  | [CMOS](https://www.chicagomanualofstyle.org/book/ed17/part2/ch08/psec159.html)                                                                                                                                                                   | —                                                                             |

Two things follow from the table. Venues speak in **two scopes**: the title, and "all headings".
Only the IEEE journal manual sets a level apart, which is what `levels` is for. And venues name
**different authorities**, which is why the style names one.

A paper whose venue has no preset here may turn the rule on in its own `paperlint.json`, with the
style its author kit names. Do not write `chicago-headline` for an APA or IEEE venue.

## Why not one `headline` style

Every variant above is called "headline" or "title case", and they disagree on real words:

| word, in the middle of a title        | Chicago (Conference Publishing)                        | APA (ACL's title)                      | IEEE manual (title)                          | Springer                                         |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `With`, `Between`, `From`, `Without`  | lowercase («regardless of length»)                     | **capitalized** (four letters or more) | **capitalized** (more than three letters)    | lowercase (listed: «from, with, without, under») |
| `If`, `That`, `Because`               | not on the lowercase list                              | `if` lowercase (a short conjunction)   | **capitalized** (subordinating conjunctions) | not named                                        |
| `Self-determinations` / `Self-Report` | `self` is not a bound prefix, so `Self-Determinations` | `Self-Report` capitalized              | —                                            | **`Self-determinations`** (their example)        |

On 277 `acmart` papers this rule found 60 capitals it would lowercase (`Across`, `With`, `Between`,
`To`, `From`, `Of`, `Without`, `Against`, `And`, `Versus` …). Under Chicago every one is a correct
finding. Under APA or IEEE the ones of four letters or more are capitals those venues require. A
single value called `headline` would let a preset author write it for an ACL venue and fail correct
titles there at `error`. So the value names its authority, and `headline` on its own is refused
with a message naming `chicago-headline`.

## Adding a style

A new style is added only when a preset needs it, and the change only adds: no existing name
changes what it means. The names reserved for this are `apa-title`, `springer-headline`,
`ieee-title`, and a loose `headline` that would report only what every variant agrees on. None of
them exists yet. Each one needs:

1. **The venue's quote**, verbatim, with its URL and the date it was read. It goes on this page
   and in the preset that uses the style.
2. **A word-class table of its own**: which words are lowercase, which are major, and which are
   ambiguous and left unread, for that authority. The silent set belongs to the variant, not to the
   config.
3. **Tests on real titles of that venue**: accepted papers built from the venue's template, with
   the expected verdicts established by reading the papers rather than by running the rule, and
   variants of those titles that change one thing each.
4. **A new member of `CaseStyle`** in `src/domain/heading-case.ts` with its judge (an exhaustive
   `switch` makes TypeScript list every place that must handle it), and a row in the tables above.

## Examples

Failing, under `{ "title": "chicago-headline", "headings": "chicago-headline" }`:

```latex
\title[short form]{Measuring the wrong thing}             % «short», «form» (\title[…]); «wrong», «thing» (\title)
\section{Related work}                                   % «work» → «Work»
\subsection{The advertised savings don't show up}        % «advertised», «savings», «don't», «show», «up»
\section{Method: a cost-aware, correctness-gated harness} % «a» (after a colon), «cost-aware», «correctness-gated», «harness»
\section{Discussion And Threats To Validity}             % «And» → «and», «To» → «to»
```

Passing:

```latex
\title[Short Form]{Measuring the Wrong Thing}
\section{Related Work}
\subsection{The Advertised Savings Don't Show Up}
\section{Method: A Cost-Aware, Correctness-Gated Harness}
\section{Discussion and Threats to Validity}
\subsection{Multi-turn Agents in CI}          % a bound prefix: «Multi-Turn» passes too
\section{Evaluating \texttt{grep} on $k=3$}   % code and math are not read
```

A finding reads:

> \section: capitalize «work» → «Work» — the last word of a heading is capitalized (chicago-headline)

**A level set apart.** A venue that wants headline style everywhere but sentence case for run-in
`\paragraph` headings:

```jsonc
"tex/heading-case": ["error", {
  "title": "chicago-headline",
  "headings": "chicago-headline",
  "levels": { "paragraph": "sentence" }
}]
```

```latex
\section{Related Work}                 % passes: headings
\paragraph{Threats to validity.}       % passes: paragraph is sentence
\paragraph{threats to validity.}       % «threats» → «Threats» (sentence; not fixed)
```

**Sentence headings, and a title rule that names no authority.** NeurIPS asks for sentence-case
headings; its title rule («initial caps/lower case») names no headline variant, so leave the title
open:

```jsonc
"tex/heading-case": ["warn", { "title": "any", "headings": "sentence" }]
```

```latex
\section{Related work}        % passes
\section{related work}        % «related» → «Related» (sentence; not fixed)
```

## Options / preset fields

`title` and `headings` are required; `levels` is optional; no other key is accepted, at either
level. The rule is **optional**, like [`pdf/last-page-balance`](../../optional-rules.md): a preset
turns it on, and a paper turns it off for itself with `"rules": { "tex/heading-case": "off" }` in
its `paperlint.json`.

ESLint replaces a rule's options as a whole, so a paper that changes one scope of its preset's
setting writes all of it again: `title`, `headings` and any `levels`.

**What is refused, and when.** ESLint's schema checks the shape when it loads the config; the rule
checks the values when ESLint loads it. Either way the run stops before anything is reported:

| you wrote                                             | you get                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `"headline"`                                          | refused: write `"chicago-headline"`; the other headline variants (APA, IEEE, Springer) are not implemented yet                       |
| `"off"` as a style                                    | refused: write `"any"` for a scope with no requirement, or turn the rule off                                                         |
| a misspelt style (`"chicago-headlin"`, `"Sentence"`)  | refused, naming the styles there are and where the bad value stands (`"levels.paragraph"`)                                           |
| `"any"` for `title` and `headings`, no stricter level | refused: that is the rule turned off. Remove it from `rules` or set it to `"off"`                                                    |
| a missing `title` or `headings`                       | ESLint: `should have required property 'title'`                                                                                      |
| an unknown key (the old `"style"`, `"captions"`)      | ESLint: `Unexpected property "style". Expected properties: "title", "headings", "levels".`                                           |
| an unknown level (`"chapter"`)                        | ESLint: `Unexpected property "chapter". Expected properties: "section", "subsection", "subsubsection", "paragraph", "subparagraph".` |
| `"error"` with no options                             | ESLint accepts it, so the rule reports once at the top of each file that it judged nothing, and shows the shape to write             |

A single heading that is right as written (a product that is spelled in lowercase) is kept with
ESLint's directive and its reason:

```latex
% eslint-disable-next-line tex/heading-case -- the tool is spelled in lowercase
\section{Evaluating vigiles}
```

## How a word is decided, under `chicago-headline`

Every word gets one of four classes. Only the first two can ever be reported, and the rule was
built so that a word it is unsure of lands in the third.

| class      | words                                                                                                                                                                                                                                                                                                                                          | between the first and the last word | first, last, after a colon |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------- |
| **lower**  | `the a an` · `and but for or nor` · `to as` · `of at by from into onto upon via per with within without during among amongst against between across throughout toward towards amid despite versus beneath beside`                                                                                                                              | lowercase                           | capitalized                |
| **major**  | every word on no list: nouns, verbs, adjectives, adverbs, pronouns, `is` `it` `this` `any` `not` …                                                                                                                                                                                                                                             | capitalized                         | capitalized                |
| **either** | `up down over out off on in through under around about above below along after before behind near past inside outside beyond like than since until till vs` · `if because while when where whether although though whereas unless once so yet that how` · `using following including regarding concerning given excluding considering besides` | **not read, in either case**        | capitalized                |
| **name**   | `von van de der den da di du del della la le el`                                                                                                                                                                                                                                                                                               | not read                            | not read                   |

The **either** class is the ambiguity rule. `up`, `over`, `out`, `off`, `on`, `in` are prepositions
in one title and particles in another (_Scaling up_, _Turning Off the Cache_), `if`, `while`,
`that`, `than` are conjunctions the publisher's list does not name, and `using`, `following` are
prepositions in some grammars and verbs in others. For these the rule says nothing in the middle of
a title, in either case, and never offers a fix. At the ends and after a colon the case is not in
doubt: a title begins and ends with a capital.

A finding at error level that is wrong costs more than a finding missed, so the rule also does not
read:

- a word with a capital anywhere past its first letter (`LLM`, `LLMs`, `GitHub`, `iOS`);
- a single letter other than the lowercase article (`k`, `n`, and the capital in `Module A`);
- anything with a digit, a dot, a slash or a TeX accent in it (`GPT-4`, `e.g.`,
  `input/output`, `Caf\'e`);
- everything set in math or code, and every command whose text is not plain: `\texttt`, `\textsc`,
  `\cite`, `\ref`, … A formatting command is read as the words it wraps (`\emph{very}`, `\textbf{…}`,
  `\textit{…}`); `\label`, `\footnote`, `\thanks` and `\index` are not part of the title.
  A group written right after a macro of your own (`\ours{…}`, `\finding{label}{a sentence}`) is
  that macro's argument, and is not read either.

A word that stands beside something the rule does not read is not known to be first or last, so a
minor word there is left as it is (`\texttt{grep} And Friends`, `Results For $k$`).

### Hyphenated compounds

The first element is capitalized. Each later element is lowercase when it is an article, a
preposition or a conjunction (_Peer-to-Peer_, _State-of-the-Art_, _Question-and-Answer_), and
capitalized otherwise (_Cost-Aware_, _Output-Trimming_, _Self-Supervised_, _Fine-Tuning_).

After a **bound prefix** the second element is not read — _Multi-turn_ and _Multi-Turn_ both pass.
The publisher's text asks for lowercase there («Multi-stage, Non-termination») and adds «unless the
second element is a proper noun / proper adjective» (_Non-Western_), and the rule cannot tell a
prefix from a first element that merely looks like one. The list is small and fixed:

`anti` `co` `de` `inter` `intra` `multi` `non` `post` `pre` `pseudo` `quasi` `re` `semi` `sub`
`trans` `ultra` `un`

Not on it: `self` (_Self-Supervised_ capitalizes), `cross`, `meta`, `over`, `under`, `micro`,
`mini`, `super`, `mid`, `counter`, `pro` — each stands by itself, or is not certain not to. A
compound with a single-letter element (`k-means`, `e-mail`, `x-axis`) is not read.

### Sentence

Sentence case cannot be judged word by word: a proper noun (_Python_, _Alice_, _Bayesian_) is
capitalized in the middle of a sentence-case title, and nothing in the text tells it from an
over-capitalized word. So the style asks for the first word only, and offers no fix. If you need
more, it is a case for a dictionary of names and is not built.

## Prior art — why this is not `title-case`

Checked before writing it, as this repository asks. The four npm libraries that title-case a string
were installed and run on the same headings (2026-10-03; `title-case` 4.3.2, `ap-style-title-case`
2.0.0, `titlecase` 1.1.3, `chicago-capitalize` 0.1.0). Each turns a string into a string; none says
where a word stands or which word it was unsure of, and they disagree with each other where the
publisher's text is specific or silent:

| input                                      | `title-case`              | `ap-style-title-case`     | `titlecase`               | `chicago-capitalize`      | the publisher                            |
| ------------------------------------------ | ------------------------- | ------------------------- | ------------------------- | ------------------------- | ---------------------------------------- |
| `Multi-turn agents in the wild`            | `Multi-Turn …`            | `Multi-Turn …`            | `Multi-Turn …`            | `Multi-Turn …`            | lowercase after a prefix (`Multi-stage`) |
| `Non-trivial pre-trained models`           | `Non-Trivial Pre-Trained` | `Non-Trivial Pre-Trained` | `Non-Trivial Pre-Trained` | `Non-Trivial Pre-Trained` | lowercase after a prefix                 |
| `Results for $k=3$`                        | `… $K=3$`                 | `… $k=3$`                 | `… $K=3$`                 | `… $K=3$`                 | math is not text                         |
| `Looking at the data over time`            | `… Data over Time`        | `… Data Over Time`        | `… Data Over Time`        | `… Data Over Time`        | `over` is not decided                    |
| `Scaling up the pipeline`                  | `Scaling up …`            | `Scaling up …`            | `Scaling Up …`            | `Scaling up …`            | `up` is not decided                      |
| `Why the tool is safe if used as intended` | `… if Used as …`          | `… If Used As …`          | `… if Used as …`          | `… if Used as …`          | `as` lowercase; `if` is not named        |

A checker built on them would compare a string with its title-cased copy and report every place the
two disagree: the first three rows are findings that are wrong, the last three are three different
answers to a question the publisher leaves open. `title-case` takes a `smallWords` option, so the
next question was whether our own lists inside it would do. They do not (`title-case` 4.3.2 with
`smallWords` set to the lowercase class above):

| input                       | result                      | what is wrong                                            |
| --------------------------- | --------------------------- | -------------------------------------------------------- |
| `iOS builds and k-means`    | `IOS Builds and K-Means`    | a name and a symbol are rewritten                        |
| `Pitfalls, e.g., timeouts`  | `Pitfalls, E.g., Timeouts`  | an abbreviation is rewritten                             |
| `\texttt{grep} and friends` | `\Texttt{grep} and Friends` | a command name is rewritten                              |
| `Fast And $k$`              | `Fast And $K$`              | math is rewritten                                        |
| `multi-turn agents`         | `Multi-Turn Agents`         | no way to say «a prefix leaves its second element alone» |
| `scaling up the pipeline`   | `Scaling Up the Pipeline`   | no third value: a word is lower or it is not             |

It also returns no offset, which a fix needs, and its own list puts `only`, `some` and `neither`
among the lowercase words, which the publisher's text makes major. What is reusable is a `toUpperCase`;
the rule is the word classes, the places, the compounds and what it leaves unread, so it is written
here.

## Measured on real ACM papers

A rule that judges a venue's requirement is validated on papers of that venue, not on fixtures its
author wrote. Two corpora, 2026-10-03, both measured on headings, before the rule read `\title`:

- **The accepted paper in this repository**, `fixtures/accepted-papers/agenticdev-acm26`: 9
  headings, 6 of them in sentence case — the camera-ready the publisher sent back for exactly that.
  The rule reports 18 words, every one a true positive, and its fixes write the six corrected
  headings ([`fixtures/accepted-papers/README.md`](../../../fixtures/accepted-papers/README.md)).
  Its `\title` and short title, read since 2026-10-04, are already in headline style and add no
  finding.
- **277 `acmart` sources from arXiv** (authors' versions of papers whose arXiv comment names an ACM
  venue — ICSE, ASE, FSE, ISSTA, CCS, CHI, CSCW, MSR and others; acceptance was **not** verified
  paper by paper, and they are not the copy-edited proceedings versions, so many are in sentence
  case). Not committed: the licences differ. 9 515 headings; 93 papers drew no finding, 184 drew
  2 697 findings, and **a finding is not a miss of the rule**: in a sentence-case paper nearly every
  heading is one. The titles of this corpus have not been run.

On the second corpus the findings were read, not counted: all 60 where a capital would become
lowercase (`Across`, `With`, `Between`, `To`, `From`, `Of`, `Without`, `Against`, `And`, `Versus`
…), every compound, every flagged word of six letters or fewer, and every finding in the 59 papers
with one or two. Three false-finding classes came out of that reading, each now a test:

| what the rule did                                                       | what it was                                                              | now                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| lowercased `A` in `Module A: Element Relation`                          | a capital letter that labels something, not an article                   | a single letter other than lowercase `a` is not read |
| capitalized `using`, `following`, `including`, `given`                  | prepositions in some grammars, verbs in others                           | in the **either** class                              |
| read the words of `\finding{label}{a sentence of words}` as title words | a group right after a macro of the author's own is that macro's argument | not read                                             |

One class remains and is documented, not fixed: a **lowercase name set in plain text** is read as a
lowercase word (`\paragraph{libssh}`, `keygen`: 2 findings in 2 697). The rule cannot tell a tool
from a noun without a dictionary; set the name in `\texttt{}` or keep it with a directive (above).

## What it does not check

- A title or heading in **sentence** style past its first word, for the reason above.
- A word of the **either** class in the middle of a title, in either case.
- Whether a word is a proper noun, except as a capital inside it: `Python` and `python` are both
  words the rule reads as «major», so a lowercase product name (`npm`, `vigiles`) is reported
  like any lowercase word. Set it in `\texttt{}` or keep it with a directive.
- A `\title` in a file the **preamble** includes: paperlint lints the files the body includes, not
  the preamble's (those hold macros, not the paper). Keep `\title` in `paper.tex`, or in a file
  included after `\begin{document}`.
- `\subtitle`, `\caption`, a table's header, or a run-in label set with `\textbf{…}`: the title and
  the headings above only.
- Spelling, and whether a heading is a good one.

## How to fix

`paperlint lint --fix` writes every fix the rule is sure of. A finding it did not fix (a word split
by markup, or in the **sentence** style) names the word and the form it wants: edit it by hand. If
the heading is right as written, keep it with a directive and its reason. If the venue does not
ask for this style at all, set `"rules": { "tex/heading-case": "off" }` in the paper's
`paperlint.json`.
