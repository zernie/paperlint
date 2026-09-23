# Reproduction-artifact checklist (single source of truth)

The single biggest accept-probability lever for an empirical/measurement paper: a reviewer who can run
it. `build-benchmark` produces it; `pc-panel-review`'s artifact-runner executes it; `submit-paper`
hosts it. Cite this file instead of restating it. Grounded in the two real artifacts this session:
the 140-run `reproduce.py` (AgenticDev) and the 46-guard `evaluate.py`/`mutate.py`/`reproduce.mjs`/
`ablation.mjs` (AISec).

## Non-negotiables

- **Self-checking.** A script that **recomputes every headline number from the raw data and exits
  non-zero if any cell drifts** — PASS/FAIL per number, not "eyeball this table." A reviewer sees a
  green run or a red one.
- **Recompute, never echo.** Derive each number from the base data fields. Do NOT print a stored/
  precomputed summary field and call it "reproduced" — a sharp reviewer greps for that and calls it
  circular. (AISec review caught exactly this; AgenticDev's first draft echoed 4 cells — both fixed by
  deriving from base fields.)
- **Stdlib-only, no network, deterministic.** No NumPy/SciPy if avoidable (implement Welch t / the
  Student-t CDF / paired-t CI from scratch); no API keys; no model calls at run time; identical output
  every run. Runs in seconds on a clean machine.
- **Safe to run.** Never execute untrusted or destructive commands to measure them — **parse/transcribe**
  (AISec's "parse, don't execute": statically apply each guard's predicate; `rm -rf /` is only ever a
  string). The artifact must be safe to `unzip && run` on any laptop.
- **Honest scope.** If you ship per-arm aggregates, don't claim "raw N runs"; if the shipped guards are a
  transcription of a compiled tool, say so. Name the badge you claim (Available / Functional / Results-
  Reproduced, and scope Reproduced to the analysis layer if generation needs keys/models).

## Contents (mirror this file map)

- `reproduce.py` / the harness scripts — self-check, print `RESULT: PASS`, exit non-zero on drift.
- `data/…` — the raw measurements the numbers derive from.
- `README.md` — a **"what reproduces which paper number"** table (paper location → the line that prints
  it), a scope/method note, and the run command.
- `LICENSE` — MIT (or similar); the "Available" badge often requires one. Anonymized author line for review.
- No `__pycache__` / `node_modules` / generated `*results*.json` in the shipped zip (`.pyc` can embed
  your absolute repo path — a de-anon leak). Strip distinctive fingerprints (an exact star count, a
  total-spend figure).

## Before shipping

- Run it once on a clean checkout → `PASS`, exit 0.
- De-anon scan the whole tree (see `anonymization.md`).
- Zip **only** the artifact dir (never sibling internal dirs). A release-gate script that greps for
  identity + Cyrillic, re-runs the harnesses, and zips only the artifact is the pattern
  (`<papers-root>/<paper>/check-release.sh` is a working example in the first consumer).
- Host it anonymized for double-blind review — see `submit-paper` §hosting and `osf-artifact-upload`.

## Provenance

AgenticDev `reproduce.py`: recomputes Table 1, Bonferroni survivors, pooled bill + paired-t CI, the
0.6%/20%/13% structural bound — all `PASS`, hand-verified by a reviewer to 7 digits. AISec: four
self-asserting harnesses; a reviewer re-ran them and stress-tested the release gate (planted a leak → the
gate caught it).

---

## 🔴 The check that was missing until 2026-08-06: is the data IN the bundle?

Every gate on an artifact inspects **what is present**. The anonymity gate asks whether anything
leaks. The numbers gate asks whether a printed figure matches its data file. An artifact reviewer
asks whether the code runs. **A missing directory passes all three** — nothing leaks, nothing
mismatches, and everything present still runs.

Observed: a paper's released bundle contained **no data at all** for the section its abstract leads
with. Six `harden-paper` passes and five review panels had not noticed. It surfaced because the
author asked a plain question — _"did we ever actually run the artifact?"_

**Run `paper-pipeline/scripts/artifact-coverage.mjs <paper-dir>` — wired into pre-commit and CI.**
Two checks, deliberately dumb:

1. every body section that prints a figure is named in the bundle's index (`NUMBERS.md`);
2. every path the index names exists in the bundle.

Its first run found **three** gaps: one real absence, and two experiments whose data shipped but
which the index never named — so a reviewer following the index would have concluded they were
unreleased. Absence and unfindability fail the same way for a reader.

## Running `aclpubcheck` locally

The official ACL format checker. `pip install aclpubcheck` fails in some sandboxes (`bibtexparser`
will not build a wheel). Working recipe:

```bash
git clone --depth 1 https://github.com/acl-org/aclpubcheck.git
pip install pdfplumber PyPDF2 termcolor numpy pylatexenc pybtex unidecode
mkdir -p stub/rebiber   # rebiber is used ONLY by the optional author-name check
printf 'def construct_bib_db(*a, **k): return {}\n' > stub/rebiber/__init__.py
PYTHONPATH=stub python3 -m aclpubcheck --paper_type long <pdf>
```

🔴 **Run it on a build WITHOUT line numbers.** Against a `[review]`-mode PDF it reports one margin
error per line number — about 2,000 of them, all spurious, because it is written for camera-ready
files. A checker whose output is 100% false positives gets muted the same day.
