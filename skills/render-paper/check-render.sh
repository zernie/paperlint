#!/usr/bin/env bash
# check-render.sh — mechanical render-quality gate for a LaTeX paper.
#
# WHY: eyeballing page 1-2 misses layout defects on later pages. LaTeX already
# reports them in the .log ("Overfull \hbox (12.3pt too wide) at lines X--Y").
# This compiles the paper and FAILS on visible layout defects, so "renders fine"
# is a checked fact, not a hope. Spirit: prose isn't policy — compile the check.
#
# Usage:   check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]
#   NO_COMPILE=1 check-render.sh <dir> ...   # parse an existing .log, don't recompile
#
# Exit: 0 = clean; 1 = layout/ref defects found; 2 = usage/compile/log error.
# Threshold: hbox overfulls >= threshold_pt are "visible → must fix"; smaller ones
# are counted but not fatal (sub-point overfulls are usually invisible).

set -uo pipefail

# ── WHERE `paper-guards.tex` LIVES AND WHAT HAPPENS IF IT IS NOT FOUND ────────
# Papers pull in the reference guard with one line, `\input{paper-guards}`. The path is NOT
# spelled out there — LaTeX looks the file up via `TEXINPUTS`, and the caller must set that variable.
#
# 🔴 THE FAILURE MODE HERE IS SILENT, AND THE WHOLE FUNCTION EXISTS FOR THAT. An `\input` that is
# not found does NOT fail the build: LaTeX writes `File \`paper-guards.tex' not found` into the log
# and carries on. The PDF comes out, looks fine, and simply no longer contains the dangling-reference
# check — that is, the defect the guard was set up for comes back together with a green report.
# A broken `import` in JS fails loudly; here we have to fail on our own.
#
# A ladder of THREE candidates, because the directory MOVED (12.09): `venues/` is now carried by the
# `paperlint` package, and at the consumer's old location there is a symlink into it.
# The order "the declared package → a sibling inside the package → the consumer's directory" is
# deliberate: the package must win silently. It only gets loud when there is NOT A SINGLE ONE.
# 🔴 THE SCRIPT'S OWN DIRECTORY — TAKEN ABSOLUTE AND BEFORE ANY `cd` (12.09.2026, evening).
# Found by a RED HARNESS, `gates.harness.mjs`, not by proofreading, and it is my own regression from
# the same day: below, the script does `cd "$DIR"` into the paper directory, and the venues resolve
# stood AFTER that `cd`. So `git rev-parse --show-toplevel` was already running in the fixture's
# temporary directory, the root was not found, and the build honestly stopped — on a test that had
# been passing until then.
#
# ⚠️ The previous version was wrong THE SAME WAY, but silently: it did not check the result and built
# the PDF without the reference guard. That is, going red is not a new breakage but a manifestation
# of an old one; still, a test that was green yesterday and is red today is mine to fix.
#
# The neighbouring `build.sh` already carries this same lesson in a comment ("The script directory is
# taken ONCE and ABSOLUTE, before cd") — CI failed on it there on 30.08. A second instance of the same
# class in a file right next door.
SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

