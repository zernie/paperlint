# CLAUDE.md — paperlint

Machine-checkable gates for writing a research paper in git, extracted from a private
knowledge base.

This file loads on every turn, so it carries each rule's claim and remedy. The full text, with the
measurements and history behind each rule, is in [`docs/repo-rules.md`](docs/repo-rules.md); what
broke, measured, is in [`docs/incidents.md`](docs/incidents.md).

## 🎯 THE GOAL, in one sentence

**Move every paper-writing convention a machine can decide OUT of prose and INTO an engine
that fails the build** — and keep everything else honestly labelled as prose. The engine is
ESLint. The unit of progress is "one more verdict decided by the engine instead of by a
hand-written script".

That last clause is the whole direction, and it is the part that keeps being forgotten:

```
 prose in a guideline   →   hand-written script   →   ESLint rule in the engine
 rots silently              runs, but is OURS         editor-time · free AST · suppressible
 ← where this started       ← where most of it is     ← where it is going
```

🔴 **A hand-written script is a WAYPOINT, not a destination.** Writing a new one is allowed
only when the engine genuinely cannot express the check — and "cannot" means MEASURED, not
assumed. Two things that sound like limits and are not:

- _"ESLint only sees one file"_ — true of its AST, false of the rule: a rule is an ordinary
  JS module and may call `execFileSync("git", …)` or read a sibling file. If the reason to
  stay a script is "it needs git", that reason is weak; measure the real cost before using it.
- _"this runs programs, not lints files"_ — that is a real limit, and the answer is the seam
  already proven here: **a script PRODUCES facts into a JSON file, and ESLint JUDGES that
  file.** The verdict lands in the engine even though the work did not.

**A real consumer dogfoods this package on every CI run**, so a breaking change here turns a
paper pipeline red somewhere else the same day. Counts of rules, skills and hooks: measure with
`git ls-files`, never cite a snapshot.

## First command in a fresh container

`npm install` — not optional: `vigiles` is a real dependency, and every harness, spec and hook
resolves through it. Without it, failures look like broken code rather than a missing install.

## The rules that decide what may live here — and what may not be written

Numbers are stable; code comments cite them. Full text of each: [`docs/repo-rules.md`](docs/repo-rules.md).

