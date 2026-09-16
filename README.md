# research-paper-pipeline

**Your paper is a repository long before it is a PDF — and nothing lints it.**

A pipeline for taking a paper from idea to camera-ready **inside the repository**, with the parts
that can be checked mechanically actually checked. Three kinds of thing, and they are meant to be
used together:

- **24 skills**, one per stage — find a venue, draft, tighten, adversarial review, submit,
  camera-ready. Prose an AI coding agent follows.
- **10 rules** that check what those stages *claim*: the PDF you say you submitted has the bytes
  you declared, the bibliography names the published version's authors, the paper states its
  research question.
- **3 hooks** that stop a bad edit in the agent's loop — overwriting a frozen submission, letting
  the scorecard and the paper drift apart.

The rules run under ESLint, so you invoke them with `npx eslint` and get findings with file
positions and a non-zero exit code. That is all you need from it — the config block below is
copy-paste.

**Who this is for:** you keep a paper in git and an AI agent does much of the typing. The design
assumes that agent: every check is built so that **nothing a rule reads is authored by the thing
being checked.** A skill can claim it froze the submission; the rule compares the byte count.
You need Node installed. You do not need to know ESLint.

## What it checks, and what it reads

Most rules read a **scorecard** — one markdown file per paper, whose frontmatter is the paper's
machine-readable claim about itself. This is the input the rules exist for, so here it is in full:

```markdown
---
stages:
  - stage: submitted
    date: 2026-07-22
    venue: AgenticDev 2026 @ ASE
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 352357                              # checked against the file, both directions
  - stage: camera-ready
    date: 2026-08-29
    venue: AgenticDev 2026 @ ASE
    pdf: versions/2026-08-29-camera-ready.pdf
    bytes: 616175
    source: versions/2026-08-29-camera-ready.tex   # frozen .tex, checked by size
---

# PIPELINE-STATUS

| id | what | ok | when | notes |
|---|---|---|---|---|
| cites | any \cite added or moved | ☑ | 2026-08-24 | `bib-authors` run: 27 entries, 1 mismatch, fixed |
```

**Who writes it:** your agent does, as it works — that is the point. A human maintaining
`bytes: 352357` by hand would stop within a week. The rules exist because an agent's *claim* that
it froze a submission and the *bytes on disk* are different things.

Now a paper that says it was submitted, with a stale PDF and no stated research question:

```
papers/my-paper/PIPELINE-STATUS.md
  1:1  error    «submitted» (2026-07-22): 412553 bytes declared, 100 on disk — this is NOT that file
  1:1  error    stage «submitted» (2026-07-22) carries no frozen source. A commit reference will not
                do: squash and gc destroy it — three of four sources were lost that way in this corpus
  1:1  warning  stage «submitted» is declared, but the scorecard records no author-list run (looked
                for «bib-authors» in its table). It catches what an existence check cannot see: the
                citation resolves, the id resolves, and the authors are the PREPRINT's while the
                entry declares a conference. Run: node scripts/bib-authors.mjs papers/my-paper

papers/my-paper/paper.tex
  1:1  warning  the paper shipped (stage «submitted») but never states a research question. This is
                reviewer A's verbatim point on agenticdev (#20). Advisory: a position paper may
                legitimately have none — but then that is a DECISION, not an omission

✖ 4 problems (2 errors, 2 warnings)
```

Real output, wrapped to fit. Findings sit at `1:1` because their subject is the *file's claim*, not
a span of text in it.

Two are errors because the answer is binary — the bytes match or they do not. Two are warnings
because the answer is a judgement, and **a gate that fails on a judgement gets muted.**

## Install

Not published to npm yet, so install from the repository. Pin a **commit on `main`**: a squash
merge orphans branch commits and `gc` collects them — measured here, of four recorded shas one
still resolved ninety minutes later.

```bash
npm i -D github:zernie/research-paper-pipeline#8a06e4c \
         eslint@^10.9.1 @eslint/markdown@^8.0.3
```

Needs **Node ≥ 22.13** and ESLint 10 flat config. Once a version is published this becomes
`npm i -D research-paper-pipeline`, and nothing else changes.

## Wire it up