resolve_venues() {
  local root pkg
  # Three sources for the root, from the most explicit to the most reliable. The last one is the
  # SCRIPT's location (`.claude/skills/render-paper/` ⇒ three levels up), and it is the only one that
  # depends neither on the current directory nor on whether the caller sits inside a git tree.
  # ⚠️ THE PARENTHESES ARE MANDATORY, and the harness caught this a minute after I wrote the line
  # without them. In bash `A || B && C` parses as `(A || B) && C`, so on a SUCCESSFUL `git rev-parse`
  # the `pwd` ran as well, and the substitution returned TWO lines — the repository root plus the
  # current directory. By hand from a directory outside git this did not reproduce: there git failed,
  # and only one branch ran.
  # ⚠️ THE LAST RUNG SEARCHES, IT DOES NOT COUNT LEVELS. `cd "$SELF_DIR/../../.."` used to stand here
  # — correct for `.claude/skills/render-paper/` (three levels to the root) and silently wrong after
  # the skill moved into the package, where it lies in `skills/render-paper/` (two): the climb
  # overshot ABOVE the repository, and rung 2 looked for venues in someone else's directory. Climbing
  # up to the directory that holds `.claude` does not depend on the depth.
  local probe="$SELF_DIR" fallback=""
  while [ "$probe" != "/" ]; do
    if [ -d "$probe/.claude" ]; then fallback="$probe"; break; fi
    probe=$(dirname "$probe")
  done
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$fallback")}"

  # 1) the package, if it already carries venues/ (after step 5)
  pkg=$(node -e 'try{process.stdout.write(require.resolve("paperlint/venues/paper-guards.tex"))}catch{}' 2>/dev/null || true)
  if [ -n "$pkg" ] && [ -f "$pkg" ]; then
    dirname "$pkg"
    return 0
  fi

  # 2) THE SIBLING SKILL, from THIS script's directory. Added 12.09 together with the move of
  # `submit-paper` into the package, and it is the only one of the three that works in BOTH worlds at
  # once:
  #   • package checkout   `skills/render-paper/..` → `skills/submit-paper/references/venues`
  #   • consumer           `.claude/skills/render-paper/..` → `.claude/skills/submit-paper/...`
  #     (both directories are symlinks into the package, `-f` goes through them, and `cd`+`pwd`
  #     leaves the logical path)
  # Rung 1 depends on cwd (`node -e` resolves from the current directory), rung 3 depends on the
  # consumer's root having been found at all. This one depends on neither — exactly the anchor whose
  # absence had `gates.harness.mjs` red on 12.09.
  local sibling="$SELF_DIR/../submit-paper/references/venues"
  if [ -f "$sibling/paper-guards.tex" ]; then
    (cd "$sibling" && pwd)
    return 0
  fi

  # 3) the skill directory in the consumer — for a consumer that mounted the skills differently
  local local_dir="$root/.claude/skills/submit-paper/references/venues"
  if [ -f "$local_dir/paper-guards.tex" ]; then
    printf '%s\n' "$local_dir"
    return 0
  fi

  return 1
}

# A separate mode so that the resolve can be CHECKED and not merely executed: without it the only
# way to learn where the script looks is to build the whole paper.
if [ "${1:-}" = "--print-venues" ]; then
  if VD=$(resolve_venues); then
    printf '%s\n' "$VD"
    exit 0
  fi
  echo "✗ paper-guards.tex not found: not under the package name paperlint, not beside the script" >&2
  echo "  (skills/submit-paper/references/venues), not at the consumer (.claude/skills/submit-paper/references/venues)." >&2
  echo "  Building the paper without it is not allowed: \\input{paper-guards} will not fail, it will vanish silently," >&2
  echo "  and the PDF will be built WITHOUT the check for dangling \\ref and \\cite." >&2
  exit 2
fi

DIR="${1:?usage: check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]}"
BASE="${2:-paper}"
THRESH="${3:-5}"

cd "$DIR" || { echo "FAIL: cannot cd $DIR"; exit 2; }
LOG="$BASE.log"

# 🔴 THE CONDITION `-f "$BASE.tex"` WAS ADDED ON 26.08 — without it the branch "no log → exit 2"
# became UNREACHABLE, and that is my own regression from the same day. The final pass is invoked as
# `pdflatex -jobname="$BASE" '\input{...}'`, and that form creates `$BASE.log` EVEN when there is no
# source: the script found a log, reached the common `exit 1` and reported "FAIL: fix the findings"
# instead of the honest "no log, the build was never run".
#
# The measurement that isolates the cause (a directory without `paper.tex`):
#   version before 22642552 → exit 2, only texput.log on disk
#   version after           → exit 1, paper.log AND texput.log on disk
# The difference is exactly `paper.log`, which my third pass writes.
if [ "${NO_COMPILE:-0}" != "1" ] && [ -f "$BASE.tex" ]; then
  # Two passes: overfull boxes surface on every pass; a second pass settles refs
  # so Reference/Citation-undefined warnings are accurate.
  # 🔴 TEXINPUTS is mandatory, and that was found by a crash on 26.08. Papers pull in their venue's
  # numbers via `\input{<venue>}`, and the file lies in `.claude/skills/submit-paper/references/venues/`.
  # Without that path the build fails with `File \`agenticdev.tex' not found` — and the `|| true`
  # below swallows it, after which the script reads a log of UNKNOWN origin and reports on it. That
  # is, compiling this paper here silently did not work, and it only became visible once a pass
  # WITHOUT `|| true` appeared.
  if ! VENUES_DIR=$(resolve_venues); then
    echo "✗ paper-guards.tex not found — the build is stopped BEFORE pdflatex." >&2
    echo "  Otherwise \\input{paper-guards} vanishes silently and the PDF comes out without the reference check." >&2
    exit 2
  fi
  export TEXINPUTS="${VENUES_DIR}:${TEXINPUTS:-}"
  # The second half: ask TeX itself whether it sees the file by that path. `resolve_venues` checked
  # that the file is present on disk; `kpsewhich` checks that it is visible EXACTLY THE WAY `\input`
  # will look for it — that is, taking TEXINPUTS, the ls-R cache and permissions into account.
  if ! kpsewhich paper-guards.tex >/dev/null 2>&1; then
    echo "✗ the directory was found ($VENUES_DIR), but kpsewhich does not see paper-guards.tex — TEXINPUTS did not take effect." >&2
    exit 2
  fi
  pdflatex -interaction=nonstopmode "$BASE.tex" >/dev/null 2>&1 || true
  pdflatex -interaction=nonstopmode "$BASE.tex" >/dev/null 2>&1 || true
  # 🔴 THE FINAL pass with `\finalpass` — it activates the preamble guards, which need a `.aux` that
  # has CONVERGED. Today that means "no dangling references and citations": LaTeX already knows this
  # fact, and asking it is strictly stronger than grepping its diary afterwards (see the undefined
  # block below — it stays as insurance for papers without a guard in the preamble).
  #
  # Why a separate pass and not a flag on all three: on the first pass the `.aux` is empty, every
  # reference is undefined BY CONSTRUCTION. Measured 26.08 with the unconditional form: pass 1 fails →
  # the `.aux` is not written → pass 2 fails on the same thing → the cycle NEVER CONVERGES.
  #
  # There is deliberately NO `|| true` here: if the guard fired, that is a finding, not noise.
  pdflatex -interaction=nonstopmode -jobname="$BASE" '\def\finalpass{}\input{'"$BASE"'}' >/dev/null 2>&1
