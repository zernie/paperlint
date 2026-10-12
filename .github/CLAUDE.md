<!-- vigiles:sha256:6f7484df8329c8dc compiled from .github/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `.github/`

Loaded when working under `.github/`. Why Dependabot runs the way it does is in the comments of
`.github/dependabot.yml`.

## Rules

### Public Repo Free Minutes

**Guidance only** — This repository is public; its Actions minutes were verified free on 2026-09-17. If it is ever made private, revisit this file and `dependabot.yml` together: private minutes come out of an account-wide 3000 a month, and the bot is justified by these minutes being free. Decide the budget before adding a workflow, not after the first bill.

### Dependabot Monthly

**Guidance only** — Dependabot runs monthly, with `vigiles` exempt from the cooldown. For our own packages the primary path is "merge in vigiles, bump every consumer in the same pass".

### Release From The Squash Commit

**Guidance only** — `release.yml` releases from the PR title: semantic-release reads the squash commit. `pr-title.yml` rejects a title without a conventional prefix. Never `npm publish` by hand.