Nothing is auto-discovered: you say where your papers live and which rules you want. Rules come
from four modules; each block below is one of them.

```js
// eslint.config.mjs
import markdown from "@eslint/markdown";
import paperStages from "research-paper-pipeline/eslint-rules/paper-stages.mjs";
import researchQuestion from "research-paper-pipeline/eslint-rules/paper-research-question.mjs";
import typography from "research-paper-pipeline/eslint-rules/paper-typography.mjs";
import texBuild from "research-paper-pipeline/eslint-rules/tex-build.mjs";
import docFields from "research-paper-pipeline/eslint-rules/doc-fields.mjs";
import findingsCause from "research-paper-pipeline/eslint-rules/review-findings-cause.mjs";
import coldReadCause from "research-paper-pipeline/eslint-rules/cold-read-cause.mjs";
// `texLanguage` is a NAMED export, and the module is loaded dynamically because it pulls a
// LaTeX parser you do not want to pay for when you lint only markdown.
const { texLanguage } = await import("research-paper-pipeline/eslint-rules/latex-language.mjs");

export default [
  // 1. The scorecard — what the paper claims about itself.
  {
    files: ["papers/*/PIPELINE-STATUS.md"],
    plugins: { markdown, paper: paperStages },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: {
      "paper/stages": "error",
      "paper/source": "error",
      // `command` is pure text, pasted into the finding so the reader knows what to run.
      // The package never hardcodes your paths.
      "paper/author-list": ["warn", { command: "node scripts/bib-authors.mjs papers/my-paper" }],
    },
  },

  // 2. The paper itself, as LaTeX. `tex/latex` is a real ESLint language: .tex is PARSED.
  {
    files: ["papers/*/paper.tex"],
    plugins: {
      tex: { languages: { latex: texLanguage }, rules: texBuild },
      paper: { rules: { ...researchQuestion.rules, ...typography.rules } },
    },
    language: "tex/latex",
    rules: {
      "paper/research-question": "warn",
      "paper/typography": ["warn", { debt: {} }],   // see "declared debt" below
      "tex/future-promise": "warn",
      "tex/acm-frontmatter-override": "error",
    },
  },

  // 3. A paper written in markdown instead — same two rules, different language.
  {
    files: ["papers/*/paper.md", "papers/*/draft.md"],
    plugins: { markdown, paper: { rules: { ...researchQuestion.rules, ...typography.rules } } },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "paper/research-question": "warn", "paper/typography": ["warn", { debt: {} }] },
  },

  // 4. Review notes — optional, and only useful if you keep them in the repo.
  {
    files: ["papers/*/reviews/*.md"],
    plugins: { markdown, review: { rules: { ...findingsCause.rules, ...coldReadCause.rules } }, doc: docFields },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: {
      // `sinceCreated` exempts notes written before you adopted the rule — retrofitting a
      // backlog prints twenty findings in one run, which is how a check gets switched off.
      "review/findings-cause": ["error", { minFindings: 3, sinceCreated: "2026-08-23" }],
      "review/cold-read-cause": "warn",
      // `fields` is a map: field name -> the values it may take, plus a hint shown in the
      // finding. Declaring the vocabulary is the point; a free-text field cannot be checked.
      "doc/fields": [
        "warn",
        { fields: { read: { values: ["full", "abstract", "none"], hint: "how much of it you read" } } },
      ],
    },
  },
];
```

```bash
npx eslint papers
```

**`paper/typography` and declared debt.** It counts conventions a reviewer already raised against
a per-paper budget you declare, so it is silent on existing text and speaks only when the count
grows. Start with `{ debt: {} }` to see every count, then freeze the numbers you are not fixing
today.

## In CI

A complete job. The composite action runs ESLint once and — this is the part a hand-written
`run:` block always misses — **refuses to pass on an empty run**: ESLint exits 0 when it finds
nothing, and "no findings" is byte-identical to "not one rule was handed a single file".

```yaml
name: paper gates
on: [push, pull_request]

jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npm ci
      - uses: zernie/research-paper-pipeline@8a06e4c   # no version tags yet — pin a sha
        with:
          paths: papers            # REQUIRED, no default
          config: eslint.config.mjs
          texcount: "false"        # true only if YOUR config has rules that shell out to texcount
```

