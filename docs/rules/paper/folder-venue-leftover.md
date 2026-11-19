# paper/folder-venue-leftover

**Level:** warn · **Reads:** the paper folder's name, its `paperlint.json`, and the shipped venue
presets · **Reported on:** the first line of the paper's `PIPELINE-STATUS.md`

## What it catches

The paper's folder is named after a venue other than the one its `paperlint.json` extends. Usually
the folder was named for the first venue the paper went to, and the paper has since been retargeted:
`papers/aisec-2026/` holding a paper that now extends `paperlint:aidc-2026`.

The folder name is read as words: runs of letters and runs of digits, split on everything else, case
ignored. `aisec-2026`, `aisec_2026` and `aisec2026` all name AISec; `overrealm` and `realms` do not
name REALM. A venue name of several words (`ACM CCS`) counts only when its words stand in a row.

The venue names come from the preset registry: each shipped edition as its `name` and the year of its
id (`AISec 2026` for `aisec-2026`), and the `aliases` its files declare (`AISec`). The bare `name`
alone is not matched: it may be an ordinary word (`AGENT`, so `papers/agent-study/` names nothing,
while `papers/agent-2027-study/` names AGENT 2027) or the series of every edition (`ICSE`). A venue
with no shipped preset is not recognized. The paper's own names, and those of the conference its
venue is held at (its `parent`, of the same year), are the paper's own, bare or with the year.

## Why

Venues change on resubmission: a workshop paper that is rejected goes to the next workshop, and a
venue can be cancelled. The folder name does not change with it, and a folder named after the old
venue tells everyone who opens the repository — a co-author, a script, an agent — which venue the
paper is for, wrongly. The venue is already declared once, in `paperlint.json`; a second, stale
copy of it in the path is the one that misleads.

A name that describes the work (`agent-rule-drift`, `harness-misconfig`) stays right whichever venue
the paper goes to.

## Examples

Failing — a paper whose `paperlint.json` is `{ "extends": "paperlint:aidc-2026", "kind": "regular" }`,
in `papers/aisec-2026/`:

```text
papers/aisec-2026/PIPELINE-STATUS.md
  1:1  warning  the folder name «aisec-2026» names the venue AISec 2026, and this paper extends AIDC — the
                name went stale when the venue changed, and venues change on every resubmission. Name
                the folder after the work (what the paper shows), not the venue
                paper/folder-venue-leftover
```

Named by an alias, the message says which (`IEEE S&P 2027 («Oakland»)`); named by the series
alone, it says the series: `papers/emnlp-agents/` under `paperlint:aidc-2026` names `EMNLP`. Another
edition of the paper's own series is another venue: `papers/icse-2027-flaky/` under
`paperlint:icse-2028` names `ICSE 2027`.

Passing:

- `papers/agent-rule-drift/` — names no venue;
- `papers/aidc-2026/` or `papers/acsac-2026/` under `paperlint:aidc-2026` — the paper's own edition, or
  that of the conference it is held at (`"parent": "paperlint:acsac-2026"`);
- `papers/ase-agents/` under `paperlint:agenticdev-2026` — the conference the workshop is held at
  (`"parent": "paperlint:ase-2026"`); under `paperlint:aidc-2026` the same folder names ASE;
- `papers/overrealm-study/` — `realm` inside another word is that other word;
- any folder whose `paperlint.json` has no `extends` yet, or none at all;
- `papers/secure-acsac24/` under `paperlint:ieee-conference` — a bare template family names no venue.

## Options / preset fields

No rule options. It reads each shipped preset's `name`, the year of its id, and its `aliases`, the
fields `tex/venue-leftover` reads too:

```jsonc
"aliases": ["AISec"],
"parent": "paperlint:ccs-2026"
```

A name the paper's own chain also declares, or its `parent` conference's, is never reported.

## What it does not check

- A venue no shipped preset describes — including one that was cancelled and has no preset.
- A folder named after the paper's own venue. It is right today and goes stale on the next
  resubmission, so `paperlint new` refuses to create such a folder at all (unless given
  `--allow-venue-name`); this rule is the backstop for folders made by hand, with that flag, or
  before the refusal, and reports only the name that is already wrong.
- A paper whose `extends` is unset or does not resolve: with no venue there is nothing to compare,
  and `pdf/measured` or `pdf/profile` already speaks.
- A paper whose `extends` names only a template family (`paperlint:acm-sigconf`,
  `paperlint:ieee-conference` — a preset with no kinds). It declares a format, not a venue, so a venue
  in its folder name may well be its own: the accepted ACSAC papers this rule is checked on live in
  `…-acsac24` folders and extend `ieee-conference`, while ACSAC is a shipped venue (`acsac-2026`).

## How to fix

Rename the folder after the work, and update whatever names the path (a CI matrix, a link in a
README):

```sh
git mv papers/aisec-2026 papers/agent-rule-drift
```

A folder that should keep its name — a team convention, links you cannot change — turns the rule off
in that paper's `paperlint.json`, beside the `extends` it compares with:

```json
{
  "extends": "paperlint:aidc-2026",
  "kind": "regular",
  "rules": { "paper/folder-venue-leftover": "off" }
}
```

A disable comment in `PIPELINE-STATUS.md` does not work here: the finding is on the file's first
line, the frontmatter's `---`, and a directive below the frontmatter comes after it, so ESLint
reports the directive as unused and the finding stays.
