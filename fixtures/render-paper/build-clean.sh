#!/usr/bin/env bash
# FIXTURE — the CLEAN half of the `build.sh` ladder assertion in
# `skills/render-paper/render-paper.harness.mjs`.
#
# A paper's own build script must not hard-code a path into the agent's skills directory:
# once the skills move into a package that address points at nothing, and LaTeX's reaction to
# a missing \input is SILENCE, not an error. So the script resolves the venues directory
# through the package first, falls back to the in-repo copy, and then VERIFIES that kpsewhich
# can actually see the file before handing anything to pdflatex.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)

VENUES_PKG=$(node -e 'try{process.stdout.write(require.resolve("research-paper-pipeline/venues/paper-guards.tex"))}catch{}' 2>/dev/null || true)
if [ -n "$VENUES_PKG" ] && [ -f "$VENUES_PKG" ]; then
  VENUES_DIR=$(dirname "$VENUES_PKG")
elif [ -f "$ROOT/.claude/skills/submit-paper/references/venues/paper-guards.tex" ]; then
  VENUES_DIR="$ROOT/.claude/skills/submit-paper/references/venues"
else
  echo "✗ paper-guards.tex found neither in the package nor in the repository" >&2
  exit 1
fi
export TEXINPUTS="$VENUES_DIR:"
kpsewhich paper-guards.tex >/dev/null || { echo "✗ directory found, but kpsewhich cannot see paper-guards.tex"; exit 1; }

pdflatex paper.tex
