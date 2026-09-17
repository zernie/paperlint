# research-paper-pipeline

**Mechanical checks for a paper you keep in git.**

A pipeline for taking a paper from idea to camera-ready **inside the repository**, with the parts
that can be checked mechanically actually checked. Three kinds of thing, and they are meant to be
used together:

- **24 skills** — a skill is one markdown file of instructions your AI agent reads when it
  reaches that stage of the work: find a venue, draft, tighten, adversarial review, submit,
  camera-ready. No code, no magic; the agent follows the file.
- **13 rules** that check what those stages *claim*: the PDF you say you submitted has the bytes
  you declared, the bibliography names the published version's authors, the paper states its
  research question.
- **3 hooks** that stop a bad edit in the agent's loop — overwriting a frozen submission, letting
  the scorecard and the paper drift apart.

One command runs all of it:

```bash
npx research-paper-pipeline check papers
```

Findings come back with file and line, and the exit code is non-zero when something is wrong, so
CI can gate on it. There is no config file to write. (The rules happen to be built on ESLint
underneath — that is an implementation detail, and you never see it.)

**Who this is for:** you keep a paper in git and an AI agent does much of the typing. The design
assumes that agent: every check is built so that **nothing a rule reads is authored by the thing
being checked.** A skill can claim it froze the submission; the rule compares the byte count.
You need Node installed. You do not need to know ESLint.

## The pipeline

```
   idea ──► venue ──► experiment ──► draft ──► review ──► submit ──► camera-ready ──► extend
    │         │           │            │         │          │             │             │
    │         │           │            │         │          │             │             └─ next
    │         │           │            │         │          │             │                paper
    │         │           │            │         │          │             └─ de-anonymise,
    │         │           │            │         │          │                archival DOI
    │         │           │            │         │          └─ freeze the PDF, record its bytes
    │         │           │            │         └─ tighten · grade the writing · red-team ·
    │         │           │            │            simulated programme committee
    │         │           │            └─ render to PDF · verify every citation exists
    │         │           └─ run it, ship a reproduction artifact
    │         └─ rank real CFPs, put the deadlines on a calendar
    └─ go / no-go before you invest

   ┌───────────────────────────────────────────────────────────────────────────────────────┐
   │  scorecard.md — one file per paper. Which stage it is in, which PDF, how many bytes.   │
   │  The stages above WRITE it. The rules READ it and compare against the files on disk.   │
   └───────────────────────────────────────────────────────────────────────────────────────┘
            ▲                                                          ▲
            │  npx research-paper-pipeline check papers                │  hooks, in the agent's
            │  — 13 rules, run by you or by CI                         │    loop, live edits
```

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
npm i -D github:zernie/research-paper-pipeline#1091efd
```

Needs **Node ≥ 22.13** and nothing else — ESLint and the markdown language come with the package,
because the command runs them for you. Once a version is published this becomes
`npm i -D research-paper-pipeline`, and nothing else changes.

### The hooks, if you want them

Three hooks ship with the package: a `PreToolUse` gate that refuses to let a paper source be
written from Bash (which would skip every `PostToolUse` check), and two `PostToolUse` nudges. They
need [`vigiles`](https://github.com/zernie/vigiles) in your project — it is the runtime that
executes them:

```bash
npm i -D vigiles
```

Then install the plugin, which writes the wiring for you:

```
/plugin marketplace add zernie/research-paper-pipeline
/plugin install research-paper-pipeline
```

🔴 **The plugin contains no code — it is wiring, and nothing else.** Its commands point at the npm
copy in your own project through `${CLAUDE_PROJECT_DIR}`. That is deliberate: Claude Code installs a
plugin's dependencies itself, *"only when the plugin's root directory contains both a package.json
and a supported lockfile"*, with a **60-second timeout**, and *"a failed or skipped install never
blocks the plugin"*. A plugin that carried this package's own lockfile — 251 packages, there for the
ESLint rules — could therefore load with a partial tree and hooks that fail silently. `plugin/` has
no `package.json`, so that install does not run at all.

If you would rather not install the plugin, the same three lines go in `.claude/settings.json` by
hand; `plugin/hooks/hooks.json` is exactly what to copy.

⚠️ **Skills do not come through the plugin**, on purpose — they name their scripts by a path that
only exists in an npm install ([#19](https://github.com/zernie/research-paper-pipeline/issues/19)),
so a plugin-only install would give you skills whose first command fails. They arrive with the npm
package, where those paths resolve.

## Use it

```bash
npx research-paper-pipeline check papers
```

That is the whole setup. The command carries its own rule configuration, so there is no config
file to write and nothing about ESLint to learn.

Three things only you can supply — the run marker for your author-list script, your typography
debt, your frontmatter vocabulary — come from an optional JSON file:

```bash
npx research-paper-pipeline check papers --options rpp.json
```

```json
{
  "authorListCommand": "node scripts/bib-authors.mjs",
  "typographyDebt":    { "papers/my-paper": { "sectionSign": 12 } },
  "docFields":         { "read": { "values": ["full", "abstract", "none"] } },
  "reviewSince":       "2026-08-23"
}
```

`--json` prints machine-readable findings instead of the report. Naming a path is required: a
default of `.` would lint whatever happens to be in the checkout and call it green.

<details>
<summary>Already have an <code>eslint.config.mjs</code>? Wire the rules in yourself</summary>

The rules are ordinary ESLint rules, so a repo that already lints can import them directly instead
of using the command. Each module exports its rules; the LaTeX language is a named export.

```js
import markdown from "@eslint/markdown";
import paperStages from "research-paper-pipeline/eslint-rules/paper-stages.mjs";
const { texLanguage } = await import("research-paper-pipeline/eslint-rules/latex-language.mjs");

