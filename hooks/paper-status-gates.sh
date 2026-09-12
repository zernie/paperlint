#!/usr/bin/env bash
# paper-status-gates.sh — NOT A HOOK. This is a TOOL invoked by `paper-status-gates.hook.mjs`,
# which owns the event routing and decides WHICH paper (if any) an edit concerned.
#
#   --surface <paper-dir>   print the readiness verdict + run the pipeline checker
#
# 🔴 WHAT LEFT THIS FILE AND WHY IT MATTERS. It used to read its payload with
# `INPUT="${CLAUDE_TOOL_INPUT:-}"` plus a `timeout 1 cat` fallback and then grep that blob for a
# paper path. `$CLAUDE_TOOL_INPUT` is NOT set by the harness — the payload arrives on stdin — and
# that single idiom left THREE hooks silently dead for twelve days. None of it survives here:
# this file receives an already-validated directory NAME as an argument, and it is registered as
# a hook nowhere, so it cannot contract that disease again.
#
# Advisory (stderr), never blocks, always exits 0.
set -euo pipefail

[ "${1:-}" = "--surface" ] || {
  echo "paper-status-gates.sh: a tool, not a hook. Use --surface <paper-dir>." >&2
  exit 0
}

pdir_name="${2:-}"
[ -n "$pdir_name" ] || exit 0
# Defence in depth: the hook already anchored this to [A-Za-z0-9._-]+, and it is re-checked here
# so the file is safe to call directly too.
case "$pdir_name" in
  *[!A-Za-z0-9._-]* | "" | . | ..) exit 0 ;;
esac

# ── WHERE THE CONSUMER'S THINGS ARE — TWO CARRIERS, READ, NOT ASSUMED ────────
# This file used to hard-code both of these paths, which made it a tool with exactly one possible
# user. Both now come from the one declaration every other carrier of this package reads:
#
#   "research-paper-pipeline": { "papers": "docs/papers", "scripts": "tools/pipeline" }
#
# ⚠️ `node -p` RATHER THAN grep/sed ON package.json. A JSON value is not a line of text: it can
# be quoted, escaped, or spread across lines, and a pattern that gets it right today gets it
# wrong on the first reformat — silently, by producing a root that matches nothing. Node is
# already a hard dependency of the checker this script runs, so there is no new requirement.
ROOT_DIR="${CLAUDE_PROJECT_DIR:-.}"
read_key() { # $1 = key, $2 = default
  node -p "(require('$ROOT_DIR/package.json')['research-paper-pipeline']||{})['$1'] ?? '$2'" \
    2>/dev/null || echo "$2"
}
papers_root="$(read_key papers papers)"
scripts_root="$(read_key scripts .claude/skills/paper-pipeline/scripts)"

# 🔴 AN UNUSABLE ROOT EXITS, IT DOES NOT BUILD A PATH FROM IT. `node -p` prints `undefined` for a
# key whose value is literally `null` (`?? ` only catches null/undefined AFTER the object lookup,
# and a `null` value reaches the default — but a malformed package.json makes the whole command
# fail and the `|| echo` hands back the default). Either way, an empty or nonsense value would
# produce `/<paper>/PIPELINE-STATUS.md` rooted at the filesystem, which does not exist, and this
# script would exit 0 looking like a paper with nothing to report. Named rather than risked.
case "$papers_root" in
  "" | undefined | null) exit 0 ;;
esac

pdir="$papers_root/$pdir_name"
STATUS="$ROOT_DIR/$pdir/PIPELINE-STATUS.md"
[ -f "$STATUS" ] || exit 0

# 🔴 SURFACE THE VERDICT, UNPROMPTED — see the header: the checker parsed this line and never
# printed it, so the single fact anyone actually wanted was the one the tooling withheld.
VERDICT=$(grep -m1 -E '^\*\*Readiness verdict:\*\*' "$STATUS" 2>/dev/null || true)
if [ -n "$VERDICT" ]; then
  echo "📊 $(echo "$VERDICT" | sed -E 's/\*\*//g' | cut -c1-200)" >&2
else
  echo "📊 PIPELINE-STATUS.md has NO '**Readiness verdict:**' line — the scorecard cannot say" >&2
  echo "   whether this paper is submittable, which is the one question it exists to answer." >&2
fi

CHECK="$ROOT_DIR/$scripts_root/pipeline-check.mjs"
if [ -f "$CHECK" ]; then
  # The real checker: stale continuous passes, gates missing their declared inputs, a study that
  # ran before the claim was stated, submit-access inside the moderation window, a verdict that is
  # only a percentage, unrun gates. Advisory, always exit 0.
  node "$CHECK" "$ROOT_DIR/$pdir" >&2 || true
else
  # Fallback for a checkout without the skill tree — the old crude surface.
  gates=$(grep -E '☐' "$STATUS" 2>/dev/null | grep -iE 'study-accepted|pc-panel|harden|verify.?citations' || true)
  if [ -n "$gates" ]; then
    echo "⚠️ UNRUN GATES in $pdir/PIPELINE-STATUS.md (☐ — run them, don't 'anti-churn'-skip):" >&2
    echo "$gates" | sed -E 's/\|.*//; s/^\| */   /' >&2
  fi
fi
exit 0
