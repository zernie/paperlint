# tex/venue-leftover

**Level:** warn · **Reads:** `paper.tex`, and the shipped venue presets

## What it catches

The paper names another venue than the edition set in its `paperlint.json`. Usually that is text
left over from an earlier submission: "Submission to VenueA 2026" in the author block of a paper now
going to VenueB 2027.

It only knows the venues paperlint ships a preset for, by each preset's `name` and `aliases`, and the
year of each edition, which is the preset's id (`icse-2028` is ICSE 2028). A venue with no preset is
not recognized.

It runs only when the paper extends a venue preset. A template family (`paperlint:acm-sigconf`,
`paperlint:ieee-conference`) names no venue, so no venue is "another" one, and the rule is silent.

## Where it looks

| part of the paper                                                | read                         |
| ---------------------------------------------------------------- | ---------------------------- |
| a venue-stating command (`\acmConference` …), wherever it stands | always                       |
| the front matter: everything before the first `\section`         | always                       |
| the body: from the first `\section` on                           | only with `{ "body": true }` |
| a paper with no `\section`                                       | all of it, as front matter   |

The body is off by default because related work names venues with recent years on every page:
«Lam et al. (CodeCrash, NeurIPS 2025)», «A separate ASE 2026 study examines …». On the 206 papers of
the real-paper corpus, every one of the 18 findings the rule gave in the body or under a family preset
was such a citation or the paper's own venue line; with this scope it gives none. A leftover from an
earlier submission sits in the author block, the venue line, a footnote on the title page or the
abstract, which the default still reads.

## When a name counts

A venue preset is one edition, and its year has one source: the id. A name never carries a year
(`ICSE`, not `ICSE 2028`); the rule reads the year written beside the name in the paper.

| where the name stands                                                                                       | it counts when                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| in prose                                                                                                    | a year stands right beside it — `2027`, `'27` or `’27`, `~2027` — no older than the paper's own edition's year minus one. «ICSE 2019» in related work, an acronym the paper defines («Manual Speech Recognition (MSR)»), and a bare name without a year are silent |
| inside a command that states the venue — `\acmConference`, `\acmBooktitle`, `\conferenceinfo`, `\IEEEpubid` | always, with or without a year: the line is there to name the venue                                                                                                                                                                                                |

The paper's own names, and those of the conference its venue is held at (its `parent`, of the same
year), count only in ANOTHER edition: «ICSE 2027» in an ICSE 2028 paper is a leftover, «ICSE 2028» is
not, and «ICSE 2019» in prose is related work. In a venue-stating command any other year of its own
series counts. A paper whose preset of its own ends in no year (`./venues/mine.jsonc`) has no edition
year: any year beside another venue's name counts, and its own names never do.

ACL's template has no venue-stating command; IEEEtran states the venue, when at all, in the
`\IEEEpubid` copyright line.

It reads `paper.tex` with the files it `\input`s, `\include`s or `\subfile`s
spliced in; a name found in an included file is reported at that include, with the file and line at
the front of the message. It looks at what a reader sees — prose, the author block, captions,
footnotes, a citation's note in square brackets, and the venue-stating commands — and ignores
comments, citation keys, labels, URLs (a `\url`, and the address of an `\href` — its link text is
read), math, code and the bibliography. Names are matched as whole words, case-sensitive.

A macro definition that names another venue — `\newcommand{\oldvenue}{VenueA 2026}` — is reported at
the definition, whether or not the macro is used: the rule does not expand macros, so a use such as
`Submitted to \oldvenue` has no text of its own, and the definition is where the old name lives.

## The flow

