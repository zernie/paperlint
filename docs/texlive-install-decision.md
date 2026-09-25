---
title: "Where CI gets TeX Live from: three methods, measurements, what was chosen and why"
created: 2026-09-01
updated: 2026-09-24
tags: [ci, texlive, render-paper, resheno-i-otkloneno, zamery]
---

# What to install TeX with in CI — a measured breakdown

**Why this file exists.** Over one night on 2026-09-01 the method for installing TeX in the
`build` job changed **three times**, each change cost a CI run, and two of the three methods
failed for reasons invisible in the documentation. Without this record, the next attempt would
start from the same first try.

The corpus owner's question that prompted the file: _"write down why we chose one action over
another"_.

> **Where this ended up (2026-09-24).** Method 5 below won, and it is no longer a CI script: it is
> `paperlint toolchain` (`src/toolchain.ts`), the command users run and the `build-e2e` job runs on Linux
> and macOS. The package list and the file contract (`REQUIRED_FILES` in the deleted
> `ensure-toolchain.sh`) moved into the venue profiles — each `skills/submit-paper/references/venues/*.jsonc`
> declares a `tex` block of CTAN package → proof files, and `tex-base.jsonc` the set every paper
> gets. This file stays as the record of why tlmgr and not apt or a container; the scripts it names
> (`ensure-toolchain.sh`, `ci-install-texlive.sh`) were deleted in the same change.

---

## Summary

| method                                      | size        | cold install              | cacheable | verdict             |
| ------------------------------------------- | ----------- | ------------------------- | --------- | ------------------- |
| `texlive/texlive:latest` container          | **2700 MB** | 2 m 01 s **every** run    | ❌ never  | 🟡 works, expensive |
| `texlive/texlive:latest-medium` container   | 940 MB      | hangs 14 min              | ❌        | 🔴 rejected         |
| apt + `awalsh128/cache-apt-pkgs-action`     | 2100 MB     | installed **zero**        | ✅        | 🔴 rejected         |
| tlmgr + `teatimeguest/setup-texlive-action` | ~250 MB     | —                         | ✅        | 🔴 **blocked**      |
| tlmgr + `actions/cache` (own script)        | ~250 MB     | 77 s + follow-up installs | ✅        | 🟢 candidate        |

---

## 1. `texlive/texlive:latest` container — what worked

**How:** `container: image: texlive/texlive:latest` on the job.

**Cost, measured 2026-09-01** (run `33455680908`): the "Initialize containers" step —
**2 minutes 01 seconds**, and that **on every run**. GitHub does **not cache the job container
image** under any circumstances; a homemade cache via `docker save`/`load` for a multi-gigabyte
image costs more than the pool time it would replace.

Of that 2.7 GB, our papers touch **47 MB of fonts** — the runtime subset of three families,
without `doc/` and `source/` (issue #37; this line said "71 MB" until 2026-09-24, which counted the
documentation and sources too):

| family              | size, with doc/ and source/ | what it's for          |
| ------------------- | --------------------------- | ---------------------- |
| libertine           | 29 MB                       | acmart's main typeface |
| inconsolata (`zi4`) | 23 MB                       | monospace              |
| newtx               | 19 MB                       | math                   |

So overhead is ~98%. A conscious tradeoff, not an unnoticed one.

## 2. `latest-medium` — rejected 2026-09-01

**Idea:** a 940 MB image instead of 2700, with the gap filled in by `tlmgr`.

**What happened:** the follow-up class-install step hung for **14 minutes** (reaching out to
CTAN), got cut off by the job's bond, the job came back `cancelled`, and the gate never ran at
all. The trade of "save 2 minutes of pool time" cost fifteen minutes and an unrun gate.

**The lesson isn't about the image, it's about bonds:** any step that reaches the network needs
its **own** `timeout-minutes`. A job-level bond doesn't distinguish "the step is stuck" from "the
set is slow" and hands the whole job over to the hang.

## 3. apt + `awalsh128/cache-apt-pkgs-action` — rejected, and rejected QUIETLY

