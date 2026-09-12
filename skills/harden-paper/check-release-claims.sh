#!/usr/bin/env bash
# check-release-claims.sh — reconcile "we release / provide X" PROSE claims against
# what the artifact ACTUALLY ships.
#
# WHY: this session a paper whose whole thesis was "advertised >> delivered" itself
# claimed "we release the harness and raw runs" while the artifact held only per-arm
# aggregates + an analysis script (harness at camera-ready). Only a late PC-panel
# caught it. Enumeration is mechanical; the reconcile (does file X satisfy claim Y?)
# stays human judgment. Spirit: prose isn't policy — compile the enumeration.
#
# Usage: check-release-claims.sh <paper-dir> [texbasename=paper] [artifact-subdir=artifact]
# Exit: always 0 (advisory — it lists, you reconcile).
set -uo pipefail
DIR="${1:?usage: check-release-claims.sh <paper-dir> [tex=paper] [artifact=artifact]}"
BASE="${2:-paper}"
ART="${3:-artifact}"
cd "$DIR" || { echo "FAIL: cannot cd $DIR"; exit 2; }
[ -f "$BASE.tex" ] || { echo "FAIL: no $BASE.tex"; exit 2; }

echo "== release-claim reconciliation: $DIR =="
echo "-- (1) PROSE claims (release verbs) — reconcile each against the artifact listing below --"
grep -nE 'we (release|provide|make available|ship|publish)|is (released|available)|available (at|:)|accompan|raw .*(runs|logs|data|rows)|the (harness|corpus|battery|dataset|artifact)( is| are|,| and| so)' "$BASE.tex" \
  | grep -vE '^[0-9]+:[ \t]*%' | sed 's/^/    /' || echo "    (no release-verb lines matched)"

echo "-- (2) what the artifact ACTUALLY contains ($DIR/$ART) --"
if [ -d "$ART" ]; then
  find "$ART" -maxdepth 2 -type f 2>/dev/null | sed 's/^/    /' | head -40
else
  echo "    (no local $ART/ dir — hosted externally? then reconcile the claim against the HOSTED contents)"
fi

echo "-- CHECK: every 'we release X' in (1) must be satisfied by a file in (2)."
echo "   Promised-but-absent (e.g. 'raw runs' but only aggregates shipped) -> soften to '(at camera-ready)' or add the file."
echo "   Mirror the accurate Availability paragraph; do not let the abstract/conclusion over-promise the artifact."
exit 0
