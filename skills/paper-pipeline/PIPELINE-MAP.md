---
title: "Paper pipeline map — what runs where"
created: 2026-08-26
updated: 2026-08-26
tags: [paper-pipeline, ci, hooks, map]
---

# What runs where: the pipeline map

Assembled 2026-08-26 **from facts** — `.claude/settings.json` and
`.github/workflows/paper-gates.yml` — not from memory. Occasion (translated from Russian): "I have
no fucking idea how the pipeline works right now."


> ⭐ **How to build checks** (the ladder, occupancy across 14 tools, measurements) —
> in the author's private notes: `<papers-root>/research/2026-08-26-sessiya-arhitektura-payplayna.md`

## Four tiers, and they fire at different times

```
┌─ TIER 1: WHILE WRITING ────────────────────── instant, in-session ──┐
│                                                                      │
│  you edit paper.md / paper.tex                                      │
│         │                                                            │
│         ├─ PreToolUse   → paper-lint pre      🛑 THE ONLY BLOCKER   │
│         │                  paragraph >200 words · ≥9 numbers ·      │
│         │                  sentence >55 words · refuses the edit    │
│         │                  outright                                 │
│         │                                                            │
│         ├─ PreToolUse   → paper-edit-guard    🛑 a write from Bash  │
│         │                  (bypassing PostToolUse gates) → deny     │
│         │                                                            │
│         └─ PostToolUse  → paper-lint post     ⚠️ nudges only        │
│                            plain-language · carries: · SHAVE        │
│                            prose-lint · the numbers gate             │
│                                                                      │
│  end of response → Stop → paper-lint stop  (throttled to 1 hour)    │
│                        15 checks across all papers                   │
│                        + kb-lint stop: 12 checks across the base    │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─ TIER 2: BUILD ───────────────────── when you run pdflatex ─────────┐
│                                                                      │
│   paper.tex                                                          │
│      │                                                               │
│      ▼                                                               │
│   pdflatex ──┬─→ INSIDE, acmart runs (the document class)            │
│              │   it's the same thing that complains in the log:      │
│              │   no CCS · no libertine ·                              │
│              │   «ACM reference format is mandatory»                 │
│              │                                                       │
│              ├─→ paper.pdf   ← the final artifact, fonts EMBEDDED    │
│              ├─→ paper.log   ← acmart writes its warnings here       │
│              └─→ paper.blg   ← bibtex writes bibliography errors here│
│                                                                      │
│   check-render.sh reads ALL THREE:                                   │
│      log → overfull · undefined refs · class warnings                │
│      blg → dropped entries · cited-but-absent                        │
│      pdf → fonts (LinLibertine/LinBiolinum) ← added 25.08            │
│      + chktex on the .tex, if installed (advisory)                   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─ TIER 3: CI ─────────────── on push/PR, 7 jobs ──────────────────────┐
│                                                                      │
│  changes ──┐ a path classifier, ~10s, WITHOUT a checkout             │
│            │ decides which jobs even run                            │
│            ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ prose      eslint(md) · paper-lint --gate 🛑 · bib-authors  │    │
│  │            prose-lint · artifact coverage · population map  │    │
│  │            structure · provenance · verify-cites · scorecard│    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ numbers    paper_numbers selftest → gate                    │    │
│  │            artifact/reproduce.py ← wired in 26.08            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ anonymity  check-anon over the bundle + every *.selftest.{sh,mjs} │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ build      texlive/texlive:latest container ← FONTS LIVE HERE│    │
│  │            aclpubcheck (optional) · builds · check-render    │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ hooks      vigiles lint 🛑 · every harness on disk           │    │
│  │            TeXtidote (pinned jar) · ledger selftest          │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ skill-firing   once a week, a real model                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─ TIER 4: THE VENUE ──────── the one verdict that actually decides ──┐
│                                                                      │
│   eRights (ACM) ──→ issues a block of copyright commands             │
│         │              ↓ paste into paper.tex, REBUILD               │
│         ▼                                                            │
│   upload goes to TWO PLACES:                                         │
│      • conference-publishing.com  ← goes to typesetting and ACM DL   │
│      • HotCRP paper/20/edit       ← a copy for the workshop chairs   │
│         │                                                            │
│         ▼                                                            │
│   their checker (TAPS / the portal's format checker) — closed-source │
└──────────────────────────────────────────────────────────────────────┘
```

## What only runs by hand

Skills (`grade-paper-writing`, `tighten-paper`, `pc-panel-review`, `cold-read-diff`,
`verify-citations`, `argument-arc`, `harden-paper`…) are **not invoked by any event**. A human calls
them. This is the judgment layer; its mechanical parts should keep getting pushed down into tiers
1–3.

