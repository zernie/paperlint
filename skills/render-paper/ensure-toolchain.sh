#!/usr/bin/env bash
# The LaTeX toolchain, made present instead of described.
#
# ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
# The knowledge "a fresh container has no TeX Live, here is the apt line" was written
# down THREE times — `render-paper/SKILL.md` §Toolchain, the `NEED_APT` preflight in
# `compile-rules-2026/repro/build-submission.sh`, and the setup block in HANDOFF.md —
# and executed by a human every single time. That is the repo's own thesis pointed at
# itself: prose that describes a mechanism is not the mechanism.
#
# 🔴 And three copies had already drifted into two DIFFERENT package lists:
#
#   render-paper      texlive-latex-recommended fonts-recommended latex-extra publishers
#   build-submission  texlive-latex-base latex-extra fonts-recommended bibtex-extra poppler-utils
#
# render-paper's list has no `poppler-utils`, so `pdfinfo` is missing and the page-count
# gate cannot run; build-submission's has no `texlive-publishers`, so `acmart.cls` is
# missing and an ACM paper does not compile at all. Each list is correct for the file it
# sits in and wrong for the other — the same defect shape as two parsers for one field.
# This is the union, in ONE place, and both callers now ask for it rather than restate it.
#
# ── THE DECISION THIS IMPLEMENTS ────────────────────────────────────────────────
# 2026-08-14 (`#134`) enumerated four codification forms and said to pick by context,
# naming this home explicitly: *"a skill's script — if this is part of an already existing
# pipeline (as here: `render-paper` was already a suitable home, just not a complete one)"*
# (the quoted decision was written in Russian; translated here).
# It also set the search rule that points here: look for a home BY CLASS OF ACTION, and
# "TeX Live is missing" is a wider class than "this one paper". So the install does not
# belong in a per-paper build script.
#
# ── WHY IT IS LAZY, NOT A SessionStart HOOK ─────────────────────────────────────
# Measured 2026-08-17: 172 MB fetched, 482 MB on disk, 31 packages.
# 🔴 STALE — that measurement predates texlive-fonts-extra, which was added to the list on
# 2026-08-24, i.e. AFTER it. Re-measured 2026-09-01 via apt-cache Installed-Size over the
# nine packages below: 2.1 GB on disk, of which texlive-fonts-extra alone is 1.69 GB (80%).
# The old number was quoted as fact in .github/workflows/paper-gates.yml and was wrong by 4x.
# Lesson, not bookkeeping: a size comment goes stale the moment someone appends to the list,
# and nothing here notices — the list and its measurement are two files' worth of coupling
# living one line apart. A SessionStart hook
# would pay that in every session; papers are built in a small fraction of them. Here the
# cost lands only on a session that actually renders.
#
# ── WHY IT REFUSES OUTSIDE A CONTAINER ──────────────────────────────────────────
# Installing half a gigabyte of system packages unasked is fine in a disposable container
# and rude on someone's laptop. So: install only when running as root AND apt-get exists
# (i.e. the ephemeral Linux box); everywhere else print the exact command and exit 1, which
# is the behaviour the callers had before and still the right one on macOS.
#
# Usage:  bash .claude/skills/render-paper/ensure-toolchain.sh            # binaries only
#         bash .claude/skills/render-paper/ensure-toolchain.sh --acm      # + acmart.cls
#         AUTO_INSTALL_TEX=0 bash …                                       # never install, just report
set -uo pipefail

# The union of what any paper in this repo has needed. Kept as ONE list on purpose: a
# second list is how the two copies above drifted apart.
PACKAGES=(
  texlive-latex-base        # pdflatex
  texlive-latex-recommended
  texlive-latex-extra
  texlive-fonts-recommended
  texlive-bibtex-extra      # bibtex styles beyond the base set
  texlive-publishers        # acmart.cls — ACM venues
  # 🔴 The two below were added 2026-08-24 after a camera-ready build measured them missing.
  # Neither announces itself in the PDF, and that is the whole point of listing them here.
  texlive-fonts-extra       # libertine, inconsolata (zi4), newtx — the fonts acmart actually wants.
                            # WITHOUT it acmart does NOT fail: it prints "You do not have the
                            # libertine package installed" and silently falls back to Computer
                            # Modern, so the PDF compiles clean and is typeset in the wrong fonts.
                            # Correct fonts also change metrics — on agenticdev-2026 the switch
                            # surfaced an overfull box that the CM build did not have.
  # 🔴 Added 2026-09-17: `eslint-rules/paper-texcount.harness.mjs` was failing in a fresh
  # container, and its own failure named the remedy — "installed together with TeX Live:
  # texlive-extra-utils". The knowledge existed, it just did not live in an executable file.
  texlive-extra-utils       # texcount — the word count by which a paper's length is measured
  texlive-plain-generic     # binhex.tex, pulled in by newtx. Missing it is the opposite failure:
                            # a HARD "! LaTeX Error: File `binhex.tex' not found" + emergency stop,
                            # i.e. installing texlive-fonts-extra alone BREAKS a build that worked.
                            # Install the pair, never just the first.
  poppler-utils             # pdfinfo, the page-count authority
)
APT_LINE="apt-get install -y --no-install-recommends ${PACKAGES[*]}"

