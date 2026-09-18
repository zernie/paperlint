#!/usr/bin/env bash
# Сборка статьи — ЕЁ СОБСТВЕННЫЙ скрипт, который и зовёт `rpp build`.
set -euo pipefail
cd "$(dirname "$0")"
pdflatex -interaction=nonstopmode -halt-on-error paper.tex >build.log 2>&1