## Where each tier catches the same thing

| defect | caught by |
|---|---|
| a wall-of-text paragraph on insertion | tier 1, blocks |
| a number that doesn't match the data | tier 1 (post) and tier 3 (numbers) |
| a reference dropped by bibtex | tier 2 (`.blg`) → tier 3 (build) |
| **wrong font** | tier 2 (`pdffonts`) — but it's PREVENTED by tier 3 (the container) |
| a stage declared with no PDF | tier 3, `paper-lint --gate` 🛑 |
| ACM format compliance | **tier 4, and only tier 4** |

---

# 🗺️ Roadmap: what is NOT built

## 1. 🔴 A requirement as a BUILD FAILURE, not a check afterward (the author's idea, 26.08)

Right now almost everything is caught **after** the build. But `acmart` already knows how to fail
the build — it does exactly that on missing CCS concepts (*"CCS concepts are mandatory for papers
over two pages"*). So the mechanism exists, and we're not using it.

**Rung 2 of the ladder instead of rung 3:** there's nothing to check in something that can't even be
built.

| requirement | how to turn it into a build failure |
|---|---|
| **fonts** | `fontspec` + a font by path → file missing → the build fails instead of silently falling back to Computer Modern |
| page limit | `\AtEndDocument` + a check on `\thepage` → `\PackageError` |
| text-block dimensions | the class sets these; catch the fact that they were overridden |
| no page numbers | check `\thepage` in the output |

🔴 **MEASURED on 2026-08-26, not assumed: `fontspec` with `pdflatex` DOES NOT WORK.** A minimal
document, a `pdflatex` run, exit code 1, verbatim from the log:

```
Package: fontspec  Font selection for XeLaTeX and LuaLaTeX
! Fatal Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX.
```

⇒ The whole chain: only `fontspec` can load a font by path → `fontspec` requires XeLaTeX or LuaLaTeX
→ we run `pdflatex` → **the construction requires SWITCHING THE BUILD ENGINE**, not adding a
package. That moves the item from "add a line" to "change the program that builds the paper."

⚠️ **Three unverified things that decide whether the first row is even feasible** (these are
unknowns, not objections): `fontspec` requires XeLaTeX/LuaLaTeX instead of pdflatex · `acmart`
assigns its own fonts and might conflict · whether the TAPS pipeline will even accept a LuaLaTeX
source. Plus a risk: switching engines changes how microtype is handled, and there's no page-count
slack.

**Checked by a cheap spike** — build a copy in scratch, see whether the class fights back and
whether the layout shifts. Do this AFTER the 29.08 submission.

## 2. Mechanical camera-ready compliance — 1 requirement out of ~25 is checked

ACM's instructions list ~25 mechanical requirements. Checked: fonts. The rest — text-block geometry,
9pt/8pt type size, column balance, DOIs on references, captions above tables and below figures,
capitalization, section ordering — **nothing checks any of it**.

**A construction found and verified against source (26.08):**

```
banal -json  +  pdffonts   →   paper.facts.json   →   @eslint/json
(geometry)     (fonts)         (plain JSON)           (the official plugin)
```

- **`banal`** — [kohler/hotcrp/src/banal](https://github.com/kohler/hotcrp/blob/master/src/banal),
  1901 lines of Perl, dependencies are core Perl + `pdftohtml`. Standalone, alive (commits on
  03.08.2026). Gives you `papersize`, `margin`, `bodyfontsize`, `leading`, `columns`, `npages`,
  `reffontsize`. It **doesn't know about fonts by construction** — the words `type3`/`embed` don't
  appear in the file at all.
- **banal does not accept a spec** — the comparison lives in `checkformat.php`, the profile grammar
  is `papersize;pagelimit;columns;textblock;bodyfontsize;bodylineheight`. For ACM ≈
  `letter;;2;18x23.5cm;9`.
- **Why through JSON and not an ESLint language plugin:** `fileType: "binary"` in ESLint is **not
  implemented**, the docs say verbatim — *"should be 'text' (in the future, we will also support
  'binary')"*, and the runtime reads the file unconditionally as UTF-8 (`eslint-helpers.js:1281`),
  irreversibly mangling PDF bytes into U+FFFD. A hack is possible (`parse()` reads the disk itself),
  but it breaks `--fix`, the cache, and `eslint-disable` — there's nowhere to put a directive inside
  a PDF.
- **veraPDF is built the same way** — the one PDF validator with user-defined rules: *"doesn't parse
  PDF documents directly. Instead it processes the machine readable report output"*. Matching the
  architecture of an industrial tool is a sign the construction is right.

**Occupancy checked:** `eslint-plugin-pdf` → E404 · `textlint` accepts its own format but requires
conversion to text first (precedent: `textlint-plugin-pptx`) · `Vale` won't take a custom parser ·
`MegaLinter`/`super-linter`/`reviewdog` are orchestrators, they won't give us a rule registry for our
format.

## 3. Venue constants belong in a card, not in code

Right now `LinLibertine`, `LinBiolinum`, `acmart` are hardcoded into `check-render.sh`. This is
**venue data**, and it belongs in
`.claude/skills/submit-paper/references/venues/<venue>.md`:

```yaml
venue:
  template: acmart
  page_size: letter
  fonts: { text: LinLibertine, title: LinBiolinum }
  textblock: 18x23.5cm
  body_pt: 9
  body_limit: 5
  extra_ref_pages: 2
```

The second consumer of this block is the comparison against `banal`'s output (six numbers). The
first is the page limit, which currently exists in **four copies**, and they have already drifted
apart (`venues/realm.md` says 8, `build-submission.sh` hardcodes 8, `PIPELINE-STATUS` writes "body
8/8," and the build prints 9).

## 4. `check-render.sh` — 244 lines of bash full of greps

The place is right (nothing else reads the build artifacts, and no offline ACM checker exists),
**the form isn't**: no check registry, no config, no severity, thresholds are hardcoded. Bolting 25
more greps onto it is the path we're getting off of. Deal with it together with items 2 and 3.

## 5. Check occupancy BEFORE writing — the rule exists, it's rung 4

Written down twice (05.08, 24.08), and the `sweep-design-space` skill exists. **It was violated
three times overnight on 25/26.08** — meaning prose and a skill don't work, both are rung 4.

**Proposed construction:** a new check-file must carry an `occupancy:` line — what was searched and
why it didn't fit; the linter requires its presence. Same form as `carries:` for sections and
`Cause:` for re-check findings. To be honest: this is rung 3, not 2 — it doesn't stop you from
skipping the search, but it makes **the absence of evidence visible**.

---

# 🧊 FREEZE on the current ad hoc state (the author's decision, 2026-08-26)

Verbatim (translated from Russian): *"mark the current pipeline as shit by rule — don't expand it as
it is, only allow new, proper stuff."*

> **Fixes — yes. New checks — no.**
> A new check goes only in the new form — but **only where the new form already exists.**

Without the second half the rule is incoherent, and I slipped on it that same evening: announced the
freeze and, two messages later, proposed bolting a check onto `paper-lint`.

| check category | new form | where a new one goes |
|---|---|---|
| a single document: markdown, JS | **exists** — ESLint | 🛑 not allowed into the old form |
| an artifact: PDF | **exists** — venue profile + checker | 🛑 not allowed into the old form |
| cross-file, filesystem-shaped | **doesn't exist and isn't expected to** | stays a script — that is the rule's boundary, not a workaround |

**Enforcement:** `paper-lint.mjs` currently has exactly **18** check functions. The "there are 18"
test fails on the nineteenth and forces an answer to "why isn't this in the new form." Small and
readable, unlike a 27-entry debt ledger that would get muted within a day.

🔴 **The order is mandatory: freeze AFTER at least half is in the new form.** Right now it's one
rule out of fifteen. Freezing before the new form becomes more convenient than the old one means
getting a workaround and a dead rule. That has already happened in this repo three times.

---

# 📋 Work queue, cheapest to most expensive

## 1. A marker instead of a blocklist — one line

`paperDirs()` today: `.filter((e) => e.name !== "research" && e.name !== "drafts")`. A hand-written
list of two names; everything else under `papers/` is automatically counted as a paper.

**Measured 2026-08-26:**

| folder | `PIPELINE-STATUS.md` | counted as a paper today |
|---|---|---|
| `agenticdev-2026` `aisec-2026` `compile-rules-2026` | ✅ | ✅ correctly |
| `scored-2026` | — | 🔴 **yes, wrongly** |
| `extension-shell-ifc` | — | 🔴 **yes, wrongly** |
| `research` `drafts` | — | no (on the blocklist) |

**The marker: a paper folder is one that has a `PIPELINE-STATUS.md`.** This has already been our
convention since 22.07 ("every paper carries a PIPELINE-STATUS.md"), the code just doesn't use it.
Self-declaration instead of a list: a new paper enters the checks the day it gets a scorecard.

⚠️ **Do NOT move the three papers into a separate subfolder.** The marker solves the same problem in
one line, while a move breaks every form of reference — when `.claude/pipeline/` was resettled there
were 134 literal ones, and that wasn't even the whole count (paths built from segments, relative
imports, paths inside regexes).

## 2. One build entry point for all papers, not one per paper

**The hole:** `compile-rules` has `repro/build-submission.sh`, which calls `ensure-toolchain.sh`.
**`agenticdev` has no entry point at all** — it's built by hand with `pdflatex`, and nothing
guarantees the fonts except the CI container. That's how the submitted `aisec` went out wrong.

**The fix — generalize the existing script to any paper folder**, instead of giving each one its own
Makefile. It decides how to build from the files present: `paper.tex` exists → `pdflatex`;
`paper.md` exists → the jinja2 pipeline. Three Makefiles would drift apart the same way the four
copies of the page limit and the five copies of the package list already have.

**Don't conflate the layers:**

```
packages and fonts exist   ← the texlive container  or  ensure-toolchain.sh (apt)
the compile cycle          ← latexmk (not in the toolchain yet, add it)
fail if fonts are missing  ← \IfFileExists in paper.tex (done 26.08)
```

`latexmk` replaces **only the middle layer** — it does not install fonts.

**There's then no need to check "does this folder have a Makefile"** — there's one shared entry
point. Nothing to check.

## 3. Remove duplicated constants

| fact | how many copies | where they diverge |
|---|---|---|
| page limit | **4** | `venues/realm.md` 8 · `build-submission.sh` 8 · `PIPELINE-STATUS` "8/8" · the build prints **9** |
| the TeX package list | **5** | `ensure-toolchain.sh` (executable) · `SKILL.md` · `render-paper.harness.mjs` (pins it ✅) · `build-submission.sh` · `PIPELINE-STATUS` |

The canonical source is the venue card (`venues/<venue>.md`, the `<!-- venue-profile -->` block) for
format, and `ensure-toolchain.sh` for packages. Everything else is a pointer.

## 3-ter. Drop the font gate from `check-render.sh` once the rules run in CI

The `pdffonts` block was added to `check-render.sh` on 25.08, and once the judgment moves into rules
it becomes **a second source of truth about the same fonts**. Removing it shrinks the frozen script
rather than extending it, so it does not break the freeze.

⚠️ **But not before the rules are actually running in CI.** Today `check-render.sh` is the only
thing in CI that even looks at `agenticdev-2026` (the `build` job only builds papers that have
`repro/build-submission.sh`, and that's one out of five). Removing it before the replacement is in
place means trading a duplicate for a hole.

## 3-bis. 🔴 Remove the venue-profile duplicate by GENERATING it, not guarding it with an assert

The venue numbers live in two places: `<venue>.yaml` (read by the rules) and `<venue>.tex` (read by
LaTeX itself, which can't do YAML). On 26.08 `texMismatch()` inside `check-geometry.mjs` guarded
against the drift — **the script was torn out on 26.08, along with it**, because the whole thing was
rung 5.

**The assert was the wrong answer from the start.** It guards a duplicate instead of there being no
duplicate. The right form is the same one we arrived at for the PDF facts: **`<venue>.tex` IS
GENERATED from `<venue>.yaml` in the same step that builds the paper**, lives in `_build/`, and
never enters git. Then the drift is unrepresentable, and there's nothing to guard — rung 1, not rung
5.

⚠️ The objection "a generated file goes stale silently" **does not apply** here, and the distinction
matters: what goes stale is a file that's committed and regenerated only occasionally. This one
regenerates on every build, like the PDF facts do. Silent staleness requires that someone be able to
read the OLD copy — and there is nowhere to get one.

**Until this is done, NOBODY guards the duplicate.** Recorded deliberately: the cost is a mismatch
between the preamble guards and the rules; the odds are low — profile edits happen about once per
venue.

## 4. Tools: what's been checked and decided

| | verdict |
|---|---|
| **`eslint-plugin-project-structure`** | **can do** conditional "if A then B" (`enforceExistence`, via a real `fs.existsSync`), and it ships a dummy parser + `files: ["**"]`, so it sees folders with not a single JS file. **But there's no OR semantics** — "Makefile OR justfile" is not expressible. We don't need it after item 2; a candidate for other structural rules |
| **`steiger`** | ❌ dropped — its own README says *"not extendable with more rules"*, plus it's about FSD in JS |
| **an ESLint config inside a paper folder** | ❌ **doesn't work in this repository**: there are **233** configs here, **2** of them ours — the other 231 sit inside `compile-rules-2026/repro/` (other people's repos, pulled in). A nested lookup would pick up every one of them, which is exactly why we run with `--no-config-lookup`. The same result comes from a `files: ["<papers-root>/<paper>/**"]` section in the root config |
| **`banal`** | ✅ adopted, vendored under `vendor/`, called from `extract-pdf-facts.mjs` (measurement only; the ESLint rules do the judging) |
| **`latexmk`** | add it to `ensure-toolchain.sh` |
