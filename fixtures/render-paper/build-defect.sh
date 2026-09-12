#!/usr/bin/env bash
# FIXTURE — the DEFECT half. This is the shape the real script had before 2026-09-12.
#
# ⚠️ The comment below deliberately QUOTES the bad line in prose. That is the point of the
# fixture: a check that greps for the string anywhere would fire on this explanation instead
# of on the executable line, and would therefore also fire on a file that was already fixed.
# The assertion must anchor to the executable line, so this comment must NOT make it fire.
#
#   was: export TEXINPUTS="$ROOT/.claude/skills/submit-paper/references/venues:"
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)

export TEXINPUTS="$ROOT/.claude/skills/submit-paper/references/venues:"

pdflatex paper.tex