fi

[ -f "$LOG" ] || { echo "FAIL: no $DIR/$LOG (compile failed — run render-paper toolchain first)"; exit 2; }

fail=0
big=0
small=0

echo "== check-render: $DIR/$BASE (threshold ${THRESH}pt) =="

# --- Overfull \hbox (text/tables bleeding past the column/margin) ---
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pt=""
  if [[ $line =~ \(([0-9]+\.?[0-9]*)pt\ too\ wide\) ]]; then
    pt="${BASH_REMATCH[1]}"
  fi
  if [ -n "$pt" ] && awk -v a="$pt" -v b="$THRESH" 'BEGIN{exit !(a>=b)}'; then
    echo "  OVERFULL hbox  ${pt}pt  ${line#*) }"
    big=$((big+1))
  else
    small=$((small+1))
  fi
done < <(grep -F 'Overfull \hbox' "$LOG" || true)

# --- Overfull \vbox (content past the bottom of the text block) ---
# Apply the same pt threshold as hbox: a sub-threshold vbox (< a few pt) is an
# invisible fraction of a line, not a visible defect.
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pt=""
  if [[ $line =~ \(([0-9]+\.?[0-9]*)pt\ too\ high\) ]]; then
    pt="${BASH_REMATCH[1]}"
  fi
  if [ -z "$pt" ] || awk -v a="$pt" -v b="$THRESH" 'BEGIN{exit !(a>=b)}'; then
    echo "  OVERFULL vbox   ${line}"
    big=$((big+1))
  else
    small=$((small+1))
  fi
done < <(grep -F 'Overfull \vbox' "$LOG" || true)

# --- Reference / citation / control-sequence problems ---
undef=$(grep -icE "Undefined control sequence|Citation .* undefined|Reference .* undefined|LaTeX Warning: There were undefined references" "$LOG" || true)
fatal=$(grep -icE "^!|Fatal error|Emergency stop" "$LOG" || true)