export default [
  {
    files: ["papers/*/PIPELINE-STATUS.md"],
    plugins: { markdown, paper: paperStages },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "paper/stages": "error", "paper/source": "error" },
  },
  {
    files: ["papers/*/paper.tex"],
    plugins: { tex: { languages: { latex: texLanguage } } },
    language: "tex/latex",
    rules: {},
  },
];
```

`bin/rpp.mjs` builds the full four-block config this way — read it rather than re-deriving it.

</details>

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

<!-- count:rules -->13 today. Severity is yours.

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
| `local/temp-root-realpath` | `temp-root-realpath.mjs` | a temp root taken from `tmpdir()` is not resolved to its realpath where it is created — on macOS `/var` is a symlink, so one directory gets two spellings and every path comparison built on it compares them |

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

Every rule ships with a **harness**: a test that runs the rule twice. Once on a file with a defect
planted in it, where the rule must find it. Once on a clean file, where the rule must say nothing.

The second run is the one people skip, and it is the one that matters. A rule that is broken and
finds nothing passes the first kind of test by accident — from outside, "there is nothing wrong
here" and "this check never ran" look exactly the same.

On top of that, each rule has a **battery**: it deletes one thing the rule depends on and then
demands the harness go red, at the specific assertion that thing belongs to. If nothing goes red,
that part of the rule was never doing any work. CI refuses a rule whose battery cannot kill it.
<!-- count:harnesses -->54 harnesses, <!-- count:batteries -->31 batteries.

It caught a real one on the way in: `js-yaml` 5 stopped parsing an unquoted date as a `Date`.
Every harness stayed green under both majors, and only the battery noticed that the rule's
date coercion had become dead code.

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
hooks/          three hooks for vigiles — the code
plugin/         the Claude Code plugin: wiring for those hooks, no code, no package.json
skills/         24 stage skills
scripts/        this repo's own gates
action.yml      the CI composite action
fixtures/       inputs the harnesses lint
```

## Working on this package

```bash
npm install
npm test                 # every harness
npm run test:sabotage    # break each rule on purpose; a harness nothing can kill is not a harness
npm run check:readme     # the counts above are recounted from the tree, not typed by hand
```

None of these are needed to USE the tool — they are here because the gates are part of the
argument, not decoration.

## Licence

MIT — see [LICENSE](LICENSE).
