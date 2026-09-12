# Anonymization & double-blind hygiene (single source of truth)

Double-blind hides **you** (the author), not the *subject* of study. Identifying the artifact/tool you
evaluate is fine and often necessary; leaking the author is a desk-reject. Security venues add a second
duty: don't **punch down** on named third parties (anonymize the subjects too). Cite this file; don't
restate it. `submit-paper` and `camera-ready` point here; `pc-panel-review`'s artifact-runner greps by it.

## The deny-list (grep before every submission — PDF text AND every shipped file)
Author/identity strings to find and remove from anything a reviewer sees:
```
# Your OWN list of identifiers — names, surnames, handles, repo names, tool names, email.
# It is CONSUMER DATA, so it lives in your repository, not in this package:
#   .claude/skills/submit-paper/deanon-denylist.txt   (one extended regex per line)
bash .claude/skills/submit-paper/check-deanon.sh <paper-dir>   # PDF text + artifact/ + inside *.zip
grep -rIiE "$(grep -vE '^\s*(#|$)' .claude/skills/submit-paper/deanon-denylist.txt | paste -sd'|')" <targets>
```
Plus a **non-English script** in the source (an author-language fingerprint — Cyrillic in the example
below; use whatever script your own notes are written in) — but detect it UTF-8-aware, because
a naive `[А-Яа-я]` byte-class false-positives on em-dashes/smart-quotes in a C locale:
```
rg -l '\p{Cyrillic}' <targets>            # or: grep -rIlP '\p{Cyrillic}'
```
Both must return empty. Also scan the compiled PDF's text (`pdftotext paper.pdf - | grep -i …`) and any
`.pyc`/`__pycache__` (they can embed your absolute repo path) — delete caches before zipping.

## What is and isn't a leak
- **Not a leak (keep):** naming/pinpointing the *studied* artifact — a tool's exact star count, the
  command you evaluate, the model tested. That's the object of study; it makes the claim meaningful.
- **Leak (remove):** your name, affiliation, repo/tool name, email, GitHub handle, absolute filesystem
  paths, non-English source comments/docs, a public "twin" (blog/preprint) under your name with the same
  distinctive numbers (a reviewer can Google it — don't cite it; check the venue's preprint policy).
- **Ethics (security venues especially):** if you evaluate real third-party code by named hobbyists,
  **anonymize the subjects too** in the release (stable IDs, factual not pejorative tone) and keep full
  provenance author-side. Disclose findings to the parties before any de-anonymized public release.
  (AISec's top reject-vector was a released artifact that named 46 maintainers with handles + pejorative
  notes — fixed by G01–G46 IDs + neutral tone + a release gate.)

## Submission hygiene
- Submit **PDF-only**; never zip the paper's source directory — sibling files (drafts, internal READMEs,
  notes) leak identity. Only a scrubbed artifact bundle is safe.
- LaTeX: use the venue's anonymous class option (ACM `[sigconf,review,anonymous]`); author = "Anonymous
  Author(s)"; strip identifying `%` comments from the `.tex` before any source upload.
- Host the artifact anonymized (OSF private project + anonymized view-only link, or 4open on a *private*
  repo). **Verify in an incognito window**: files visible, contributors = "Anonymous," your name nowhere.
- A **release-gate script** that greps this deny-list, re-runs the harnesses, and zips only the artifact
  dir is the belt-and-suspenders pattern (`<papers-root>/<paper>/check-release.sh` in the first
  consumer of this pipeline).

## Reversing it (camera-ready)
On acceptance, `camera-ready` reverses all of the above: drop `review,anonymous`, restore real
author/affiliation/ORCID, un-blind self-citations and "our tool" naming, swap the anonymized link for a
public repo + archival DOI, and complete + log responsible disclosure.

## Provenance
AgenticDev: rounded an exact star count, deleted a source comment naming the author's own tool,
verified PDF+zip clean.
AISec: full RU→EN + handle-stripping of the provenance, an evaluator that stress-tested the release gate.
