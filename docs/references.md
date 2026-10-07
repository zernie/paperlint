# The reference check

`paperlint build` checks every entry of a paper's bibliography against the services that know
about published work, after the PDF is built. `paperlint lint` then reports what the check found,
offline. This page explains how the check works, the file it keeps in your paper's folder, and
what happens in CI and without a network.

## What is checked, and where

For each entry of the databases the build's bibtex **opened** — the `.bib` files its `\bibliography` /
`\addbibresource` named after every switch and macro, and the file a `filecontents` block wrote. The
build records them in `<paper>/_build/sources.json` from TeX's own files (`paper.blg`), so nothing here
guesses which `.bib` TeX reads by reading the `.tex`. Their text is read by the one bibtex reader
(`src/ports/bib-reader.ts`):

| question                                                                                                 | asked of                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| does the cited work exist, and does its title match?                                                     | Crossref, OpenAlex, Semantic Scholar, arXiv |
| does a DOI that no registry knows really not exist?                                                      | doi.org, the DOI authority                  |
| for an entry that claims a published venue, are the authors the published version's, not the preprint's? | DBLP                                        |

CVE identifiers are not checked by `build`: a bibliography has no CVE field, so none is extracted.
The verify-citations script checks a `cve` against NVD when it is given citations as JSON (see the
skill), and that is the only place NVD is asked.

A work that is simply not found is `unresolvable`, never a failure: plenty of real work is not
indexed. Only a positive disproof fails an entry, for example a DOI that resolves to a different
paper, or one the DOI authority says does not exist.

The verdicts land in `<paper>/_build/references.json`: one verdict per entry of those databases, in the
order bibtex opened them, and a hash of their text. `paperlint lint` reads that file and reports:

| rule                 | when                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `paper/cite-exists`  | an entry's identifier provably does not resolve to the work cited                         |
| `paper/author-list`  | an entry's authors are the preprint's under a published venue                             |
| `paper/refs-fresh`   | the databases changed since the build checked them — build again                          |
| `paper/refs-checked` | no build has checked the references, or the last one could not, or the reader missed some |

An entry of a `.bib` is reported at the first line of `paper.tex`, with the entry's file, line and
column at the front of the message (`refs.bib:12:1: …`): ESLint does not lint a `.bib`.

The step never fails the build. Without a network the PDF is still built and lint warns that the
references were not checked.

**No record of the build, no answer.** Which databases bibtex opened is in `sources.json`, so a paper
with no record (never built), or one whose files changed since (`paper/sources-fresh`), has none to
check: the step records nothing, and the four rules are silent while `paper/sources-fresh` says once
that the paper must be built.

**What bibtex typeset, against what paperlint read.** The record also holds the keys bibtex typeset
(its `paper.bbl`). bibtex has no comment syntax, so an entry behind `%` or inside `@comment{…}` is one
it typesets and paperlint's reader does not; `paper/refs-checked` names each such key as not checked.
(bibtex's keys are case-insensitive: `\cite{SMITH}` typesets `\bibitem{SMITH}` from an entry `smith`,
which is the same entry.) A malformed `.bib` never gets that far: bibtex fails on it, and `paperlint
build` fails with bibtex's own lines.

A database TeX wrote itself (a `filecontents` block) is read from the file it left beside the paper. When
that file is not on disk, the step says which and `paper/refs-checked` warns: build again to write it.

## `repro/references-cache.json` — commit it

