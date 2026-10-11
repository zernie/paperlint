# The rules of this repository — full text

Moved verbatim from `CLAUDE.md` on 2026-10-11 (paperlint#202). `CLAUDE.md` loads on every turn,
so it keeps one statement and the remedy for each rule; this file keeps the full text, the
measurements and the history behind it. Rule numbers are stable: code comments and other docs cite
them. A dated measurement is a record of that day, not a fact about today.

> ⚠️ **Outdated on 2026-10-11, kept as the record:** rule 10's "Still owed: the install-path half"
> is no longer true. `eslint-rules/install-path-literals.ts` ships it as `port/js-install-path` and
> `port/md-install-path`, both at `warn` in `eslint.config.mjs`.

## State snapshot, 2026-09-16

|                         |                                                                                            |
| ----------------------- | -----------------------------------------------------------------------------------------: |
| ESLint rules            | **5** — `latex-language` · `tex-build` · `papers` · `review-findings-cause` · `doc-fields` |
| harnesses               |                                                                                     **57** |
| skills                  |                                                                                     **24** |
| hooks (runnable `.mjs`) |                                                                                      **5** |
| repo-wide scripts       |                                                                                          5 |
| files tracked / commits |                                                                                   308 / 43 |

**A real consumer dogfoods this package on every CI run**, so a breaking change here turns a
paper pipeline red somewhere else the same day. That is deliberate — it is the only thing
keeping the extraction honest.

⚠️ **This table is a SNAPSHOT, not a fact about today, and it has already gone stale once.**
The line standing here until 2026-09-16 said "two ESLint rule modules" while six were shipped,
24 skills had moved in, and hooks existed at all. Re-measure with `git ls-files` before
repeating any number from it.

## Rule 1

**1. Mechanism goes to vigiles, data stays here.** A file that names nothing local — no rule
of ours, no fixture of ours — is machinery, and machinery belongs in
[vigiles](https://github.com/zernie/vigiles). Ask it in two steps: is this mechanism or data?
If mechanism — does it know about _this_ domain? If not, it is not ours.

## Rule 2

**2. A check over an AST is a LINT RULE, not a script.** If it walks `.ts`/`.js`/`.tex` and
looks at declarations, names or nodes, write an ESLint rule: it fires in the editor on save,
gets the AST for free, and has a suppression syntax people already know. Scripts are for
corpus-wide questions — index connectivity, ratios across many files — not for one file's
nodes.

## Rule 3

**3. Every check needs BOTH halves, or it is not tested.** It must FIRE on a planted defect
and stay QUIET on a clean fixture. A check that has only been seen quiet is
indistinguishable from a dead one — silence is its success state. Prove the fire half by
seeing the test go RED before the fix lands ([`docs/testing.md`](docs/testing.md)).

**One rule, one requirement.** A rule checks one thing a user would want to switch off, or set a
severity for, on its own; two checks with different reasons to disable them are two rules. Several
messageIds for facets of one requirement are fine. Example: `pdf/limits` checked body pages,
reference pages and the reference font size — the first two are one page budget and became
`format/page-limit`; the font size is a different requirement and moved to `pdf/body-size`.

**A rule that judges a venue requirement is validated on real accepted papers of that venue** (or
of its parent venue, with the same template), built to PDF, with the ground truth established
independently of the rule — rendered and looked at — plus variant fixtures derived from those real
sources, one change each. Synthetic minimal fixtures alone are not enough: they are written by the
same hand as the rule, and share its blind spots. Example: `format/page-limit`'s body count, on the
built ACSAC papers in `fixtures/accepted-papers/` (`test/e2e/tex/page-count.e2e.ts`).

**A new rule ships with its page**, `docs/rules/<group>/<rule>.md`, in these sections: What it
catches · Why · Examples (failing / passing) · Options / preset fields · What it does not check ·
How to fix. Its `meta.docs.url` points at that page, and its row in `docs/rules.md` is one line
linking there. `src/rule-docs.test.ts` holds every rule the config registers to this; the rules
older than the convention wait in its `AWAITING_PAGE` list, which only shrinks — #131 writes their
pages.

## Rule 4

**4. `exit 0` with empty output is NOT "clean".** A rule whose glob matched no files reports
exactly like a rule that passed. Any rule shipped here must be loud when its input set is
empty. This is the specific defect that blocks stage 1 of the plan: in the source base a
fresh clone yields RC=0, 652 findings, zero errors — because 19 rules saw no files at all.

## Rule 5

**5. "It can't be done in the engine" must be MEASURED, not assumed.** Every one of these was
stated confidently on 2026-09-16 and every one fell to a single command:

| the claim                                                   | what one command showed                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "a lint rule can't know a git date, so this stays a script" | a rule is plain JS; `execFileSync("git", …)` is legal in it. The real costs (per-file invocation, `--cache` keyed on content) are solvable, so this was a preference dressed as a limit |
| "we need our own glob expander"                             | `fs.globSync` ships in Node 22 and returned the identical set. 31 hand-written lines of regex existed for nothing                                                                       |
| "the tool can't run a file that config excludes"            | it can, and says so: `matches exclude … — running because you named it`                                                                                                                 |

⇒ Before writing machinery, **run the thing you are about to replace and paste its output.**
"I couldn't get it to work" is data about the attempt, not about the tool.

## Rule 6

**6. A program shipped by this package MUST NOT depend on the consumer's cwd.** Measured
2026-09-16: three hooks here read their config as `provide("pkg", "cat package.json")`. The
consumer's session changed directory into a subfolder for unrelated reasons, `cat` failed, and
the Bash gate — which fails closed, correctly — denied **every command in that session**,
including the one that would undo it. The nudges next to it would have failed _silently_,
which is worse.

Resolve paths from the repository root (`git rev-parse --show-toplevel`) or from the module's
own location, never from where the caller happens to stand. The blast radius of a cwd
assumption is not this package — it is somebody else's whole session.

## Rule 7

**7. Do not describe what you have not opened.** A `README` here nearly shipped the line
"MIT — see LICENSE" on 2026-09-16. There is no `LICENSE` file and `package.json` says
`UNLICENSED`. Publishing is irreversible and this repo is public: every factual claim in a
document meant for strangers gets checked against the disk in the same pass that writes it.

## Rule 8

**8. 🔴 NEVER WRITE A GLOB OR A REGEX INSIDE A BLOCK COMMENT.** An asterisk followed by a
slash **ends the comment**, wherever it appears — in a path (a folder wildcard), in a regex
whose last literal is an asterisk (one matching bold markup, for instance), in a quoted
example. The rest of the comment becomes code, the file stops parsing, and the error points
at a line further down that is perfectly fine.

⚠️ Note this rule does not quote the sequence either, not even here. A documented example is
the thing that gets copied into code — and that is exactly how the fourth occurrence
happened: it was copied out of a comment written to explain the first three.

This is not a hypothetical and not a rare slip. **It fired four times in a single session on
2026-09-16** — three in the consumer, once here — and each time the diagnosis cost minutes
because `SyntaxError: Unexpected token '.'` says nothing about comments.

| instead of                              | write                                                 |
| --------------------------------------- | ----------------------------------------------------- |
| a glob with an asterisk and slash       | spell it: "every folder under papers"                 |
| a regex with an asterisk before a slash | describe what it matched, in words                    |
| an example needing both                 | put it in a line comment (two slashes), never a block |

⇒ **In a block comment, prose describes the pattern; it never quotes it.** If the exact
characters matter, they belong in the code or in a line comment beside it.

## Rule 9

**9. Measure the DEFECT before proposing the fix — and read "this is quick" as a warning.**
Rule 5 is about the tool you are replacing; this one is about the order of work.

1. **Show the defect**: command output, or a file quote with a line number. A proposed fix with
   no exhibited defect is not a fix, it is a preference.
2. **Name the layer and the channel** it touches: ESLint rule · skill · hook · CLI · CI action
   · path resolution. More than one is a conversation, not a commit.
3. **An adversarial second pass is encouraged, and it is not free.** Spend it on a fork in the
   road, on anything that goes outward, and on a conclusion you are about to act on.
4. **A quick fix is almost never quick** — it is quick to _propose_ precisely because nothing
   was opened.

Four proposals were made and withdrawn in one session on 2026-09-17 for exactly this reason —
[`docs/incidents.md`](docs/incidents.md).

## Rule 10

**10. Effects live in adapters, and WHERE paperlint IS INSTALLED lives in ONE of them.** Rule 6 generalised: the caller's cwd is one case of it. Checking logic — lint rules,
skills, hooks — must not know its own location, nor its distance from anything else. Every
answer to _where_ comes from one of two modules, each for one side: the consumer (its root, the
package's name) from `skills/paper-pipeline/scripts/consumer.mjs`, which adapts per channel — own
checkout · `node_modules` · plugin cache · CI; the package's own data (`presets/`, `presets/tex/`)
from `src/package-dirs.ts`. A skill naming a script by an install-specific path in its own prose
walks around that door, and 208 such literals across 190 lines do exactly that.

<!-- The ports' paths above are resolved by `npm run check` (vigiles lint), since #67. -->
<!-- vigiles:file skills/paper-pipeline/scripts/consumer.mjs -->
<!-- vigiles:file src/package-dirs.ts -->

The layer rules for `src/` live in [`src/CLAUDE.md`](src/CLAUDE.md) and are enforced by the linter.

⏳ **Still owed: the install-path half** — a lint rule that makes an install-specific path literal
outside `consumer.mjs` a finding. Prose will not hold this class — four silent breakages happened
_while_ comments explaining the hazard sat directly above the code
([`docs/incidents.md`](docs/incidents.md)).

## Rule 11

**11. Installing and using paperlint must be as smooth as possible.** Count the actions between "I
want this" and "it works": every command to copy, flag to pass or file to edit is one more place
to give up. The target is `npm i` plus one command. A per-paper script, a manual TeX install or a
"now add this to your config" step is a defect in paperlint, not a user task. The only exception is a
choice that really belongs to the user (irreversible, paid, privacy), and then it is named at the
moment it is asked. The converse holds too: an automatic step that can fail silently is worse
than an explicit one — it works, or it says loudly that it did not. Measured example of the
converse: Tectonic installs as one file but silently replaced Times with Latin Modern on a plain
`article` paper and still exited 0 (#35, #59).

## Prior art

[`docs/prior-art/`](docs/prior-art/README.md) records how comparable tools solved the same
problems, each claim with the URL that was checked: Quarto and Vale (the domain and content
analogues), Biome (one tool, one config, one command), Danger and reviewdog (who decides to
fail a run), `unicorn/expiring-todo-comments` and Semgrep (checks that read a clock or a diff).

It is here as a POINTER and stays a pointer: this file is read on every turn, so it carries
the instruction and never the evidence — the same split as rules 9 and 10 and `docs/incidents.md`.

🔴 The argument "we need another command for X" is, in every tool examined, an argument that
the CONFIG is not declaring something. Check that before adding a verb.

Rejected on 2026-09-27, so it is not proposed again: a separate `paperlint refs` command for the
reference check. The slowness it would have moved (#107) was a cache thrown away after every build,
not a missing verb. The fix keeps the check in `build` and commits what the services answered in
`<paper>/repro/references-cache.json` — **raw responses, never verdicts**: verdicts are derived
again on every build, so a checker fix reaches every paper ([`docs/references.md`](docs/references.md)).

## Distribution

`npm i -D paperlint` brings all the code — rules, skills, hooks, scripts. `paperlint init`
then does what only a command can, because it depends on the project it lands in: it finds the
papers directory and declares it in a root `paperlint.json` when it is not the default `papers`, links each skill into `.claude/skills/`, writes
the hook commands into `.claude/settings.json` (vigiles' `mergeRegistrations`, reading
`plugin/hooks/hooks.json` as the one source), and offers a CI workflow that runs the action from
`node_modules` after `npm ci`. `paperlint doctor` reads all of it back. Details: `docs/install.md`.

**There is no Claude Code plugin or marketplace entry; it was removed in the release after 1.0.0
(#82).** Do not bring it back without answering these, each measured:

- **A plugin cannot carry the code.** Claude Code runs `npm ci --ignore-scripts` for a plugin only
  when its root holds a `package.json` and a lockfile, with a 60-second timeout, and _"a failed or
  skipped install never blocks the plugin"_: on a slow network the hooks load and fail with
  `cannot find module vigiles`, silently.
- **The skills need the npm package anyway.** 23 of 24 skills run scripts under
  `paper-pipeline/scripts`, which resolve only through `node_modules/paperlint/`.
  A plugin-only consumer got skills whose first command fails.
- **Its manifests carried versions nothing updated** (0.0.1 and 0.1.0 while npm was at 1.0.0), and
  Claude Code decides plugin updates from that number.

`plugin/hooks/hooks.json` stays where it is: it is not a plugin any more, it is the hook wiring
`paperlint init` merges into the consumer's settings.

## The guard against a green zero

Rule 4 is enforced, not asserted: `scripts/rules-see-files.mjs` loads `eslint.config.mjs`,
lints the repository, and asks ESLint for the effective config of every linted file. A rule
enabled for **zero** files is named and the script exits 1.

```bash
node scripts/rules-see-files.mjs   # also part of npm run check
```

It is per RULE, not per glob, and that distinction is the point: a rule can be enabled in one
block whose glob is empty while a different block is busy, so "some glob matched something" is
not evidence about the rule you care about. Both halves are tested
(`scripts/rules-see-files.harness.mjs`), under-reporting and over-reporting each by an
assertion of its own.

## Cost

⛽ **This repository is PUBLIC, so its Actions minutes are FREE.** Verified against the API on
2026-09-17: `"private": false`, `"visibility": "public"`, and three active workflows — `ci`,
`dependabot auto-merge`, and Dependabot's own updates runner.

🔴 **This paragraph said the exact opposite until now, and the correction is the lesson, not the
fact.** It read «This is a **private** repository … Until then there is no CI here, and that is
deliberate» — both halves false, and false in the file an agent loads FIRST. The flip to public
happened on 2026-09-12 and _was_ recorded, at `.github/workflows/ci.yml:8-9`, which is a file
nobody opens before deciding whether there is any CI to check. Reported as issue #6.

⚠️ So the rule this leaves behind is about WHERE a correction lands: a measurement written into
the artifact it describes is not written down for the reader who needs it. **Status that changes
what a session DOES belongs in this file**; the workflow header can carry the detail.

What stays true, because the reasoning outlives the flip: minutes on a **private** repo come out
of the account-wide 3000/month shared with every other private repo, and the budget is decided
**before** the first workflow file, not after the first bill. **If this repository is ever made
private again, this section and `.github/dependabot.yml` are revisited together** — the bot is
justified two hundred lines above precisely by these minutes being free.

## Writing checks

The rules and skills that judge a paper's prose follow five principles. A new rule, or a new
criterion in a skill, is held to them.

1. **Every writing check is two-sided.** A check with only a ceiling — too long, too many markers,
   too many of X — pushes every paper toward clipped, unsignposted prose, and the one equilibrium of
   a set of ceilings is a blog post. A new check has a floor as well, or measures the distance to a
   reference (accepted papers of the target venue); never only "less is better".
2. **Rules count, skills judge.** What is countable on the parse tree — a density, a number with no
   owner (`tex/claim-provenance`), a missing section — is a lint rule. What needs reading — register
   relative to a venue, genre, whether a claim changed strength — is a skill criterion. A skill does
   not grep prose for what a rule can count; a rule is not asked to judge register.
3. **The model reader is the venue's reviewer, not only a smart outsider.** A check that simulates a
   reader includes a skimming reviewer who reads the abstract, the introduction and the conclusion,
   and judges whether it reads as a paper at that venue and whose result each sentence states.
4. **Thresholds are calibrated, not borrowed.** A threshold is set with the same counter on real
   accepted papers, never taken from a published figure measured by a different counter. Those
   papers are [`fixtures/accepted-papers/`](fixtures/accepted-papers/README.md), and every rule's
   count on them is recorded there.
5. **A rewrite is accepted on what reviewers see.** That is the combined count of every surface form
   of a tic (a narrow rule is gamed by rewording), plus a claims-preservation check that no claim was
   softened or strengthened — not the one pattern the triggering rule matched.
