#!/usr/bin/env bash
# FIXTURE — the CLEAN half of the `build.sh` ladder assertion in
# `skills/render-paper/render-paper.harness.mjs`.
#
# A paper's own build script must not hard-code a path into the agent's skills directory:
# once the skills move into a package that address points at nothing, and LaTeX's reaction to
# a missing \input is SILENCE, not an error. So the script resolves the venues directory
# through the installed package, and then VERIFIES that kpsewhich
# can actually see the file before handing anything to pdflatex.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)

VENUES_PKG=$(cd "$ROOT" && node -e 'try{process.stdout.write(require.resolve("paperlint/presets/tex/paper-guards.tex"))}catch{}' 2>/dev/null || true)
if [ -n "$VENUES_PKG" ] && [ -f "$VENUES_PKG" ]; then
  VENUES_DIR=$(dirname "$VENUES_PKG")
else
  echo "✗ paper-guards.tex not found in the installed paperlint package" >&2
  exit 1
fi
export TEXINPUTS="$VENUES_DIR:"
kpsewhich paper-guards.tex >/dev/null || { echo "✗ directory found, but kpsewhich cannot see paper-guards.tex"; exit 1; }

pdflatex paper.tex
