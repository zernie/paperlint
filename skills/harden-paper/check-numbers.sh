#!/usr/bin/env bash
# check-numbers.sh — enumerate every quantitative token in the paper BODY so each can
# be traced to an artifact number or a \cite.
#
# WHY: a stray prose number that is in NEITHER the artifact NOR a citation slips every
# existing check (they scope to HEADLINE numbers only). This session: "the flagship's
# mean output change ranged from a 37% growth to an 18% cut across independent runs" —
# not in the artifact, uncited — was caught only by the PC-panel's artifact evaluator.
# Enumeration is mechanical; tracing each number stays judgment.
#
# Usage: check-numbers.sh <paper-dir> [texbasename=paper]
# Exit: always 0 (advisory — it lists, you trace).
set -uo pipefail
DIR="${1:?usage: check-numbers.sh <paper-dir> [tex=paper]}"
BASE="${2:-paper}"
cd "$DIR" || { echo "FAIL: cannot cd $DIR"; exit 2; }
[ -f "$BASE.tex" ] || { echo "FAIL: no $BASE.tex"; exit 2; }

echo "== number enumeration (body only): $DIR/$BASE.tex =="
echo "   Trace each to an artifact output or a \\cite. An untraceable number = treat as fabricated (source it or cut it)."
# Drop the filecontents bib block, comment lines, and \cite/\bibliography lines; then
# list body lines that carry a quantitative token (%, a/b ratio, \$/x multiplier, or a 2+-digit number).
awk 'BEGIN{inbib=0}
  /\\begin\{filecontents/{inbib=1}
  /\\end\{filecontents/{inbib=0; next}
  inbib{next}
  /^[ \t]*%/{next}
  /\\cite|\\bibliography/{next}
  /[0-9]/{print NR": "$0}' "$BASE.tex" \
  | grep -E '([0-9]+(\.[0-9]+)?[\\]?%|[0-9]+/[0-9]+|\$[0-9]|[0-9]+(\.[0-9]+)?[xX×]|[0-9][0-9,]{2,})' \
  | sed 's/^/  /' | head -100
echo "-- review the list: every number above must appear in the artifact output or carry a citation --"
exit 0
