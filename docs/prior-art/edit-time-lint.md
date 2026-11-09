# Reporting only what a change introduced

**Question this file answers:** the `lint-edited` hook lints a file right after an agent edits it.
The file usually already holds findings the edit did not cause; repeating them on every edit is
noise the agent learns to ignore. How do comparable tools report only what a change introduced, and
what can this package reuse?

**Verdict:** every tool examined compares against a **recorded "before"**: a diff (reviewdog), a
baseline file (ESLint bulk suppressions, Betterer), or a reference point in time (SonarQube). None
offers a reusable "which of these findings are new" for one edit: reviewdog needs a diff the hook
does not have, and ESLint's and Betterer's baselines count per rule or per test, which says that a
count went up but not which finding is the new one. So the hook keeps its own snapshot,
`<paper>/_build/edit-lint.json`, keyed per finding by file, rule, message and the text of its line,
and falls back to reviewdog's `added` filter — the lines the edit wrote — when there is no snapshot
yet.

Checked 2026-11-09 against the pages linked below.

---

## reviewdog — `-filter-mode`

The filter is a flag on the runner, and the default reports only what the diff added:

> **`added`** (default): "Filter results by added/modified lines."
> **`diff_context`**: "Filter results by diff context."
> **`file`**: "Filter results by added/modified file."
> **`nofilter`**: "Do not filter any results."

The hook's first edit in a paper is `added`: the lines of an Edit's `new_string`, of each MultiEdit
`new_string`, every line of a Write. What `added` cannot see — an edit that breaks a rule judged on
another line (a paper-level rule reported on `paper.tex`) — is why a snapshot follows it.

## ESLint — bulk suppressions (`eslint-suppressions.json`)

> "ESLint provides a way to suppress existing violations for one or more rules." … "ESLint creates a
> `eslint-suppressions.json` file in the root of the project." … "The Node.js API only supports
> applying existing suppressions."

Measured on ESLint 10.10.0 (`node_modules/eslint`): the `ESLint` constructor takes
`applySuppressions` and `suppressionsLocation`, but the writer, `SuppressionsService`
(`lib/services/suppressions-service.js`), is internal — `eslint` exports `ESLint`, `Linter`,
`RuleTester`, `SourceCode`, `loadESLint`, and `eslint/use-at-your-own-risk` exports only
`builtinRules` and `shouldUseFlatConfig`. And the file holds a count per file per rule
(`{"<file>": {"<rule>": {"count": 1}}}`, this repository's own `eslint-suppressions.json`): when the
count of a rule grows by one, nothing in it says which of the findings is the new one, which is the
one thing the hook must print.

## SonarQube — "new code"

> "New code is code that you've recently added or modified." … For pull requests, "new code is
> defined as the code that has changed in the pull request branch compared to the target branch."

A reference point (a version, a number of days, an analysis, a branch), and issues on the code
changed since then. The page does not say how an issue is matched across analyses. The hook's
reference point is the previous edit: the snapshot is overwritten after every run.

## Betterer — `.betterer.results`

> Betterer will "store the result of your tests in a" `.betterer.results` file. … "If it gets worse,
> your test will fail and Betterer will throw an error."

A committed snapshot and a ratchet: the closest in shape to the hook. Its comparison is one value
per test; the page does not say how individual issues are matched. The hook compares a multiset of
findings, so it can name the one that is new.

## What the hook takes from each

| from      | taken                                                                   | not taken, and why                                                                                  |
| --------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| reviewdog | `added`: report on the lines the change wrote, when there is no before  | the diff: a PostToolUse payload carries the new text, not a diff                                    |
| ESLint    | the engine itself (`isPathIgnored`, `lintFiles`, the stylish formatter) | bulk suppressions: the writer is not exported, and a per-rule count cannot name the new finding     |
| SonarQube | "new" is relative to a reference point                                  | a date or a branch as the reference: the previous edit is the only before the hook has              |
| Betterer  | a snapshot file, rewritten as results change                            | one value per test: the key here is per finding — file, rule, message, the trimmed text of its line |

## Sources

- reviewdog README, "Filter mode": https://github.com/reviewdog/reviewdog
- ESLint, "Bulk Suppressions": https://eslint.org/docs/latest/use/suppressions
- SonarQube, "About new code": https://docs.sonarsource.com/sonarqube-server/latest/user-guide/about-new-code/
- Betterer, "Introduction": https://phenomnomnominal.github.io/betterer/docs/introduction
