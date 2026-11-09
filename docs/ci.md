# Run it in CI

Two jobs, one choice: how much of the paper CI judges.

| job                        | time                          | checks                                     |
| -------------------------- | ----------------------------- | ------------------------------------------ |
| build, then lint           | ~3 min first run, then cached | everything                                 |
| lint only (`init` adds it) | seconds                       | the source; not pages, fonts or references |

`paperlint lint` exits non-zero on any error; warnings only print, unless you pass
`--max-warnings <n>`. It also prints, on stderr, `linted <N> file(s) in <S> s` and, when the run
took over 10 s, the three slowest rules with their milliseconds (`slowest rules: <rule> <ms> ms · …`):
the line a slow job log needs to name its culprit. When `.claude/settings.json` wires some paperlint
hooks and not others, it prints one more stderr line naming the missing ones; the exit code does not change.

## Build, then lint

Lint judges pages, fonts and references from what build measured, so the full job builds first.
The cache keeps TeX Live between runs:

```yaml
name: papers
on: [push, pull_request]
jobs:
  papers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: ~/.cache/paperlint/texlive
          key: texlive-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx paperlint toolchain
      - run: npx paperlint build --all
      - run: npx paperlint lint
```

Commit `repro/data/references-cache.json` of each paper: with it, a build asks the citation
services only about new or edited entries, so an unchanged bibliography usually builds without
the network ([`references.md`](references.md)).

## Lint only

Each paper then gets one warning that it was not built. Call the action from the installed package,
after `npm ci`: the action and the CLI it runs are then one revision, pinned by your lockfile.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: npm ci
  - uses: ./node_modules/paperlint
```

With no `paths` it lints the `papersDir` of your `paperlint.json`; pass `paths:` only to lint less.

This is the workflow `paperlint init` offers to write ([`install.md`](install.md)).