# --- BibTeX's OWN log (.blg) — a SECOND log nobody was reading ---
# 🔴 ADDED 2026-08-24, same evening as the class-warning check, after the same shape of failure
# bit twice. BibTeX does not abort the build: on a malformed entry it prints
#   "You're missing a field name---line N of file refs.bib"
#   "I'm skipping whatever remains of this entry"
# and CARRIES ON. pdflatex then produces a perfectly clean PDF with those references SILENTLY
# ABSENT from the bibliography. Measured: two entries vanished and the LaTeX log stayed at
# undefined=0, because the stale .aux still resolved the keys from the previous run.
# The trigger that day: a `%` comment placed INSIDE a @inproceedings entry. `%` is a LaTeX
# comment, NOT a BibTeX one — inside an entry it is a parse error that eats the whole record.
blgerr=0
BLG="$BASE.blg"
if [ -f "$BLG" ]; then
  blgerr=$(grep -cE "I'm skipping whatever remains|Error may have been|repeated entry|I couldn't open" "$BLG" || true)
  if [ "$blgerr" -gt 0 ]; then
    echo "  BIBTEX errors ($blgerr) — entries are DROPPED from the bibliography, build stays green:"
    grep -E "^(You're|I'm skipping|Repeated entry|I couldn't open)" "$BLG" | sed 's/^/      /' | head -12
  fi
  # A cited key that never made it into the .bbl is the same failure seen from the other side.
  if [ -f "$BASE.aux" ] && [ -f "$BASE.bbl" ]; then
    missing=0
    while read -r key; do
      [ -z "$key" ] && continue
      grep -qF "{$key}" "$BASE.bbl" || { echo "      cited but NOT in the bibliography: $key"; missing=$((missing+1)); }
    done < <(grep -oE '\\citation\{[^}]*\}' "$BASE.aux" | sed 's/.*{//;s/}//' | tr ',' '\n' | sort -u)
    [ "$missing" -gt 0 ] && { echo "  CITED-BUT-ABSENT references: $missing"; blgerr=$((blgerr+missing)); }
  fi
fi

# --- Which PUBLISHER is this paper? The gate was publisher-blind until 2026-08-24 ---
# Measured that day: this repo holds THREE shapes — acmart (agenticdev, aisec), ACL's acl.sty
# (compile-rules, built via repro/build-submission.sh), and a bare `article` (scored). The
# checks above are publisher-independent and stay that way. What is NOT publisher-independent
# is which EXTERNAL checker exists, and naming it is the whole point: the author-side tool for
# an ACL paper (aclpubcheck) is not the one for an ACM paper, and for ACM there is no offline
# community checker at all — the publisher checks server-side. Saying so here stops the next
# person re-deriving it, and stops them running the ACL checker on an ACM paper.
publisher="unknown"
if [ -f "$BASE.tex" ]; then
  if grep -qE '^[^%]*\\documentclass[^{]*\{acmart\}' "$BASE.tex"; then publisher="ACM"
  elif grep -qE '^[^%]*\\usepackage\{acl\}|acl_natbib' "$BASE.tex"; then publisher="ACL"
  elif grep -qE '^[^%]*\\documentclass[^{]*\{IEEEtran\}' "$BASE.tex"; then publisher="IEEE"
  fi
fi
echo "  publisher: $publisher"
case "$publisher" in
  ACM)
    # No offline community checker exists for ACM by design — HotCRP's format checker and ACM
    # TAPS validate on upload. The author-side mechanism IS acmart's own warnings, checked below.
    ;;
  ACL)
    echo "  NOTE: ACL paper — the official author-side checker is aclpubcheck, and it is NOT run here."
    echo "        Run it on the CAMERA-READY build (a line-numbered review PDF yields thousands of"
    echo "        spurious margin errors — measured 2026-08-24: 2192 errors, ALL of category Margin):"
    echo "          python3 -m venv env && env/bin/pip install 'setuptools<60' wheel"
    echo "          env/bin/pip install 'aclpubcheck @ git+https://github.com/acl-org/aclpubcheck'"
    echo "          env/bin/aclpubcheck --paper_type long <camera-ready.pdf>"
    echo "        (the setuptools pin is load-bearing: this container's setuptools breaks every"
    echo "         legacy setup.py package with 'AttributeError: install_layout')"
    ;;
  IEEE)
    echo "  NOTE: IEEE paper — validate with IEEE PDF eXpress / LaTeX Analyzer before upload."
    ;;
esac

# --- The document CLASS's own warnings (acmart / IEEEtran / llncs) ---
# 🔴 ADDED 2026-08-24 after three camera-ready blockers shipped past this gate in one
# evening — every one of them ANNOUNCED IN THIS LOG, none of them read:
#   "You do not have the libertine package installed"  -> acmart does NOT fail; it falls
#       back to Computer Modern, so the PDF compiles clean and is set in the WRONG FONTS.
#   "A possible image without description"             -> ACM requires alt text on figures.
#   "CCS concepts are mandatory for papers over two pages" -> a hard venue requirement.
# None of these is an Overfull, an undefined ref, or a fatal error, so the gate passed all
# three. The class is the venue's own voice about venue compliance; not reading it was the
# whole defect. Blocking, not advisory: each of the three would have been shipped.
# 🔴 STAGE-AWARENESS, added 2026-08-24 after running this gate on the HELD-OUT submitted
# version (commit eac95937). It fired 4 warnings there and TWO were false: at submission time
# `printacmref=false` and a missing CCS block are DELIBERATE and correct — the venue requires
# neither until camera-ready. A gate that cries on a legitimate submission build gets muted,
# so camera-ready-only requirements are suppressed while the document is still in review mode.
# Detection is self-contained (the document says what it is), not a flag someone must remember.
review_mode=0
if [ -f "$BASE.tex" ]; then
  grep -qE '^[^%]*\\documentclass\[[^]]*\breview\b' "$BASE.tex" && review_mode=1
  grep -qE '^[^%]*printacmref=false' "$BASE.tex" && review_mode=1