**Idea:** GitHub caches `.deb` files, unlike a container image. Install the nine packages from
`PACKAGES` in `ensure-toolchain.sh`.

**What happened** (run `33456559102`, job `99697684739`):

```
E: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/pool/main/o/openjdk-21/
   openjdk-21-jre-headless_21.0.11+10-1~24.04.2_amd64.deb  404  Not Found
E: Unable to fetch some archives
Caching 0 installed packages...
Skipped all manifest write. No packages to install.
##[end-action …;outcome=success;conclusion=success]
```

`texlive-latex-extra` pulls in JRE via its dependencies, its version in the runner's index had
gone stale, the mirror returned 404 — and apt installed **nothing**.

🔴 **The main point here isn't the 404, it's that the step was GREEN.** The action reported
`outcome=success`, cached 32 KB, and moved on. Only a separate `kpsewhich` check in the next step
caught it, printing all 14 required files as missing. This is the third instance in the knowledge
base of the rule **"`exit=0` and empty output is NOT 'clean'"**, and it's also the reason the
post-install check lives in its own separate step: **you cannot trust the installer**.

**The second reason for rejecting it, independent of the 404 — granularity.** apt's minimal unit
is the distribution package: for three font styles it pulls in the **whole** of
`texlive-fonts-extra`.

