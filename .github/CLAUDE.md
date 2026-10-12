# CLAUDE.md — `.github/`

Loaded when working under `.github/`. Why Dependabot runs the way it does is in the comments of
`dependabot.yml`.

- **This repository is public; its Actions minutes were verified free on 2026-09-17.** If it is ever
  made private, revisit this file and `dependabot.yml` together: private minutes come out of an
  account-wide 3000 a month, and the bot is justified by these minutes being free. Decide the budget
  before adding a workflow, not after the first bill.
- **Dependabot runs monthly, with `vigiles` exempt from the cooldown.** For our own packages the
  primary path is "merge in vigiles, bump every consumer in the same pass".
- **`release.yml` releases from the PR title**: semantic-release reads the squash commit.
  `pr-title.yml` rejects a title without a conventional prefix. Never `npm publish` by hand.