fi
CAMERA_ONLY='ACM reference format is mandatory|CCS concepts are mandatory'
CLASS_RE="^(Class|Package) (acmart|IEEEtran|llncs|refcheck) Warning"

# 🔴 ADVISORY class warnings: printed, but NOT blocking (2026-09-02).
#
# The same argument as the paragraph above about CAMERA_ONLY, only from the other side: a gate that
# fails a paper over something the author cannot influence gets muted entirely — together with the
# real findings. The measurement that produced the list is the very first run of the fixed
# render-gate over the corpus:
#
#   agenticdev-2026   1 warning, `\vspace`. It is NOT in paper.tex, NOT in the paper's .sty — the
#                     package generates it. The publisher accepted this PDF on the second submission
#                     with ZERO findings, that is, its own check had no objections.
#   aisec-2026        3, TWO of them about images with no descriptions — that one IS an ACM
#                     requirement, it is fixed by the author, and it stays blocking.
#
# That is, one bucket held a finding that must be fixed and noise that cannot be fixed at all.
# Splitting them is not a weakening: `\vspace` is still visible in the output on its own line.
#
# ⚠️ Keep the list NARROW and extend it only by measurement: every line here is a class of findings
# that stopped failing the build. Extending it "just in case" turns the gate back into a printer.
CLASS_ADVISORY='\\vspace should only be used'
if [ "$review_mode" = 1 ]; then
  echo "  stage: SUBMISSION (review mode) — camera-ready-only requirements not gated"
  class_hits=$(grep -E "$CLASS_RE" "$LOG" | grep -vE "$CAMERA_ONLY" || true)
else
  echo "  stage: CAMERA-READY"
  class_hits=$(grep -E "$CLASS_RE" "$LOG" || true)
fi
# One selection, two buckets: blocking and advisory. Counting them as one number WAS the defect.
class_block=$(printf '%s\n' "$class_hits" | grep -vE '^$' | grep -vE "$CLASS_ADVISORY" || true)
class_advis=$(printf '%s\n' "$class_hits" | grep -vE '^$' | grep -E "$CLASS_ADVISORY" || true)
classwarn=$(printf '%s\n' "$class_block" | grep -cE '^.' || true)
classadv=$(printf '%s\n' "$class_advis" | grep -cE '^.' || true)
if [ "$classwarn" -gt 0 ]; then
  echo "  DOCUMENT-CLASS warnings ($classwarn) — venue compliance, not cosmetics:"
  printf '%s\n' "$class_block" | sed 's/^/      /' | head -20
fi
if [ "$classadv" -gt 0 ]; then
  echo "  document-class advisory ($classadv) — printed, NOT gated (see CLASS_ADVISORY):"
  printf '%s\n' "$class_advis" | sed 's/^/      /' | head -20
fi

# ⌫ ACM fonts: the check was REMOVED 2026-08-26 — it moved into the `pdf/fonts` rule.
# (deliberately NOT a `# ---` block: the ratchet counts blocks, and a tombstone is not a check)
# The block lived here from 25.08 and was the first to catch "acmart silently fell back to Computer
# Modern". The same thing is now done by `eslint-rules/pdf-facts.mjs` over `_build/paper.facts.json`,
# and it does it WIDER: the block here skipped review mode, the rule judges the artifact always. Two
# sources of truth about one fact drift apart — so the duplicate was deleted, not kept "just in case".
#
# 🔴 The condition under which this becomes a loss: the rule looks at papers whose `paperlint.json`
# names a venue preset. A paper with a build but no preset gets its fonts checked by nobody.

