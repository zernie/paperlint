#!/usr/bin/env bash
# ensure-checkers.sh — installs ALL the external paper checkers with one command and PROVES that
# each one runs. Idempotent: running it again breaks nothing.
#
#   bash node_modules/paperlint/skills/render-paper/ensure-checkers.sh
#
# WHY IT EXISTS (2026-09-04). The install used to live as a COMMENT in requirements.txt:
# five commands, `cp -r … site-packages/` among them. That block was wrong along three axes at
# once, and all three showed up on the first attempt to use it:
#   1. NOT NEEDED  — bibtexparser 1.3.0 has a prebuilt wheel, the pin `<2` is enough;
#   2. INCOMPLETE  — it said nothing about cffi and unidecode, both needed, both surfaced by a crash;
#   3. HARMFUL     — copying into site-packages leaves pip's metadata lying
#                    (`pip list` showed 2.0.0b9 on top of 1.4.4 files).
# Prose is not executed and therefore not checked. A script is executed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JAR_DIR="${TEXTIDOTE_DIR:-/opt/textidote}"
JAR="$JAR_DIR/textidote.jar"
JAR_URL="https://github.com/sylvainhalle/textidote/releases/download/v0.9/textidote.jar"
JAR_SHA="3ad1aaa0922709f8"     # sha256 prefix, checked 2026-09-04

echo "== python dependencies =="
# `--only-binary :all:` IS LOAD-BEARING: it turns "a dependency with no prebuilt wheel (.whl)" from
# an inscrutable build failure into a refusal that names the package. That is exactly how `tsv` was
# found on 17.09 — before that the install failed with a stack from the depths of setuptools, and
# bibtexparser looked like the guilty one.
pip install -q --only-binary :all: -r "$HERE/checkers-requirements.txt"
# The checker itself — WITHOUT its dependencies: they are listed in requirements.txt by name, minus
# the unbuildable `tsv`, which it does not import. The reason is in the header of requirements.txt.
pip install -q --no-deps aclpubcheck

echo "== TeXtidote (a jar, not a pip package) =="
if [ -f "$JAR" ]; then
  echo "   already in place: $JAR"
else
  mkdir -p "$JAR_DIR"
  curl -sSL --max-time 300 -o "$JAR" "$JAR_URL"
fi
got="$(sha256sum "$JAR" | cut -c1-16)"
if [ "$got" != "$JAR_SHA" ]; then
  echo "🔴 sha256 does not match: expected $JAR_SHA…, got $got…" >&2
  echo "   The file is NOT the one that was checked. Do not use it, find out why." >&2
  exit 1
fi

# 🔴 THE MAIN PART. The installer cannot be trusted — the only thing that can be trusted is that
# the tool RUNS. "Installed" and "works" are different, and this repo already records a separate
# failure on that difference: a handoff recorded "aclpubcheck: All Clear" for a check that was
# never executed once. A missing checker and a passing one look the same.
echo "== checking that every checker WORKS =="
fail=0
# 🔴 IMPORT THE MODULE, NOT `--help`. Measured 17.09: `--help` prints usage and exits ZERO on an
# interpreter where pandas does not import at all (numpy/pandas built against each other:
# "numpy.dtype size changed"). That is, the acceptance check that stood here let through exactly
# the failure it was written for. `import aclpubcheck.formatchecker` pulls in numpy and pandas on
# lines 15 and 20 of the checker itself and therefore fails honestly.
python3 -c "import aclpubcheck.formatchecker" >/dev/null 2>&1 \
  && echo "   ✅ aclpubcheck" || { echo "   ❌ aclpubcheck is installed, but does not run"; fail=1; }
python3 -c "import rebiber" >/dev/null 2>&1 \
  && echo "   ✅ rebiber" || { echo "   ❌ rebiber does not import"; fail=1; }
python3 -c "import jinja2" >/dev/null 2>&1 \
  && echo "   ✅ jinja2" || { echo "   ❌ jinja2 does not import"; fail=1; }
java -jar "$JAR" --version >/dev/null 2>&1 \
  && echo "   ✅ textidote ($JAR)" || { echo "   ❌ textidote does not run (a JRE is needed; java 21 works)"; fail=1; }

[ "$fail" -eq 0 ] || { echo; echo "🔴 not everything works — see above" >&2; exit 1; }
echo
echo "✅ all checkers are installed AND run"