# 🔴 THE CONTRACT IS THIS LIST OF FILES, NOT THE PACKAGE NAMES ABOVE (2026-09-01).
# Locally TeX is installed by apt (the list above), in CI by upstream tlmgr under CTAN names
# (.github/workflows/paper-gates.yml, the `build` job). The names do not match and cannot match:
# one texlive-fonts-extra is libertine + inconsolata + newtx for tlmgr, one texlive-publishers is
# acmart. They cannot be merged into a single list.
#
# What can be merged is the RESULT: both paths must lead to the same set of files.
# That is why the list below is read by BOTH — by this script and by the workflow (with the same sed
# parse) — and is the only place where it is declared. The installs are allowed to drift apart;
# drifting apart unnoticed is not allowed.
#
# What lies here and why exactly this:
#   libertine/zi4/newtxmath — acmart.cls:776-784 checks ALL THREE and, if ANY of them is missing,
#     sets \@ACM@newfontsfalse and silently falls back to Computer Modern: the PDF compiles, looks
#     normal, is typeset in the wrong font, and a different metric gives a different pagination.
#   totpages/environ — they are pulled in by acmart ITSELF, not by the paper, so grepping for
#     \usepackage in paper.tex does not find them. Both surfaced one at a time, each at the cost of
#     a full CI run.
#   balance — balancing the columns of the last page, an ACM requirement (the pdf/balance rule).
# 🔴 A THIRD DICTIONARY OF THE SAME SET — the CTAN names for tlmgr (2026-09-01).
# PACKAGES above are apt names (local development on Debian/Ubuntu).
# CTAN_PACKAGES below are tlmgr names (CI, upstream TeX Live).
# REQUIRED_FILES is the contract BOTH of them must satisfy.
#
# Why not one list: apt's minimal unit is a distribution package, and for the sake of three font
# families (71 MB) it pulls in the whole of texlive-fonts-extra (1691 MB, 96% junk).
# tlmgr's unit is a CTAN package. Measured 2026-09-01: the apt path 2100 MB, the tlmgr path 230 MB.
# The analysis of all three approaches with run numbers is in ci-tex-toolchain-decision.md next door.
#
# 🔴 THE LIST WAS DERIVED BY BUILDING, NOT BY READING \usepackage. The nine packages below (xstring …
# doclicense) would not be named by any cross-check against the paper's source: acmart itself pulls
# them in. They were found by the loop "build → pull out the missing file → tlmgr search --file →
# install", run LOCALLY. That matters: CLAUDE.md says "install by collections, not by names", and the
# reason given there is honest — "every name costs a full CI run (~25 min of quota)".
# The local loop costs ZERO, so an exact list is again better than a collection.
#
# ⚠️ And the trap the loop stumbled on: a missing font gives a DIFFERENT shape of error —
# not "File `x.sty' not found" but "Font \aclhv=phvb not loadable: Metric (TFM) file not
# found". Both have to be grepped for.
CTAN_PACKAGES=(
  scheme-basic              # pdflatex, kpsewhich, bibtex — the base
  latex latex-bin bibtex

  # --- ACM (agenticdev-2026, acmart) ---
  acmart
  libertine inconsolata newtx   # 🔴 ALL THREE: acmart.cls:776-784 checks each of them and, if ANY
                                # is missing, silently falls back to Computer Modern
  totpages environ preprint     # preprint carries balance.sty
  seqsplit xurl enumitem booktabs hyperref geometry pgf
  caption natbib microtype xcolor

  # --- what acmart ITSELF pulls in (found by building, 2026-09-01) ---
  xstring everyshi hyperxmp ncctools cmap float comment upquote doclicense

  # --- ACL (compile-rules-2026, acl.sty) ---
  lineno
  psnfss helvetic times courier symbol zapfding   # Helvetica/Times: without them
                                # "Font ptmr8t not loadable", the PDF does not build at all.
                                # 🔴 `urw-base35` STOOD HERE AND WAS INVENTED: tlmgr answers
                                # "package urw-base35 not present in repository".
                                # A local run on 01.09 caught it; in CI it would have cost
                                # a run. The five names above are enough — the ACL paper is
                                # built and checked by its embedded fonts (Nimbus).

  # 🔴 cm-super — IT CATCHES SILENT RASTERIZATION, added 2026-09-01 on a finding of the pdf/fonts
  # gate. Without it the ACL paper built WITHOUT ERRORS and contained the font "F277 · Type 3" — a
  # bitmap one. pdflatex does not complain: having failed to find a Type 1 for sftt (CM Sans
  # Typewriter, that is \texttt inside the sans context of the ACL template), it silently generates
  # a bitmap. The PDF looks built, and both ACM and ACL reject such a PDF.
  # Measured: before — 1 Type 3 font, after — 0, replaced by sftt0800.pfb from cm-super.
  # lmodern was tried alongside and is NOT the reason for the fix: the names in the PDF became SFTT*,
  # not LMTT*, that is, cm-super is what worked. One package goes into the list, not both at random.
  cm-super

  # --- the checking tools ---
  checkcites
  # 🔴 texcount — ADDED 2026-09-17 ON A CONSUMER'S RED CI, and the hole was invisible.
  # `REQUIRED_BINS` below requires texcount, and the apt list above carries it
  # (`texlive-extra-utils`) — while this one, the CTAN list, did not. So the tool arrived by
  # exactly one of the two paths, and which one fired was decided not by code but by the CACHE:
  # as long as `~/texlive` came from the GitHub Actions cache, the tree already contained texcount
  # and the step was green. On the first cache miss a cold install built TeX Live without it, and
  # `repro/build-submission.sh` failed with "missing: texcount".
  # 🔴 The lesson is not about a package name: TWO LISTS OF ONE TOOL drift apart silently, and the
  # divergence shows up only on an unlucky day. The same class as `urw-base35` and `cm-super` above
  # — both were also found by a run, not by reading.
  texcount
)

