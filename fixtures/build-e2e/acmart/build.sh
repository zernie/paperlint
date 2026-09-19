#!/usr/bin/env bash
# Building the paper — ITS OWN script, the one that calls `rpp build`.
set -euo pipefail
cd "$(dirname "$0")"
pdflatex -interaction=nonstopmode -halt-on-error paper.tex >build.log 2>&1
