# research-paper-pipeline

Machine-checkable gates for writing a research paper **in git**: ESLint rules that read the
paper's own source, skills that drive each stage, hooks that stop a bad edit before it lands,
and a harness beside every one of them proving it both fires on a planted defect and stays
quiet on clean input.

## Why it exists

A paper is a repository long before it is a PDF, and almost nothing checks it as one. Writing
conventions — every claim carries a number, a "read it" checkbox says what was actually read,
a finished stage has the file it claims — live in guidelines and are enforced by nobody, so
they rot silently. That is the same failure class as an un-linted codebase, with a submission
deadline attached.

The wager is narrow and testable: **anything a reviewer could check mechanically should fail
the build, not the review.** Everything that needs taste stays prose and says so out loud.

## What is actually in here

Four kinds of thing, and the numbers only matter once you know what each kind *is*.

**Rules that read your paper and fail the build.** They run under ESLint, over `.tex` and `.md`,
and they check the things a reviewer would check by hand — a stage that claims a PDF has the
bytes to back it, a bibliography entry a reader can actually reach, `§` where the venue wants
"Section". <!-- count:rules -->10 of them today.

**A test beside every rule, and it has to prove BOTH halves** — that the rule fires on a
defect planted on purpose, *and* that it stays silent on clean input. Half a test is how a
rule that checks nothing passes for a rule that found nothing. <!-- count:harnesses -->49 of those.

**A battery that tries to break each test.** It edits the rule to remove one load-bearing
property and requires the test to go red at the assertion that property belongs to. A green
test proves nothing on its own: silence is the success state of every check here, so "it
passed" and "it cannot fail" look identical from outside. <!-- count:batteries -->26 batteries, and CI
refuses a test that no battery can kill.

**Skills that drive the writing**, one per stage — pick a venue, draft, tighten, review,
submit, camera-ready. <!-- count:skills -->24. These are prose for a model to follow, not code: the
stages that need taste stay taste, and say so.

Every number above is produced by `npm run check:readme`, not typed by hand — it recounts the
tree and fails when the prose drifts. It already had: the four counts here said 45 harnesses and
22 batteries while the tree held 49 and 26.

```bash
npm test                  # every test on disk
npm run test:mutations    # try to break each test; a test nothing can kill is not a test
```

## What may live here, and what may not

| | |
|---|---|
| **in scope** | ESLint rules over `.tex`/`.md` paper sources · their harnesses and mutation batteries · paper-stage skills · hooks and CI that enforce them |
| **out of scope** | anything that knows about one specific author, venue, employer or application — that stays in its owner's private notes |
| **not here either** | agent-harness machinery (skill corpus, trigger ledger, model containment). Its home is [vigiles](https://github.com/zernie/vigiles) |

The test is mechanical rather than tasteful: **would this file work, unedited, for someone
else's paper?** If it names a person, a venue or a deadline — no, and it belongs in private
notes. If it would need one line changed — yes, and that line becomes an option.

## Why it is not "yet another academic skills suite"

Both neighbours were **cloned and read**, 2026-09-10, rather than judged by their descriptions.
The first finding was that a previous version of this section was wrong: they are not thin, and
they do have enforcement.

[`Imbad0202/academic-research-skills`](https://github.com/Imbad0202/academic-research-skills)
— 47 259 stars, 2 590 files, 430 of them Python. It ships a markdown linter (224 lines), a
skill-frontmatter linter (267), a CI threshold gate, a 241-line PreToolUse write guard, and a
gold-set calibration with declared acceptance thresholds (FNR < 0.15, FPR < 0.10). Anyone who
tells you it is "just prompts" has not opened it.

[`tlorans/research-paper-pipeline`](https://github.com/tlorans/research-paper-pipeline)
— a control plane over the above.

### The difference is WHAT a gate is allowed to read

Here is that project's stage gate, verbatim from its `pipeline.yaml`:

```yaml
  - id: integrity
    gate:
      field: score
      op: gte
      threshold: 8
```

🔴 **`score` is written by the model being audited.** Its own `agents/auditor.md` asks the model
to score itself, and the gate then compares that number to 8. A model that would rather pass
than fail has one obvious move, and no part of the pipeline can tell a paper that improved from
a model that got more generous. The threshold is real; the measurement it reads is not.

Every gate in this repo takes its input from something the model does not author: bytes on disk,
an AST node, the exit code of `pdflatex`. Where that is impossible — is the argument any good,
does the prose land — this repo does not pretend, and says so in the skill.

### And nothing in either reads the paper's source

Searching both trees for `eslint` and `aclpubcheck` returns **zero**. Neither ships a rule that
opens a `.tex` file. That is the gap: a paper is a repository long before it is a PDF, and the
repository was going unchecked.

### Venue facts are data here, not memory

`skills/submit-paper/references/venues/` carries a card per venue — page limit, blind policy,
what the CFP actually says, the anonymisation rules, plus a machine-readable `.jsonc` and a
`.tex` template. Three venues today (AgenticDev @ ASE, AISec @ CCS, REALM @ EMNLP). Each card
carries its own "re-verify the CFP each year" line with the URL, because venue facts rot yearly
and a fact nobody re-checks is worse than no fact.

### And it can actually be used

The neighbour above is **CC BY-NC 4.0** — not an open-source licence, commercial use restricted
by design. This repo is MIT; see [Licence](#licence) for why that section also records the two
months it got this wrong.

## Setup

```bash
npm install          # first command in any fresh clone, before touching a spec or a hook
```

## Layout

```
eslint-rules/     one rule per file, its harness and mutation battery beside it
fixtures/         .tex and .md fixtures — a clean one and a defective one per rule
skills/           paper-stage skills; a consumer symlinks these into .claude/skills/
hooks/            runnable .mjs programs, not .hook.ts sources — see CLAUDE.md
scripts/          repo-wide runners (mutations, glob coverage, skill lint)
.github/          CI — one job, and the minute budget is decided before adding a second
```

## Licence

**MIT** — see [LICENSE](LICENSE). Chosen deliberately, and it is the one thing this repo
refuses to copy from its nearest neighbour: a suite that restricts commercial use by licence
cannot be adopted by the people whose papers it would check.

Until 2026-09-16 this repo was public and declared `UNLICENSED` with no `LICENSE` file, which
means the default applied — all rights reserved, nobody could use it — while the section above
criticised a neighbour for exactly that class of restriction.
