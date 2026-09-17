# Incidents — the measurements the rules stand on

`CLAUDE.md` is loaded on every turn, so it carries **the claim and the remedy** and nothing
else. The measurement that produced a rule lives here, and is read only when someone argues
with the rule or wants to know how it was found.

Two things never move into this file: a measurement that **is** the rule (rule 5's table of
claims that fell to one command — without it the rule reads "measure things", which nobody
obeys), and evidence that already lives in a code comment beside the code it explains. Those
get a pointer, never a copy.

Entries are append-only and dated. A superseded entry is marked, not deleted.

---

## 2026-09-17 — four fixes proposed and withdrawn in one session (rule 9)

Each was proposed before the defect it claimed to fix had been exhibited, and each fell to a
single command:

| proposed | what one command showed instead |
|---|---|
| a new `skip` API in the test runner | the existing classification had never been shown to be wrong |
| a `link` subcommand as the single install path | this package is consumed three ways, and a plugin cannot serve two of them |
| "one delivery channel instead of two" | the channels carry different things: eight ESLint imports and a composite action on one side, skills and hooks on the other |
| "symlinked skills are our own invention" | the documentation describes them, and third-party repositories install exactly that way |

Two of the four were demolished by an adversarial second pass **before** either was built. A
third pass over six claims about the plugin channel corrected four of them — including a count
attributed to the wrong file (110 was one script's occurrences; the prefix has 208 across 190
lines) and a "nothing is installed" claim that was false in the consumer, where 54 symlinks
make the path resolve.

Cost of the pattern: the four proposals took more of the session than the work they proposed.

## 2026-09-17 — the install-location class, four silent breakages (rule 10)

One class — *code that knows where it is on disk* — has broken this repository four times, and
not one of the four announced itself:

| when | what was assumed | how it failed |
|---|---|---|
| until 2026-08-15 | `resolve(HERE, "..", "skills")`, correct while the code lived beside the skills | a hash over a missing directory is stable, so every verdict read FRESH forever, with no error |
| 2026-09-12 | the same walk, after the move into a package | broke the same way, in the same silent direction |
| 2026-09-12 | the ledger defaults to a file beside its own module | inside `node_modules`, which `npm ci` deletes: appending SUCCEEDS, so rows look recorded until the next install removes them |
| 2026-09-17 | skills name their scripts by an install-specific path — 208 literals across 190 lines, in bodies and in `allowed-tools` | resolves through a symlink for one consumer and does not exist for another |

The first three are documented in the code they broke, and that is where the detail stays:
`skills/paper-pipeline/scripts/ledger.mjs` (the three rungs) and `lib/consumer.mjs`
(`ledgerPath`, three steps).

🔴 The load-bearing observation is not the count. All four repetitions happened **while
comments explaining the exact hazard sat directly above the code** — which is why rule 10 owes
a lint rule and not another paragraph.

A fifth instance of the same class was measured the same day and is not yet fixed: the guard
in `ledgerPath` asks `insideNodeModules(hereDir)`, and a plugin cache is not `node_modules`, so
a plugin-only consumer without a `package.json` gets its ledger written into the cache — which
the documentation says changes when the plugin updates.
