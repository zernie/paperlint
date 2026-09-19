#!/usr/bin/env bash
# A failing build: `rpp build` must report status failed AND NAME the exit code.
echo "pdflatex: something went wrong" >&2
exit 3
