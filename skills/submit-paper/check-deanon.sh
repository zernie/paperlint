#!/usr/bin/env bash
# check-deanon.sh — mechanical double-blind de-anonymization gate.
#
# WHY: for a double-blind submission, an author-identifying string leaking into
# the PDF *or any shipped artifact file* is the single highest reject-vector, and
# it's invisible to a paper-only read (e.g. an artifact README that names real
# maintainers/repos). This greps a deny-list across the compiled PDF's TEXT and
# every artifact file (including inside artifact.zip) so "anonymized" is a checked
# fact. Sibling to render-paper/check-render.sh. Spirit: prose isn't policy.
#
# Usage:  check-deanon.sh <paper-dir> [pdf=paper.pdf] [denylist=<skill>/deanon-denylist.txt]
#   It auto-scans, in <paper-dir>: the PDF text, everything under artifact/ (if present),
#   and the contents of any *.zip (artifact bundles). Pass extra paths after the
#   denylist arg to scan additional dirs/zips.
#
# Exit: 0 = clean (no identifiers found); 1 = leak(s) found; 2 = usage/tool error.
# NOTE: run this ONLY on double-blind submissions. A single-blind/de-anonymized
# paper is SUPPOSED to carry the author name — this gate would (correctly) fail it.

set -uo pipefail

DIR="${1:?usage: check-deanon.sh <paper-dir> [pdf=paper.pdf] [denylist=...] [extra-paths...]}"
PDF="${2:-paper.pdf}"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DENY="${3:-$SKILL_DIR/deanon-denylist.txt}"
shift $(( $# >= 3 ? 3 : $# ))
EXTRA=("$@")

[ -d "$DIR" ]  || { echo "FAIL: no dir $DIR"; exit 2; }
[ -f "$DENY" ] || { echo "FAIL: no deny-list $DENY"; exit 2; }

# Build the active pattern (strip comments/blanks).
PAT="$(grep -vE '^\s*(#|$)' "$DENY" || true)"
[ -n "$PAT" ] || { echo "FAIL: deny-list $DENY has no patterns"; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== check-deanon: $DIR (pdf=$PDF, $(printf '%s\n' "$PAT" | wc -l | tr -d ' ') patterns) =="

hits=0

scan() { # scan <label> <file-or-textfile>
  local label="$1" file="$2"
  [ -f "$file" ] || return 0
  local m
  # -I skips binary files. REQUIRED since 2026-08-07, when the artifact branch stopped
  # filtering by extension: without it, grep prints "Binary file X matches" for any .so,
  # .map or image whose bytes happen to contain the pattern, and that line would be counted
  # as a LEAK. A gate that cries wolf on a shared object gets muted, and a muted deanon
  # gate is the same as no deanon gate.
  m="$(grep -inEI "$PAT" "$file" 2>/dev/null || true)"
  if [ -n "$m" ]; then
    while IFS= read -r line; do
      echo "  LEAK  $label:$line"
      hits=$((hits+1))
    done <<< "$m"
  fi
}

# 1. PDF text (via pymupdf — same dep render-paper uses)
if [ -f "$DIR/$PDF" ]; then
  if python3 - "$DIR/$PDF" "$TMP/pdf.txt" <<'PY' 2>/dev/null
import sys
try:
    import fitz
except Exception:
    sys.exit(3)
d = fitz.open(sys.argv[1])
open(sys.argv[2], "w").write("".join(p.get_text() for p in d))
PY
  then scan "PDF[$PDF]" "$TMP/pdf.txt"
  else echo "  WARN: could not extract PDF text (pymupdf missing?) — PDF not scanned"; fi
else
  echo "  WARN: $DIR/$PDF not found — PDF not scanned"
fi

# 2. Every file under artifact/ (README, scripts, data) — text files only
if [ -d "$DIR/artifact" ]; then
  while IFS= read -r f; do
    scan "artifact/${f#"$DIR"/artifact/}" "$f"
  # 🔴 NO EXTENSION FILTER, and that is the fix, not an oversight. Until 2026-08-07 this
  # branch carried an allow-list (*.md *.py *.txt *.json *.js *.ts *.sh *.cfg *.csv *.tex
  # LICENSE README*) and SILENTLY SKIPPED everything else — while printing "PASS: no
  # author-identifying strings found. Safe for double-blind." about files it never opened.
  #
  # Measured, one fixture, identical bytes, three placements:
  #   artifact/config.yml (loose)     -> exit 0, the affirmative safety sentence
  #   config.yml inside artifact.zip  -> exit 1, LEAK reported
  #   config.yml via an extra path    -> exit 1, LEAK reported
  #
  # The other two branches never filtered — the zip branch decodes every member, the
  # extra-path branch is a bare `find -type f` — so the allow-list was an oversight, and
  # the header's own contract says "every artifact file". Unlisted extensions that are
  # ordinary in a real artifact: .yml/.yaml, .toml, Dockerfile, Makefile, .ipynb,
  # .env.example, and .bib — a BibTeX file under artifact/ carrying the author's own name
  # is the sharpest version of the miss.
  #
  # `grep -I` in scan() skips binary files, which is what the zip branch already relies on,
  # so dropping the filter costs a little time and no correctness.
  done < <(find "$DIR/artifact" -type f 2>/dev/null)
fi

# 3. Contents of any *.zip in the paper dir (and any extra zip paths) — the sneaky one
scan_zip() { # scan_zip <zip>
  local zip="$1"
  [ -f "$zip" ] || return 0
  python3 - "$zip" "$TMP/zipdump" <<'PY' 2>/dev/null || return 0
import sys, zipfile, os
z, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
zf = zipfile.ZipFile(z)
for n in zf.namelist():
    if n.endswith("/"): continue
    try:
        data = zf.read(n)
        text = data.decode("utf-8", "ignore")
    except Exception:
        continue
    safe = n.replace("/", "__")
    open(os.path.join(out, safe), "w").write(text)
PY
  if [ -d "$TMP/zipdump" ]; then
    for f in "$TMP/zipdump"/*; do
      [ -f "$f" ] || continue
      scan "$(basename "$zip")!$(basename "$f" | sed 's/__/\//g')" "$f"
    done
    rm -rf "$TMP/zipdump"
  fi
}
while IFS= read -r z; do scan_zip "$z"; done < <(find "$DIR" -maxdepth 2 -name '*.zip' -type f 2>/dev/null)

# 4. Extra caller-supplied paths (dirs or zips)
for p in "${EXTRA[@]:-}"; do
  [ -z "$p" ] && continue
  if [ -d "$p" ]; then
    while IFS= read -r f; do scan "extra:${f}" "$f"; done < <(find "$p" -type f 2>/dev/null)
  elif [[ "$p" == *.zip ]]; then scan_zip "$p"
  elif [ -f "$p" ]; then scan "extra:$p" "$p"; fi
done

echo "-- summary: $hits identifier hit(s) across PDF + artifact + zip"
if [ "$hits" -eq 0 ]; then
  echo "PASS: no author-identifying strings found. Safe for double-blind."
  exit 0
else
  echo "FAIL: de-anonymization leak(s) above — scrub before submitting double-blind."
  exit 1
fi