|             |                                      |
| ----------- | ------------------------------------ |
| needed      | 47 MB (three families, runtime; #37) |
| installed   | **1691 MB** (`texlive-fonts-extra`)  |
| waste share | **97%**                              |

apt can't go finer than that — in Debian these three families aren't split into separate
packages.

⚠️ **A side effect: a stale note surfaced in our own file.** While justifying the move, I quoted a
comment from `ensure-toolchain.sh`: "172 MB fetched, 482 MB on disk." That measurement is dated
17.08, and `texlive-fonts-extra` was added to the list on **24.08** — meaning the comment predates
half the set. Remeasured: **2.1 GB**. A comment in our own file is not a verified measurement.

## 4. `teatimeguest/setup-texlive-action` — BLOCKED, not rejected

**Idea:** the right class of tool. Installs the **upstream** TeX Live from a list of CTAN
packages, cache built in. The LaTeX ecosystem's standard answer to "I need three fonts, not two
gigabytes."

**What happened** (run `33457399377`): the job died at the **"Set up job"** step in 2 seconds.

```
Prepare all required actions
Getting action download info
##[error]Repository access blocked
```

The account has a **third-party GitHub Actions allowlist** turned on, and this action isn't on
it. Confirmed alongside it: `awalsh128/cache-apt-pkgs-action@v1` and `zernie/vigiles@v20.0.0` in
the same file start up normally.

🔴 **Fixed NOT by code:** Settings → Actions → General → Allow specified actions. Not reachable
from the session — checked, not assumed:

| channel                       | result                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GH_TOKEN` in the environment | present, and valid (`GET /user` → `zernie`)                                                                                                    |
| bare `curl` to api.github.com | **403 on everything**, including `GET /repos/<owner>/<private-repo>`: `Access to this GitHub Actions path is not permitted through this proxy` |
| GitHub MCP                    | the only reachable channel, and it has **no** repository-settings tool                                                                         |

**Status: not rejected, unreachable.** If the action ever gets allowlisted, it's the best option,
and the code for it sits in the history of the `claude/article-deadline-check-0unptg` branch
(commit `be6f33ec8`), restorable in one commit.

### Why comparing the actions was, in itself, the wrong move

I picked `cache-apt-pkgs-action` **first** because I searched for "how to cache an install," and a
generic tool for a generic query turned up immediately. The right question was different:
**"what does this ecosystem actually use to install TeX specifically."** LaTeX-specific actions
exist, and there are three of them:

| action                                  | what it does                                    | why not this one                                                                       |
| --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`teatimeguest/setup-texlive-action`** | upstream TL from a package list, cache built in | ✅ best on the merits, blocked by the allowlist                                        |
| `xu-cheng/latex-action`                 | the most popular of all                         | wraps the same `texlive/texlive` **image** underneath — same pool cost, solves nothing |
| `zauguin/install-texlive`               | same idea as the first                          | less maintained, no advantage                                                          |

**Lesson:** before reaching for a general-purpose tool, ask whether a specialized one exists for
this exact subject. The general one gives you its own domain's granularity (apt → distribution
package), the specialized one gives you its own (tlmgr → CTAN package), and here the difference
is **twelvefold** by weight.

## 5. tlmgr + `actions/cache` with our own script — candidate

**Idea:** bypass the allowlist entirely. `actions/cache` is first-party (`actions/*`), allowed
under any "Allow select actions" policy, and we **already** use it to cache TeXtidote's
224-megabyte jar.

**Measurement, run LOCALLY in the session container on 2026-09-01** (not on CI — that's the whole
point):

| step                                 | result                     |
| ------------------------------------ | -------------------------- |
| `install-tl-unx.tar.gz`              | 5.3 MB                     |
| `scheme-basic` per profile           | **147 MB, 65 seconds**     |
| `tlmgr install` 19 packages          | +75 MB, 12 seconds         |
| **total before the first build**     | **222 MB, 77 seconds**     |
| binary directory                     | `texlive/bin/x86_64-linux` |
| `kpsewhich` against `REQUIRED_FILES` | **14 of 14** ✅            |

⚠️ **`--cacert` is mandatory:** in this container `curl` to CTAN fails certificate verification
(the proxy), fixed with `CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt`. Not needed on a GitHub runner —
written down so the next spike doesn't lose ten minutes to it.

### 🔴 And this is where `kpsewhich` lied — and the build didn't

14 of 14 files resolved, and `pdflatex` failed on the real paper:

```
! LaTeX Error: File `xstring.sty' not found.
!  ==> Fatal error occurred, no output PDF file produced!
```

`xstring` is pulled in by `acmart`, and it's in neither the package list nor `REQUIRED_FILES`.
What followed was the knowledge base's familiar **endless queue**: `xstring` → `everyshi` →
`hyperxmp` → `ncctools` → `cmap` → `float` → `comment` → `upquote` → `doclicense` → …

**This is exactly the case that `CLAUDE.md`'s "install by COLLECTION, not by name" rule is for.**
But that same rule also names the reason: _"names surface one at a time, and each one costs a full
CI run (~25 min of quota)"_.

🔑 **Here that reason disappears.** The queue is run **locally**, in a loop of "build → pull out
the missing file → `tlmgr search --global --file` → install → repeat," and it costs **zero
minutes of quota**. What changes is not the fact of the queue, but its cost — and the conclusion
"names can't be listed one at a time" rested precisely on that cost.

**The rule this implies, and it's broader than TeX:** before accepting "must list only in bulk,
never one at a time," check **whether the iteration itself can be made free.** An expensive
iteration is a property of where it's run, not a property of the task.

⚠️ **The honest cost of an exact list:** a new paper pulling in a new package will break CI with a
missing filename. That's acceptable, because the `REQUIRED_FILES` check prints the fix straight
into the log, and because the alternative — pulling in the whole of `collection-latexextra` —
means going back to the same hundreds of megabytes of waste this move was meant to escape.

---

## What to check on the next attempt

1. **Build a real paper, not just `kpsewhich`.** Filename resolution and a successful build are
   **different claims**, and here the second turned out to be stricter than the first by nine
   packages.
2. **Watch for `Class acmart Warning` in `paper.log`.** Missing libertine/zi4/newtxmath does
   **not** crash acmart — it silently falls back to Computer Modern, the PDF builds and looks
   normal, but is typeset in the wrong font, and a different metric gives a different pagination.
3. **After installing, check the result, not the installer's exit code.** See §3.
4. **Run iterations locally.** The spike above cost zero minutes of quota and caught three errors,
   each of which would have cost a CI run.
