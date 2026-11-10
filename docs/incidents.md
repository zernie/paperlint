# Incidents — the measurements the rules stand on

`CLAUDE.md` is loaded on every turn, so it carries **the claim and the remedy** and nothing
else. The measurement that produced a rule lives here, and is read only when someone argues
with the rule or wants to know how it was found.

Two things never move into this file: a measurement that **is** the rule (the root `CLAUDE.md`'s table of
claims that fell to one command — without it the rule reads "measure things", which nobody
obeys), and evidence that already lives in a code comment beside the code it explains. Those
get a pointer, never a copy.

Entries are append-only and dated. A superseded entry is marked, not deleted.

---

## 2026-09-17 — four fixes proposed and withdrawn in one session (measure the defect first)

Each was proposed before the defect it claimed to fix had been exhibited, and each fell to a
single command:

| proposed                                       | what one command showed instead                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| a new `skip` API in the test runner            | the existing classification had never been shown to be wrong                                                                |
| a `link` subcommand as the single install path | this package is consumed three ways, and a plugin cannot serve two of them                                                  |
| "one delivery channel instead of two"          | the channels carry different things: eight ESLint imports and a composite action on one side, skills and hooks on the other |
| "symlinked skills are our own invention"       | the documentation describes them, and third-party repositories install exactly that way                                     |

Two of the four were demolished by an adversarial second pass **before** either was built. A
third pass over six claims about the plugin channel corrected four of them — including a count
attributed to the wrong file (110 was one script's occurrences; the prefix has 208 across 190
lines) and a "nothing is installed" claim that was false in the consumer, where 54 symlinks
make the path resolve.

Cost of the pattern: the four proposals took more of the session than the work they proposed.

## 2026-09-17 — the install-location class, four silent breakages (where paperlint is installed)

One class — _code that knows where it is on disk_ — has broken this repository four times, and
not one of the four announced itself:

| when             | what was assumed                                                                                                        | how it failed                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| until 2026-08-15 | `resolve(HERE, "..", "skills")`, correct while the code lived beside the skills                                         | a hash over a missing directory is stable, so every verdict read FRESH forever, with no error                                |
| 2026-09-12       | the same walk, after the move into a package                                                                            | broke the same way, in the same silent direction                                                                             |
| 2026-09-12       | the ledger defaults to a file beside its own module                                                                     | inside `node_modules`, which `npm ci` deletes: appending SUCCEEDS, so rows look recorded until the next install removes them |
| 2026-09-17       | skills name their scripts by an install-specific path — 208 literals across 190 lines, in bodies and in `allowed-tools` | resolves through a symlink for one consumer and does not exist for another                                                   |

The first three are documented in the code they broke, and that is where the detail stays:
`skills/paper-pipeline/scripts/ledger.mjs` (the three rungs) and
`skills/paper-pipeline/scripts/consumer.mjs` (`ledgerPath`, three steps).

🔴 The load-bearing observation is not the count. All four repetitions happened **while
comments explaining the exact hazard sat directly above the code** — which is why that rule got
a lint rule (`eslint-rules/install-path-literals.ts`) and not another paragraph.

A fifth instance of the same class was measured the same day and is not yet fixed: the guard
in `ledgerPath` asks `insideNodeModules(hereDir)`, and a plugin cache is not `node_modules`, so
a plugin-only consumer without a `package.json` gets its ledger written into the cache — which
the documentation says changes when the plugin updates.

---

## 2026-08-05 — eleven unreadable passages that every check passed (why `cold-read-diff` exists)

The author of a paper found eleven unreadable passages by eye, in a paper that had passed six
writing grades, four structural passes and five review panels. Every one was short, factually
correct, free of every word on the jargon list and inside every mechanical threshold. Samples,
with the author's reactions:

> _"The state to remove is therefore not the rule but its claim about itself"_ — «wtf»
> _"Three answers, all of them after the fact"_ — «VAGUE AF»
> _"Both numbers carry a caveat…"_ — «WTF.»

They parse only for a reader who already holds the idea. Every reader in the pipeline either knew
too much (the author, a persona subagent handed the paper, the review panel) or could not read at
all (`prose-lint`, which counts patterns). So the check is a competent reader who is withheld the
context, not asked to ignore it. Several of the eleven had been introduced that morning by fixes
for other automated checks.

The first machine run of the skill the same day: about a third of the reader's stalls were
artefacts of the extract, not of the paper ("`it` has no referent", "cut off mid-clause"), because
it was handed `+` lines; it reported seven raw `{{placeholders}}` as missing numbers, and graded
`% JUSTIFY …` comments as prose. Hence whole paragraphs, macros expanded, comments dropped — now
done by `skills/cold-read-diff/scripts/cold-read.ts`, not by hand.

2026-11-10: run as a forked skill, the orchestrator blocked the caller for about 15 minutes, read
the rest of the paper, edited it and rebuilt the PDF (#405; a batched run took about 35, #301).
The measurements and the redesign are in #460.
