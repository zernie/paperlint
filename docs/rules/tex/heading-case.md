# tex/heading-case

**Level:** off unless turned on — the ACM presets turn it on at `error`, headline style · **Reads:**
`paper.tex` and the files it includes, one at a time

## What it catches

A word in the title of a `\section`, `\subsection`, `\subsubsection` or `\paragraph` — starred or
not, and the optional short title in brackets — that is not in the capitalization the style asks.

`style: "headline"` is the style ACM's proceedings instructions ask: capitalize the first and the
last word, the first word after a colon and every major word (nouns, pronouns, verbs, adjectives,
adverbs); lowercase articles, prepositions, `and` `but` `for` `or` `nor`, `to` and `as`; in a
hyphenated compound capitalize the first element and decide the others by the compound rule.

`style: "sentence"` asks for the first word only (see below why only that). `style: "off"` asks
for nothing.

It reports each word at the place it stands, with the word it wants, and **fixes** it (`--fix`)
wherever the fix is certain. The rule reads the file ESLint hands it, so a heading in
`sections/results.tex` is reported at that file and line and `--fix` edits that file.

## Why

An ACM proceedings publisher accepted a camera-ready with sentence-case headings
(`\section{Related work}`) and said so weeks later, when the paper had to be sent again for another
reason. Nothing in paperlint looked at heading case, so the defect went through every gate.

The requirement, verbatim, from Conference Publishing Consulting's help page
(https://www.conference-publishing.com/Help.php, read 2026-10-03), which produces the SIGSOFT and
SIGPLAN proceedings (ASE, ICSE, …) for ACM; the checklist of its author instructions
(https://www.conference-publishing.com/Instructions.php?Conf=ICSE12) says the paper "has the title
and all headings properly capitalized":

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

**What was checked and what was not.** That is one production vendor's page. The other vendors that
produce ACM proceedings (Sheridan, for CCS) were not read, and neither were IEEE's or ACL's author
kits. So the ACM family preset turns the rule on because the ACM venues share a template and the
requirement came from ACM proceedings, and **no other preset does**: a preset whose author kit has
been read and says the same adds the same line to its `rules`.

## Examples

Failing, under `{ "style": "headline" }`:

```latex
\section{Related work}                                   % «work» → «Work»
\subsection{The advertised savings don't show up}        % «advertised», «savings», «don't», «show», «up»
\section{Method: a cost-aware, correctness-gated harness} % «a» (after a colon), «cost-aware», «correctness-gated», «harness»
\subsection{A ceiling for any output-trimming tool}      % «ceiling», «any», «output-trimming», «tool»
\section{Discussion And Threats To Validity}             % «And» → «and», «To» → «to»
```

Passing:

```latex
\section{Related Work}
\subsection{The Advertised Savings Don't Show Up}
\section{Method: A Cost-Aware, Correctness-Gated Harness}
\subsection{A Ceiling for Any Output-Trimming Tool}
\section{Discussion and Threats to Validity}
\subsection{Multi-turn Agents in CI}          % a bound prefix: «Multi-Turn» passes too
\section{Evaluating \texttt{grep} on $k=3$}   % code and math are not read
```

A finding reads:

> \section: capitalize «work» → «Work» — the last word of a heading is capitalized (headline style)

## Options / preset fields

One option, `style`, and it is required once the rule is given options:

```jsonc
// a venue preset (presets/acm-sigconf.jsonc) or a paper's own paperlint.json
"rules": { "tex/heading-case": ["error", { "style": "headline" }] }
```

| `style`    | asks                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `headline` | everything above                                                                                   |
| `sentence` | the first word of a title is capitalized; never fixed (a product name in lowercase looks the same) |
| `off`      | nothing                                                                                            |

The rule is **optional**, like [`pdf/last-page-balance`](../../optional-rules.md): a preset turns it on,
and a paper turns it off for itself with `"rules": { "tex/heading-case": "off" }` in its
`paperlint.json`. Turned on with no `style` it reports once at the top of the file and says what to
set — a rule that is on and checks nothing would read as a clean paper.

A single heading that is right as written (a product that is spelled in lowercase) is kept with
ESLint's directive and its reason:

```latex
% eslint-disable-next-line tex/heading-case -- the tool is spelled in lowercase
\section{Evaluating vigiles}
```

## How a word is decided

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

### Sentence style

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
`smallWords` set to the lowercase class below):

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

## What it does not check

- A title in **sentence** style past its first word, for the reason above.
- A word of the **either** class in the middle of a title, in either case.
- Whether a word is a proper noun, except as a capital inside it: `Python` and `python` are both
  words the rule reads as «major», so a lowercase product name (`npm`, `vigiles`) is reported
  like any lowercase word. Set it in `\texttt{}` or keep it with a directive.
- The title of the paper, `\caption`, `\subparagraph`, a table's header, or a run-in label set with
  `\textbf{…}`: the headings above only.
- Spelling, and whether a heading is a good one.

## How to fix

`paperlint lint --fix` writes every fix the rule is sure of. A finding it did not fix (a word split
by markup, or in the **sentence** style) names the word and the form it wants: edit it by hand. If
the heading is right as written, keep it with a directive and its reason, or, when the venue does
not ask for headline style at all, set `"rules": { "tex/heading-case": "off" }` in the paper's
`paperlint.json`.
