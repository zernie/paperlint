#!/usr/bin/env bash
# Installs upstream TeX Live with exactly the CTAN packages this base's papers need.
#
# WHY THIS INSTEAD OF AN ACTION. The right tool by class — teatimeguest/setup-texlive-action — is
# BLOCKED for us by the account's allowlist of third-party Actions ("##[error]Repository access
# blocked", run 33457399377). It is not rejected, it is unavailable, and if it is ever added to the
# allowlist — move to it. For now: actions/cache is first-party and allowed under any policy, and we
# do the install ourselves. The full analysis of the three approaches with measurements is in
# ci-tex-toolchain-decision.md next door.
#
# MEASURED 2026-09-01 (locally, in the session container): 230 MB on disk, ~2 min from cold.
# Against the texlive/texlive:latest container — 2700 MB and 2m01s of pull ON EVERY run, because
# GitHub does not cache the job image under any circumstances. 230 MB do cache.
#
# Both of the base's papers were built by this install and checked by their embedded fonts:
#   agenticdev-2026 (acmart) → LinLibertineT + Inconsolatazi4 + LibertineMathMI, 6 pp.
#   compile-rules-2026 (acl) → NimbusRomNo9L + NimbusSanL, 0 errors
#
# Usage:  bash ci-install-texlive.sh [TEXDIR]     (defaults to $HOME/texlive)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEXDIR="${1:-$HOME/texlive}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 🔴 The list is read from ensure-toolchain.sh — there it is declared next to the apt names and to
# the REQUIRED_FILES contract. A second copy here would reproduce exactly the defect that file
# protects against ("a second list is how the two copies above drifted apart").
mapfile -t PKGS < <(
  sed -n '/^CTAN_PACKAGES=(/,/^)/p' "$HERE/ensure-toolchain.sh" \
    | sed -e '1d' -e '$d' -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$' | tr ' ' '\n' | grep -v '^$'
)
# An assert on non-emptiness: an empty parse would install bare scheme-basic (or nothing) and would
# fail the build later with an inscrutable error about acmart instead of a clear one about parsing. A
# scan that came back with zero is either "nothing to do" or "I looked in the wrong place", and the
# code is what must tell them apart.
if [ "${#PKGS[@]}" -lt 20 ]; then
  echo "🔴 CTAN_PACKAGES parsed empty or suspiciously short (${#PKGS[@]}) — the parse is broken" >&2
  printf '%s\n' "${PKGS[@]}" >&2
  exit 1
fi
echo "packages to install: ${#PKGS[@]}"

# In this base's agent container, outbound HTTPS goes through a proxy with its own CA, and without
# it curl fails with "unable to get local issuer certificate". On a GitHub runner that file does not
# exist and the block does nothing. Written down because time has already been lost on this twice:
# remembering to export it does not work, let the script sort it out itself.
if [ -z "${CURL_CA_BUNDLE:-}" ] && [ -r /root/.ccr/ca-bundle.crt ]; then
  export CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt
  export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt
  echo "(local proxy: substituted the CA bundle)"
fi

cd "$WORK"

# 🔴 SEVERAL MIRRORS, AND THAT IS NOT OVER-INSURANCE — MEASURED 2026-09-02.
#
# The first version took only `mirror.ctan.org`, and run 33650803245 failed like this:
#
#     == downloading install-tl ==
#     curl: (60) SSL certificate problem: unable to get local issuer certificate
#
# The cause is NOT the proxy's CA bundle (the block above does not fire on the runner, and that is
# correct): `mirror.ctan.org` is a REDIRECTOR to a random community mirror, and that time it led to
# a mirror with an incomplete certificate chain. Retrying does not help here: `--retry` follows the
# same redirect and may land on the same mirror.
#
# ⚠️ THE HONEST BOUNDARY OF MY MEASUREMENT: checking the mirrors' chains from the agent container is
# IMPOSSIBLE — the proxy re-signs TLS with its own certificate, so all four URLs returned 200
# regardless of what the mirror itself presents. Hence the decision: do not pick the "right" mirror
# (there is nothing to check it with), but survive any broken one.
#
# The order: the redirector first (usually the nearest and fastest mirror), then three NAMED
# university mirrors — their chains are stable, because they are looked after by the same people who
# look after CTAN itself.
TL_MIRRORS="
https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz
https://ctan.math.illinois.edu/systems/texlive/tlnet/install-tl-unx.tar.gz
https://mirrors.mit.edu/CTAN/systems/texlive/tlnet/install-tl-unx.tar.gz
https://ftp.tu-chemnitz.de/pub/tex/systems/texlive/tlnet/install-tl-unx.tar.gz
"
echo "== downloading install-tl =="
got=""
for url in $TL_MIRRORS; do
  if curl -sSL --retry 2 --retry-delay 2 --max-time 180 -o install-tl.tar.gz "$url" 2>/tmp/tlcurl.err; then
    # The downloaded file is checked by UNPACKING it, not by its size: a truncated archive and a
    # mirror's error page both weigh "something", and both would pass a non-emptiness check.
    if tar tzf install-tl.tar.gz >/dev/null 2>&1; then
      got="$url"
      echo "   mirror: $url"
      break
    fi
    echo "   ⚠️ $url returned something other than an archive, trying the next one"
  else
    echo "   ⚠️ $url: $(tr -d '\n' </tmp/tlcurl.err | cut -c1-120)"
  fi