REQUIRED_FILES=(
  acmart.cls
  seqsplit.sty
  xurl.sty
  enumitem.sty
  booktabs.sty
  hyperref.sty
  geometry.sty
  tikz.sty
  libertine.sty
  zi4.sty
  newtxmath.sty
  balance.sty
  totpages.sty
  environ.sty
)


# 🔴 ONE list, because there used to be TWO copies — here and in the post-install check — and the
# file itself warns a paragraph above: "a second list is how the two copies above drifted apart".
# Adding `texcount` to one of them would have been exactly that divergence.
# 🔴 AFTER THE COLON IS THE SUPPLIER, and it is load-bearing. The checks below look along `PATH` and
# therefore do not tell suppliers apart — that is enough to say "the tool is absent" and NOT enough
# to say "the TeX Live install succeeded": `pdfinfo` arrives from poppler via apt, and requiring it
# in the TeX tree would be a false positive.
# Measured 2026-09-17: `texcount` was absent from the CTAN list, the installer checked only
# REQUIRED_FILES (`.cls`/`.sty`, looked up by `kpsewhich`), a binary is not looked up as a file — and
# the installer reported "✅ TeX Live is ready" over a tree without it. What went red was the paper
# build two steps later, and the consumer looked like the guilty party.
#   tex — must end up in the TeX Live tree after the install; CTAN_PACKAGES is responsible for that
#   apt — arrives as a separate system package, it must not be looked for in the TeX tree
REQUIRED_BINS=(pdflatex:tex bibtex:tex pdfinfo:apt pdffonts:apt texcount:tex)

# The name without the marker — for checks along `PATH`, to which the supplier is irrelevant.
bin_name() { printf '%s' "${1%%:*}"; }

want_acm=0
want_textidote=0
for arg in "$@"; do
  case "$arg" in
    --acm) want_acm=1 ;;
    --textidote) want_textidote=1 ;;
  esac
done

missing=()
for entry in "${REQUIRED_BINS[@]}"; do
  bin="$(bin_name "$entry")"
  command -v "$bin" >/dev/null || missing+=("$bin")