```text
 stage                         who writes it            what checks it                  when
 ───────────────────────────── ──────────────────────── ─────────────────────────────── ─────────────
 1 presets/<series>-<year>     paperlint's maintainers  the schema (no year in `name`   every lint of
   .jsonc: name, aliases,      (the add-venue skill)    or `aliases`; `parent` needs    presets/, CI
   workshop + parent                                    `workshop`), src/presets.test.ts
                                                        (id ↔ type, parent's year)
 2 paperlint.json "extends":   the author               the resolver: a bare series     every lint
   "paperlint:<series>-<year>"                          is refused, naming the editions
 3 paper.tex: prose and the    the author               tex/venue-leftover: each name   every lint
   \acmConference line                                  with the year beside it
 4 a finding                   —                        a warning on that line: printed —
                                                        and the exit code stays 0
```

What the machine cannot see: a venue without a shipped preset; a leftover in the body, unless
`body` is on; an abstract set as `\section*{Abstract}` (the front matter ends at the first section,
starred or not, so such an abstract is body); a `\section` token that is no heading
(`\titlespacing*{\section}`, `\let\oldsection\section`) standing before the abstract, which ends the
front matter early; a year written apart from the name
(«MSR, in 2027»); a name split by markup (`\textbf{AI}Sec`); a venue named in a sentence on purpose,
which only a disable directive tells apart.

## Why

A reviewer reads the author block before the abstract. A line naming the previous venue tells them
the paper was written for somewhere else, and at a double-blind venue it can say more than that.
Nothing else compares what the source says about the venue with what the settings say. The year
rule keeps the warning for what a leftover looks like — a recent edition, or the venue line — and
off related work, which names venues and years on every page.

## Examples

Under `"extends": "paperlint:realm-2026"`:

```latex
\acmConference[AgenticDev '26]{Workshop on Agentic Development}  % warns: «AgenticDev», in the venue line
First written for AgenticDev 2026.                                % warns: a recent year beside it
As shown at ICSE 2019~\cite{x}.                                   % silent: related work
Unlike AgenticDev, this workshop …                                % silent: no year, in prose
As shown~\cite{agenticdev2025}.                                   % silent: a citation key
% AgenticDev draft                                                 % silent: a comment
```

The second line reports:

> «AgenticDev» names AgenticDev 2026, and this paper extends REALM 2026 — a leftover from an earlier
> submission? A reviewer reads it before the abstract. Comments and citation keys are not reported;
> a sentence that names the other venue on purpose can keep it with a disable directive

The same lines pass under `"extends": "paperlint:agenticdev-2026"`: they name the paper's own
edition.

## Preset fields

One rule option, `body` (default `false`): also read the body, from the first `\section` on.

```jsonc
"rules": { "tex/venue-leftover": ["warn", { "body": true }] }
```

It reads every shipped preset's `name` and `aliases`, collected along `extends`,
and the year of its id:

```jsonc
"aliases": ["AgenticDev"]
```

A name the paper's own chain also declares (two workshops of one parent conference) counts only in
another edition.

```jsonc
"workshop": true,
"parent": "paperlint:ase-2026"
```

The conference edition a workshop is held at, of the workshop's own year. Its `name` and `aliases`,
and its own parent's, count as the paper's own: under `paperlint:agenticdev-2026`, whose parent is
`paperlint:ase-2026`, «a workshop of ASE 2026» is silent; under `paperlint:aidc-2026`, the same
sentence reports «ASE» once, as ASE 2026. A conference's names belong to its own preset, not to each
workshop's `aliases`, so another venue's paper that names it is reported once, as that conference:
«ACM CCS 2026» in an AIDC paper names ACM CCS 2026, not AISec. A `parent` that does not resolve to a
venue preset, a parent of another year, or parents that name each other, are refused.

## What it does not check

- A venue no shipped preset describes.
- A paper that extends a template family rather than a venue.
- The body, from the first `\section` on, unless `body` is on.
- A name split by markup (`\textbf{AI}Sec`).
- A name in prose with no year beside it («submitted to MSR»): the rule cannot tell it from an
  acronym or a mention of the series.

## How to fix

Remove or replace the old venue's name. A sentence that names another venue on purpose keeps it
with ESLint's directive and the reason:

```latex
% eslint-disable-next-line tex/venue-leftover -- comparing with the venue that published [3]
Unlike AgenticDev 2026, this workshop …
```