# --- chktex, if installed: LaTeX-source typography the log cannot see ---
# Adopted 2026-08-24 instead of writing our own. Measured first: out of the box it produced 28
# findings on a clean camera-ready and exactly ONE was real (`95\% CI. Averages` — a period after
# capitals that LaTeX renders with a NARROW space; the fix is `CI\@.`). The five noisy rules are
# disabled BY NAME in $REPO/.chktexrc with the measurement recorded there; ~30 rules stay armed.
# Advisory, not blocking: the two survivors of rule 13 on our own corpus are false, and a gate
# that fails on known-false findings is a gate someone disables.
if command -v chktex >/dev/null 2>&1 && [ -f "$BASE.tex" ]; then
  # 🔴 Walk UP from the paper dir first. The three candidates below all failed on 2026-08-24 in a
  # plain `bash check-render.sh <dir>` call: $CLAUDE_PROJECT_DIR is unset outside the harness, and
  # $OLDPWD is whatever the caller sat in before this script's own `cd` — here the paper dir, which
  # holds no rc. Result: 32 advisory findings printed with the five noisy rules ARMED, i.e. the
  # config we measured and wrote that morning was silently not in effect. The tell is the absence
  # of `rc=` in the header line; nothing else says so. Same class as every other config-not-applied
  # defect in this repo, so the lookup no longer depends on an env var or on the caller's cwd.
  RC=""
  d=$(cd "$(dirname "$BASE.tex")" && pwd)
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -f "$d/.chktexrc" ] && { RC="$d/.chktexrc"; break; }
    d=$(dirname "$d")
  done
  [ -z "$RC" ] && for cand in "${CLAUDE_PROJECT_DIR:-}/.chktexrc" "$OLDPWD/.chktexrc" "$HOME/.chktexrc"; do
    [ -n "$cand" ] && [ -f "$cand" ] && { RC="$cand"; break; }
  done
  ck=$(chktex -q ${RC:+-l "$RC"} "$BASE.tex" 2>/dev/null | grep -cE "^(Warning|Error)" || true)
  if [ "$ck" -gt 0 ]; then
    echo "  chktex ($ck, advisory${RC:+, rc=$(basename "$RC")}):"
    chktex -q ${RC:+-l "$RC"} "$BASE.tex" 2>/dev/null | grep -E "^(Warning|Error)" | sed 's/^/      /' | head -10
  fi
fi

# --- refcheck: unreferenced labels. NOT our code — the package ships with TeX Live (2013) and
# writes `Package refcheck Warning: Unused label 'tab:orphan'` into the same .log, which the
# CLASS_RE above already reads. Turn it on for a CHECK build only:
#     \usepackage{refcheck}
# ⚠️ never in the shipped source — by default it prints label names in the margins. Verified
# 2026-08-24 on a fixture: it names both an orphan table and an orphan figure. Our own paper had
# exactly this defect the same day (`tab:tasks`, a table added AT THE REVIEWERS' REQUEST and never
# referenced), found by hand because nothing was looking.

# --- Advisory: literal space inside \texttt{...} (a multi-token command can wrap
# at that space with NO Overfull warning — e.g. rm -rf breaking as rm | -rf). Tie
# command tokens with ~ (\texttt{rm~-rf}). Advisory only: many \texttt spaces are fine.
if [ -f "$BASE.tex" ]; then
  ttspace=$(grep -oE '\\texttt\{[^{}]* [^{}]*\}' "$BASE.tex" 2>/dev/null | sort -u | head -20 || true)
  if [ -n "$ttspace" ]; then
    ttn=$(printf '%s\n' "$ttspace" | wc -l | tr -d ' ')
    echo "  NOTE ($ttn): \\texttt{} block(s) with a literal space (can wrap mid-command — tie tokens with ~ if it's a shell command):"
    printf '%s\n' "$ttspace" | sed 's/^/      /'
  fi
fi

[ "$big"   -gt 0 ] && fail=1
[ "$undef" -gt 0 ] && { echo "  UNDEFINED refs/citations/control-seq: $undef line(s)"; fail=1; }
[ "$fatal" -gt 0 ] && { echo "  FATAL/error lines: $fatal"; fail=1; }
[ "$classwarn" -gt 0 ] && fail=1
[ "$blgerr" -gt 0 ] && fail=1

echo "-- summary: ${big} visible overfull(s) >=${THRESH}pt, ${small} sub-threshold, undef=${undef}, fatal=${fatal}, class-warnings=${classwarn}, class-advisory=${classadv}, bibtex=${blgerr}"
if [ "$fail" -eq 0 ]; then
  echo "PASS: no visible layout defects, no undefined refs."
else
  echo "FAIL: fix the items above before declaring the render clean."
fi
exit $fail