Asking five services about every entry is slow. DBLP asks clients to pause between requests, and a
slow service is retried. Before this cache existed, a 27-reference paper spent 217 seconds on the
check, on every build, and a 51-reference paper did not finish inside a 12-minute CI job
([#107](https://github.com/zernie/paperlint/issues/107)).

So the build keeps every answer it receives in `<paper>/repro/references-cache.json`, and the next
build asks only what that file cannot answer:

- An unchanged bibliography whose answers are under 30 days old asks nothing and makes no network request at all, not even the check
  for whether the services can be reached.
- Adding or editing an entry asks only about that entry. Answers are stored per identifier (DOI,
  arXiv id, or title), so changing an entry's DOI or title is what makes it be asked again.
- A request that failed is not an answer and is not stored, so the next build asks it again.
- "Does not exist" from doi.org is not stored either. A DOI cited before the authority has
  registered it would otherwise stay "does not exist" in the file forever; it is asked again on each
  build until the authority confirms it.

## When a service refuses

Free services rate-limit. From a CI runner or a shared network, Semantic Scholar answers `429`,
DBLP answers an HTML page where JSON was asked, a registry stops answering. The check handles this
within one build:

- **A service that refuses stops being asked for the rest of the build.** The first request to
  each service goes alone; once a service refuses (a `429` or `5xx`, HTML instead of JSON, a
  timeout, no connection), no new request goes to it until the next build, and no retries or pauses
  are spent on it. A service that refuses from the start costs one request. One that starts refusing
  later costs at most the requests already in flight at that moment — six, the number of entries
  checked at once.
- **The entries it would have answered say so.** An entry no registry confirmed carries
  `not asked: <service>: <reason>` in its reason. An entry whose authors DBLP could not check is
  `authors: unchecked`, which `paper/refs-checked` reports and lint never treats as a pass.
- **Once one registry confirms a work, the others are not asked.** A confirmation settles the
  verdict, so the remaining registries (and doi.org) could only cost requests.
- **DBLP's pace** — it asks clients to pause between queries — is kept between queries DBLP
  actually answered, and not after a cached answer or once DBLP has refused.

Measured 2026-09-27 from a sandboxed runner where Semantic Scholar, OpenAlex and Crossref answered
`429` and DBLP answered HTML: a 30-reference paper built in 5.6 s cold and 5.4 s warm (the check
used to take 475 s and 450 s). Its entries were recorded, with the refusals named, and each later
build fills in more of the cache as the services let it.

**Commit this file.** It sits in `repro/`, beside the paper's other reproduction files, and not in
`_build/`, which is build output. Committed, it makes CI and every other clone start warm: a CI job
that builds an unchanged paper spends no time on the check.

It holds what the services answered, each answer with the day it was fetched, and never a verdict.
The verdicts are worked out again from those answers on every build, so an improvement to the
checker reaches every paper at once, instead of being frozen behind a stored "passed".

### Refreshing it

An answer is used for 30 days after the date in its `fetched` field; after that the next build asks
again and re-dates it. This is what lets a work that a service had not indexed yet ("no record")
be found once it is. An answer that could not be refreshed because the service refused stays, and is
asked again on the next build. To ask sooner:

- **one entry**: delete its lines from the file (the keys name the service and the identifier, and
  DBLP answers carry the title they were asked for);
- **everything**: delete the file.

The next build asks again and writes the new answers.

### A file that does not read

The build refuses a cache file it cannot read (bad JSON, another schema version, a field of the
wrong type) and says which part is wrong. It does not overwrite the file, and does not run the
check over half a cache: the references are recorded as not checked, and lint says so. Fix the
file, or delete it.

## CI

| the paper has                     | a CI build                                                         |
| --------------------------------- | ------------------------------------------------------------------ |
| a committed, up-to-date cache     | asks nothing, needs no network for the check                       |
| a cache missing a few new entries | asks about those entries only                                      |
| no cache committed                | asks about every entry, every run: commit the file after one build |

A CI run writes new answers into its own checkout, which is thrown away. Build locally and commit
the file to keep the answers.

## Running a checker by hand

The two checkers are scripts in the `verify-citations` skill and can be run on their own to read
one verdict in full: `verify-cites.mjs` (existence and title) and `bib-authors.mjs` (authors). Run
from the command line, `verify-cites.mjs` keeps its own cache in `~/.cache/paperlint/cite-cache.json`
(`VERIFY_CITES_CACHE` overrides); it never reads or writes the paper's committed cache.