`paths` is required on purpose: it used to default to `.`, so a caller who never thought about
scope still got a green job over whatever was in the checkout. A first step fails when it is
empty, because GitHub does **not** enforce `required:` for composite actions.

## The rules

<!-- count:rules -->10 today. Severity is yours.

| rule | from | fires when |
|---|---|---|
| `paper/stages` | `paper-stages.mjs` | a declared stage's PDF is missing, or its byte count does not match the file |
| `paper/source` | `paper-stages.mjs` | a declared stage has no frozen source beside its PDF, or the source's bytes differ |
| `paper/author-list` | `paper-stages.mjs` | a shipped paper records no author-list check — the class where a citation resolves but carries the *preprint's* authors |
| `paper/research-question` | `paper-research-question.mjs` | a shipped paper never states its research question |
| `paper/typography` | `paper-typography.mjs` | conventions a reviewer already raised exceed the declared debt |
| `tex/future-promise` | `tex-build.mjs` | the text promises a future release of something already handed over |
| `tex/acm-frontmatter-override` | `tex-build.mjs` | an `acmart` build overrides ACM's front-matter commands, removing template elements from page 1 |
| `doc/fields` | `doc-fields.mjs` | frontmatter is missing a declared field, or carries a value outside the declared set |
| `review/findings-cause` | `review-findings-cause.mjs` | a review report with findings does not say what let them through |
| `review/cold-read-cause` | `cold-read-cause.mjs` | an open re-read finding does not name its cause |

## Words this page uses

- **stage** — a point a paper reached and cannot un-reach: `submitted`, `camera-ready`, `arxiv`.
- **scorecard** — `PIPELINE-STATUS.md`, the file above. One per paper.
- **frozen** — a copy of the exact PDF or `.tex` that was sent, kept in `versions/`. Bytes, not a
  commit reference: squash and `gc` destroy commit references, and did.
- **harness** — the test beside a rule. **battery** — a set of edits that try to break a harness.

## Also in the box

**The <!-- count:skills -->24 skills** are markdown, one directory each, and they name the scripts
they run. Point your agent at `skills/` and ask it for a stage by name. The stages that need taste
stay taste and say so — `paper-adversarial-review` does not pretend to be a checker.

**The 3 hooks** need [vigiles](https://github.com/zernie/vigiles), a runner that executes checks
inside an agent's edit loop. Without it you lose the in-loop guard; the rules and skills are
unaffected.

## How this is tested

Every rule has a harness proving **both halves** — it fires on a planted defect *and* stays silent
on clean input — and a battery that removes one load-bearing property and demands the harness go
red at the assertion that property belongs to.

```bash
npm test                 # <!-- count:harnesses -->50 harnesses
npm run test:sabotage    # <!-- count:batteries -->27 batteries (mutation testing)
```

CI refuses a harness that no battery can kill, because silence is the success state of every check
here: "it passed" and "it cannot fail" look identical from outside. Counts above are produced by
`npm run check:readme`, not typed by hand.

## Why not one of the existing academic skill suites

The nearest neighbour, [`Imbad0202/academic-research-skills`](https://github.com/Imbad0202/academic-research-skills),
is a serious project with its own linters, a CI threshold gate and a write guard. "Just prompts"
is wrong about it.

The difference is **what a check is allowed to read.** Its integrity gate thresholds a numeric
score that the audited model writes about itself. Here, nothing a rule reads is authored by the
thing being checked: `paper/stages` compares a declared byte count against `statSync`, and
`paper/source` does the same for the frozen `.tex`. It also reads the paper's LaTeX source, which
that suite does not — it checks process artefacts.

Licensing differs too: that suite is CC BY-NC 4.0, this is MIT.

## Layout

```
eslint-rules/   the rules, each with its .harness.mjs and .mutations.mjs beside it
lib/            shared readers — markdown, skill corpus, the mutation driver
hooks/          three hooks for vigiles
skills/         24 stage skills
scripts/        this repo's own gates
action.yml      the CI composite action
fixtures/       inputs the harnesses lint
```

## Licence

MIT — see [LICENSE](LICENSE).