done
if [ "$want_acm" = 1 ] && command -v kpsewhich >/dev/null; then
  kpsewhich acmart.cls >/dev/null 2>&1 || missing+=("acmart.cls")
fi

if [ ${#missing[@]} -eq 0 ]; then
  echo "✓ LaTeX toolchain present (pdflatex, bibtex, pdfinfo$([ "$want_acm" = 1 ] && echo ", acmart.cls"))"
  exit 0
fi

echo "missing: ${missing[*]}"

if [ "${AUTO_INSTALL_TEX:-1}" = "0" ]; then
  echo "AUTO_INSTALL_TEX=0 — not installing. Command: $APT_LINE"
  exit 1
fi

# The two conditions together mean "disposable Linux container", which is the only place
# a half-gigabyte unattended install is the polite choice.
if [ "$(id -u)" != "0" ] || ! command -v apt-get >/dev/null; then
  echo "Not a root apt container (uid $(id -u)) — not installing anything."
  echo "Install it yourself with:  $APT_LINE"
  echo "On macOS: brew install --cask mactex-no-gui  (or basictex + tlmgr install for the rest)"
  exit 1
fi

echo "Installing TeX Live — ~172 MB download, ~482 MB on disk, about a minute."
echo "  $APT_LINE"
# `update` is cheap when the lists are warm and is the difference between a working
# install and a 404 on a container whose lists are stale.
apt-get update -qq >/dev/null 2>&1 || true
# shellcheck disable=SC2086
if ! apt-get install -y --no-install-recommends ${PACKAGES[*]} >/tmp/ensure-toolchain.log 2>&1; then
  echo "🔴 apt-get failed. Last lines:"
  tail -15 /tmp/ensure-toolchain.log
  exit 1
fi

# 🔴 Verify what we came for, rather than trusting apt's exit code. A package set that
# installs cleanly and still leaves `pdfinfo` absent is exactly the silent half-success
# this script exists to end.
still=()
for entry in "${REQUIRED_BINS[@]}"; do
  bin="$(bin_name "$entry")"
  command -v "$bin" >/dev/null || still+=("$bin")
done
if [ "$want_acm" = 1 ] && ! kpsewhich acmart.cls >/dev/null 2>&1; then
  still+=("acmart.cls")
fi
if [ ${#still[@]} -gt 0 ]; then
  echo "🔴 apt reported success but these are STILL missing: ${still[*]}"
  echo "   The package list in this script is wrong for this base image — fix it here, not in a caller."
  exit 1
fi

echo "✓ LaTeX toolchain installed and verified"

# ─────────────────────────────────────────────────────────────────────────────
# textidote — NOT an apt package, which is why it stands apart rather than as a line in PACKAGES.
#
# 🔴 THE ACCEPTANCE CHECK HERE IS DIFFERENT, AND THAT IS THE MAIN POINT. For a binary `command -v`
# will do; for a jar file it is meaningless — the presence of the file says nothing about whether it
# will run. So the check RUNS it, exactly as the rule demands: "acceptance is not 'it installed' but
# 'it RUNS'". A jar downloaded broken (a truncated transfer, an error page instead of a file) lies on
# disk and looks installed; only an attempt to execute it tells the difference.
#
# ⚠️ Java is needed. We do NOT install it here: `default-jre` pulls in hundreds more megabytes, and
# the absence of Java is a state to speak about, not to cure silently.
if [ "$want_textidote" = 1 ]; then
  jar="${TEXTIDOTE_JAR:-/opt/textidote/textidote.jar}"
  if ! command -v java >/dev/null; then
    echo "🔴 textidote requires Java, and there is none. Install it with: apt-get install -y default-jre"
    exit 1
  fi
  if ! java -jar "$jar" --version >/dev/null 2>&1; then
    echo "Installing textidote — ~8 MB, a single file."
    mkdir -p "$(dirname "$jar")"
    if ! curl -sSLf -o "$jar" https://github.com/sylvainhalle/textidote/releases/download/v0.9/textidote.jar; then
      echo "🔴 failed to download textidote.jar"
      exit 1
    fi
  fi
  # We check AFTER the download, and the same way: by running it. Curl may have returned 200 and a page.
  if ! java -jar "$jar" --version >/dev/null 2>&1; then
    echo "🔴 textidote.jar is in place ($jar), but it DOES NOT RUN — the file is broken or it is not a jar"
    exit 1
  fi
  echo "✓ textidote is installed and runs ($jar)"
  echo "  the harness needs this variable:  export TEXTIDOTE_JAR=$jar"
fi
