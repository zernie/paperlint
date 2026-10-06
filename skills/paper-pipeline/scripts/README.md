# paper-pipeline/scripts — the checkers the paper skills run

Each script here answers one mechanical question about a paper directory. The skills name them
in their instructions; a consumer reaches them through the path in `paperlint.json` → `scripts`
(default `.claude/skills/paper-pipeline/scripts`, a symlink `paperlint init` makes into the
installed package — see `consumer.mjs`).

| file                    | what it answers                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `extract-ref-facts.mjs` | parse the bibliography, ask the registries, write facts to JSON for the `refs/*` ESLint rules         |
| `generated-code.mjs`    | lint the analysis scripts before they produce a number (unseeded randomness, absolute paths, …)       |
| `consumer.mjs`          | where the consumer's repository is, and whether a script was executed or imported through the symlink |

The checkers with a `--flags-only` mode print nothing on a clean paper and exit 0 — that mode is
for hooks and pre-commit, where any output means a finding.

## Tests

Every script has its tests beside it: `<name>.test.*` (vitest) and, where the check is exercised as
a process on planted fixtures, `<name>.harness.*` (run by `vigiles test`). Both run under
`npm test`. Each harness plants the exact defect its checker claims to catch, asserts the checker
fires, and asserts it stays quiet on the clean case — a checker that fires on correct text is muted
within a day, which is worse than one that misses.

Assertions in a harness run at module top level: `vigiles test` imports the file and treats "did
not throw" as a pass, so an exported `tests` object would run nothing and still print ✓.