done
if [ -z "$got" ]; then
  echo "🔴 not one of the CTAN mirrors returned install-tl. The list is TL_MIRRORS in this file." >&2
  exit 1
fi
tar xzf install-tl.tar.gz

cat > tl.profile <<EOF
selected_scheme scheme-basic
TEXDIR $TEXDIR
TEXMFLOCAL $TEXDIR/texmf-local
TEXMFSYSVAR $TEXDIR/texmf-var
TEXMFSYSCONFIG $TEXDIR/texmf-config
TEXMFVAR $TEXDIR/user-var
TEXMFCONFIG $TEXDIR/user-config
TEXMFHOME $TEXDIR/texmf-home
instopt_adjustpath 0
instopt_adjustrepo 1
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
EOF

echo "== install-tl (scheme-basic) =="
./install-tl-*/install-tl --profile=tl.profile --no-interaction

# The binaries directory depends on the architecture; we do not hardcode x86_64-linux, we find it.
BIN="$(find "$TEXDIR/bin" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -n "$BIN" ] || { echo "🔴 did not find the binaries directory in $TEXDIR/bin" >&2; exit 1; }
export PATH="$BIN:$PATH"

echo "== tlmgr install (${#PKGS[@]} packages) =="
# 🔴 tlmgr's EXIT CODE IS NOT THE CRITERION HERE, and that is not sloppiness but a measurement from
# 2026-09-01. `tlmgr install` returns 1 if it disliked AT LEAST ONE name — and two completely
# different cases fall into that same single code:
#   "package already present: acmart"          — normal, scheme-basic already brought it in
#   "package X not present in repository"      — a real error, the name is invented or outdated
# The first case happens on EVERY run (the install-tl profile installs part of the list itself), so
# `set -e` on this line would kill the script always. Verified live: that is what happened, and it
# died BEFORE the file-checking block, that is, the one honest check was lost.
#
# Therefore: we ignore the code and look in the output for exactly the line that means a real
# breakage. This is the same principle as further down the file — judge by the result, not by the
# installer's exit code.
tlmgr install "${PKGS[@]}" 2>&1 | tee "$WORK/tlmgr.log" || true
if grep -q "not present in repository" "$WORK/tlmgr.log"; then
  echo "🔴 tlmgr does not know these packages — the name is invented or renamed on CTAN:" >&2
  grep "not present in repository" "$WORK/tlmgr.log" >&2
  echo "Check the name:  tlmgr search --global --file <file>  or  tlmgr info <name>" >&2
  exit 1
fi

# 🔴 A CHECK AFTER THE INSTALL, NOT THE INSTALLER'S EXIT CODE. On 2026-09-01 the apt action returned
# outcome=success having installed ZERO packages (a 404 on a stale JRE version), and the step was
# green. The installer cannot be trusted — the only thing that can be trusted is that the files are
# there.
mapfile -t NEED < <(
  sed -n '/^REQUIRED_FILES=(/,/^)/p' "$HERE/ensure-toolchain.sh" \
    | sed -e '1d' -e '$d' -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$'
)
[ "${#NEED[@]}" -ge 10 ] || { echo "🔴 REQUIRED_FILES parsed empty" >&2; exit 1; }
missing=""
for f in "${NEED[@]}"; do kpsewhich "$f" >/dev/null 2>&1 || missing="$missing $f"; done
if [ -n "$missing" ]; then
  echo "🔴 MISSING after the install:$missing" >&2
  echo "Add the package that carries it to CTAN_PACKAGES ($HERE/ensure-toolchain.sh)." >&2
  echo "Find the package by file:  tlmgr search --global --file <name>" >&2
  exit 1
fi

# 🔴 AND THE BINARIES TOO, NOT ONLY THE FILES. The check above looks for `.cls`/`.sty` via
# `kpsewhich` — as a file. `texcount` is not found as a file, it is an EXECUTABLE, so its absence
# slipped past and surfaced two steps later, as a red paper build (measured 2026-09-17).
# From REQUIRED_BINS we take only the ones marked `:tex` — `pdfinfo` arrives from poppler via apt,
# and looking for it here would be a false positive.
mapfile -t NEED_BINS < <(
  sed -n '/^REQUIRED_BINS=(/,/)$/p' "$HERE/ensure-toolchain.sh" \
    | tr ' ' '\n' | sed -e 's/^REQUIRED_BINS=(//' -e 's/)$//' \
    | grep ':tex$' | sed 's/:tex$//' | grep -v '^$'
)
[ "${#NEED_BINS[@]}" -ge 1 ] || { echo "🔴 REQUIRED_BINS parsed empty — the parse is broken" >&2; exit 1; }
missing_bins=""
for b in "${NEED_BINS[@]}"; do [ -x "$BIN/$b" ] || missing_bins="$missing_bins $b"; done
if [ -n "$missing_bins" ]; then
  echo "🔴 BINARIES MISSING after the install:$missing_bins" >&2
  echo "Add the package that carries it to CTAN_PACKAGES ($HERE/ensure-toolchain.sh)." >&2
  echo "Find the package by file:  tlmgr search --global --file <name>" >&2
  exit 1
fi

echo "✅ TeX Live is ready: ${#NEED[@]} required files and ${#NEED_BINS[@]} binaries in place, $(du -sh --block-size=1M "$TEXDIR" | cut -f1) MB"
echo "PATH: $BIN"