1. **Mechanism goes to vigiles, data stays here.** A file that names nothing local — no rule or
   fixture of ours — is machinery, and belongs in [vigiles](https://github.com/zernie/vigiles).
2. **A check over an AST is a LINT RULE, not a script.** Scripts are for corpus-wide questions
   (index connectivity, ratios across many files), not for one file's nodes.
3. **Every check needs BOTH halves**: it FIRES on a planted defect and stays QUIET on a clean
   fixture; see the test go red before the fix lands ([`docs/testing.md`](docs/testing.md)). Also:
   - **one rule, one requirement** — two checks with different reasons to switch them off are two rules;
   - **a rule that judges a venue requirement is validated on real accepted papers** of that venue,
     built to PDF, with the ground truth established independently of the rule;
   - **a new rule ships with its page**, `docs/rules/<group>/<rule>.md`; `src/rule-docs.test.ts`
     holds this, and its `AWAITING_PAGE` list only shrinks.
4. **`exit 0` with empty output is NOT "clean".** A rule whose input set is empty must be loud
   (the guard below).
5. **"It can't be done in the engine" must be MEASURED, not assumed.** Each of these was stated
   confidently on 2026-09-16 and fell to a single command:

   | the claim                                                   | what one command showed                                                                      |
   | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
   | "a lint rule can't know a git date, so this stays a script" | a rule is plain JS; `execFileSync("git", …)` is legal in it, and its real costs are solvable |
   | "we need our own glob expander"                             | `fs.globSync` ships in Node 22 and returned the identical set                                |
   | "the tool can't run a file that config excludes"            | it can, and says so: `matches exclude … — running because you named it`                      |

   ⇒ Before writing machinery, **run the thing you are about to replace and paste its output.**

6. **A program shipped by this package MUST NOT depend on the consumer's cwd.** Resolve paths from
   `git rev-parse --show-toplevel` or the module's own location. One cwd assumption once made a
   fail-closed gate deny every command in somebody else's session.
7. **Do not describe what you have not opened.** Every factual claim in a document meant for
   strangers is checked against the disk in the same pass that writes it.
8. **🔴 NEVER WRITE A GLOB OR A REGEX INSIDE A BLOCK COMMENT.** An asterisk followed by a slash
   ends the comment wherever it appears. In a block comment, prose describes the pattern and never
   quotes it; exact characters go in code or a line comment.
9. **Measure the DEFECT before proposing the fix — read "this is quick" as a warning.** Show the
   defect (output, or a quoted line), name the layer and channel (more than one is a conversation,
   not a commit), and spend an adversarial pass on forks and on anything that goes outward.
10. **Effects live in adapters, and WHERE paperlint IS INSTALLED lives in ONE of them.** The
    consumer's side: `skills/paper-pipeline/scripts/consumer.mjs`; the package's own data:
    `src/package-dirs.ts`. Checking logic never knows its own location. An install-specific path
    literal elsewhere is flagged by `port/js-install-path` and `port/md-install-path` (`warn`).
    Layer rules for `src/`: [`src/CLAUDE.md`](src/CLAUDE.md), enforced by the linter.
11. **Installing and using paperlint must be as smooth as possible.** The target is `npm i` plus one
    command; any further manual step is a paperlint defect, except a choice that really belongs to
    the user, named when it is asked. An automatic step that can fail silently is worse than an
    explicit one.

<!-- The ports' paths above are resolved by `npm run check` (vigiles lint), since #67. -->
<!-- vigiles:file skills/paper-pipeline/scripts/consumer.mjs -->
<!-- vigiles:file src/package-dirs.ts -->

## Before changing the command surface or a delivery channel — read the prior art

[`docs/prior-art/`](docs/prior-art/README.md) records how comparable tools solved the same problems,
each claim with the URL that was checked. 🔴 "We need another command for X" is, in every tool
examined, the CONFIG not declaring something — check that before adding a verb. Rejected on
2026-09-27: a separate `paperlint refs` command ([`docs/references.md`](docs/references.md)).

## Distribution — one install path: npm, then `paperlint init`

`npm i -D paperlint` brings all the code. `paperlint init` finds the papers directory, links each
skill into `.claude/skills/`, merges the hook commands from `plugin/hooks/hooks.json` into
`.claude/settings.json`, and offers a CI workflow; `paperlint doctor` reads it all back
([`docs/install.md`](docs/install.md)).

**There is no Claude Code plugin; it was removed after 1.0.0 (#82).** Do not bring it back without
answering, measured, the three reasons in [`docs/repo-rules.md`](docs/repo-rules.md#distribution).

## Delivery — how this repo's contents reach a consumer

Each line was measured on a fixture; the measurements are in [`docs/delivery.md`](docs/delivery.md).

- **Skills ship in `skills/`, never `.claude/skills/`**; `paperlint init` symlinks each one into the
  consumer's `.claude/skills/<name>`.
- **Hooks ship as `.hook.mjs`, never `.hook.ts`, with no `.hook.ts` twin.** `hooks/hooks.harness.ts`
  runs `checkHookImports`, a text regex: describe a forbidden import in words, never write one.
- **A shipped hook cannot import a sibling module**, so the papers-root resolver is repeated in each
  hook and the harness compares the copies.
- **`vigiles` is a `dependency`**; its pin here and the consumer's move together, in one pass.
- **`@retorquere/bibtex-parser` is the one `.bib` reader** (`src/ports/bib-reader.ts`).
- **Dependabot runs monthly, with `vigiles` exempt from the cooldown** (`.github/dependabot.yml`).

## The guard against a green zero

`node scripts/rules-see-files.mjs` (part of `npm run check`) asks ESLint for the effective config of
every linted file and fails on a rule enabled for **zero** files — per rule, not per glob. Both
halves are tested in `scripts/rules-see-files.harness.mjs`.

## Cost

⛽ **This repository is PUBLIC; its Actions minutes were verified free on 2026-09-17.** If it is
ever made private again, revisit this section and `.github/dependabot.yml` together. Status that
changes what a session DOES belongs in this file, not in a workflow header
([history](docs/repo-rules.md#cost)).

## Writing checks — what keeps them from pushing papers toward a blog post

A new rule, or a new criterion in a skill that judges prose, is held to five principles
([full text](docs/repo-rules.md#writing-checks)):

1. **Every writing check is two-sided**: a floor as well as a ceiling, or the distance to accepted
   papers of the target venue — a set of ceilings alone converges on a blog post.
2. **Rules count, skills judge.** Countable on the parse tree → a lint rule; needs reading → a skill.
3. **The model reader is the venue's reviewer**, including one who skims the abstract, introduction
   and conclusion.
4. **Thresholds are calibrated, not borrowed**: the same counter, on
   [`fixtures/accepted-papers/`](fixtures/accepted-papers/README.md).
5. **A rewrite is accepted on what reviewers see**: every surface form of a tic, plus a check that
   no claim was softened or strengthened.

## Testing

| you are testing                                                            | kind                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| a pure function                                                            | unit — vitest, `<module>.test.ts` beside it                 |
| a use case or adapter that reaches disk, a process, the network, the clock | integration — vitest, fakes through the ports               |
| a hook's decision, a skill's contract                                      | harness — vigiles, `<surface>.harness.ts`                   |
| the installed package, a real TeX build                                    | e2e — `test/e2e/<area>/*.e2e.ts`, `npm run test:e2e:<area>` |

Red first · assert the whole value · test what the code does, never what its source says · no test
touches the real network · 100% coverage, no `c8 ignore`. **Before every push: `npm run check`,
exit code read without a pipe.** Everything else: [`docs/testing.md`](docs/testing.md).

**A new rule** needs unit tests beside it and a reporting and a silent case in
`src/rule-cases.test.ts`. An e2e fixture only when [`docs/e2e.md`](docs/e2e.md)'s triggers say so.

**New code is functional.** In `src/`, `eslint-rules/` and `lib/` (tests aside): no `let`, no
mutation, no loop, read-only types (`eslint-plugin-functional`); a `switch` over a union names every
member. Collections go through [Remeda](https://remedajs.com/); `lodash`, `lodash-es` and `ramda`
are refused by `npm run lint`. Old code sits in `eslint-suppressions.json`, which may only shrink:
fixing a listed site without `npx eslint . --prune-suppressions` fails lint.

## Commits

Conventional-commit subject, body says what was MEASURED, not what was intended. A number in
a commit message that no command produced is the thing this repo exists to make impossible.

**The subject is also the release.** Every push to `main` runs semantic-release, reading the squash
commit, which is the PR title: `feat:` → minor, `fix:` or `perf:` → patch, `!` or a
`BREAKING CHANGE:` footer → major, `docs:` `chore:` `ci:` `test:` `refactor:` → no release.
`pr-title.yml` rejects a title without a conventional prefix. Never `npm publish` by hand.
