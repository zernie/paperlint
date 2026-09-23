# How comparable tools shape their README

**The question:** our README read like notes for the maintainer. How do well-regarded tools of the
same kind — a linter with a CLI, for a particular kind of document, often with an editor or agent
integration — lead a new reader from "what is this" to "it works on my files"?

Fetched 2026-09-23 from the raw README on each project's default branch (URLs below). Line
numbers are in the raw file, so they include badges and HTML banners. "First code block" is the
first fenced or indented block a reader can copy.

## The measurements

| tool                        | lines | tagline at | first code block | install at | first run at | how output is shown                                                     | pushed out of the README                          |
| --------------------------- | ----: | ---------: | ---------------: | ---------: | -----------: | ----------------------------------------------------------------------- | ------------------------------------------------- |
| **Vale** (prose linter)     |   175 |          8 |               37 |        119 |       38/149 | a real `console` block: commands, then findings, then a total           | per-OS install matrix, quickstart walk-through    |
| **textlint**                |   629 |         10 |               45 |         41 |          100 | a screenshot of the pretty formatter                                    | getting-started guide, rule collection (wiki)     |
| **markdownlint-cli2**       |   591 |          3 |               13 |          9 |          111 | not shown; `--help` text verbatim, and exit codes 0/1/2 listed          | rule list, each formatter's own README            |
| **TeXtidote** (LaTeX)       |   773 |          1 |               46 |         34 |           72 | verbatim text block, then every field of a finding explained            | nothing — one long manual                         |
| **Ruff**                    |   454 |         14 |              124 |        114 |          124 | a benchmark chart, no findings                                          | rules, settings, editors — all on docs.astral.sh  |
| **Biome**                   |   204 |         37 |               49 |         47 |           56 | not shown                                                               | everything past "Usage" goes to biomejs.dev       |
| **lychee** (link checker)   |   978 |         13 |               54 |         48 |          295 | an animated terminal recording at line 22                               | usage guide on the website                        |
| **cspell**                  |   224 |         12 |             none |          — |            — | —                                                                       | everything: the README is a pointer to cspell.org |
| **superpowers** (CC skills) |   399 |          3 |               64 |         52 |           64 | not shown; "The Basic Workflow" lists the skills in the order they fire | per-harness install steps are long but stay       |

Sources:

- Vale — https://raw.githubusercontent.com/errata-ai/vale/v3/README.md
- textlint — https://raw.githubusercontent.com/textlint/textlint/master/README.md
- markdownlint-cli2 — https://raw.githubusercontent.com/DavidAnson/markdownlint-cli2/main/README.md
- TeXtidote — https://raw.githubusercontent.com/sylvainhalle/textidote/master/Readme.md
- Ruff — https://raw.githubusercontent.com/astral-sh/ruff/main/README.md
- Biome — https://raw.githubusercontent.com/biomejs/biome/main/packages/@biomejs/biome/README.md
  (the root `README.md` is a symlink to this file)
- lychee — https://raw.githubusercontent.com/lycheeverse/lychee/master/README.md
- cspell — https://raw.githubusercontent.com/streetsidesoftware/cspell/main/README.md
- superpowers — https://raw.githubusercontent.com/obra/superpowers/main/README.md

## Section order, weighted to the three closest tools

- **Vale:** tagline · screenshot · one paragraph of what it is · a console block with commands
  _and their output_ · sponsors · Why Vale · Install · Quickstart · Styles · Contributing · License.
- **textlint:** tagline · "similar to ESLint, but for natural language" · Features · Quick Tour
  (a link) · Installation · Usage (install a rule, `--init`, run) · CLI · config file · formats ·
  rules · formatters · library use · FAQ · integrations.
- **markdownlint-cli2:** tagline · Install (five ways, one block each) · Overview · Use (the
  `--help` text, verbatim) · Output formatters · Exit codes · Rule list (a link) · Configuration.

What the three share: **one sentence of what it is, then install within the first screen, then
one run.** Vale is the strongest version — the reader sees a real run with real findings before
reading a single paragraph of explanation. markdownlint-cli2 is the most explicit about exit
codes, which is the thing a CI user actually needs. TeXtidote, the only LaTeX tool here, is the
one that explains each field of a finding line; it also spends 30 lines on the problem before
its first command, which is the part to avoid.

## What we take, what we don't, and why

**We take** Vale's opening: one sentence, then a real run with its real output, captured by
running the CLI rather than written by hand. We take markdownlint-cli2's short, explicit exit-code
list, because `rpp lint` is mostly run in CI and "does this fail the build" is the first question
there. We take Ruff's and Biome's habit of a short commented command list for usage, with every
flag left to `--help`. We take TeXtidote's one-line explanation of what a finding line means,
because our findings name files a new user has not heard of yet. We take superpowers' move for
the agent half: say what the skills do, in the order a user meets them, and keep the plugin
install to two lines. **We do not take** sponsors, testimonials, benchmark charts or badges —
this package has no users to quote and no speed story, and a badge wall would push the first
command down the page. We do not take cspell's "the README is only a link" either: there is no
docs website here, so the README has to carry the path to a first working run by itself. And we
do not keep design reasoning in the README at all; every one of these tools keeps "why it is
built this way" out of the front page, and ours had it in nearly every section.
