#!/usr/bin/env bash
# tier: A
# source: issue #63 (autopilot-stray-wip-guard) 2026-06-12
# desc: autopilot branch-restore uses the canonical SCOPED restore at every restore
#       site — a non-destructive two-step `git checkout development -- $OWNED_PATHS`
#       then `git checkout development`, asserting an owned-clean tree + HEAD on
#       development — and exactly one forced tree-wide `git checkout -f development`
#       remains (the §1 self-heal). Supersedes the pre-#63 "forced restore everywhere".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

# --- positive assertion: the scoped restore appears at every restore site (>= 3) ---
# Literal match REQUIRES `grep -F`: `$OWNED_PATHS` is a literal dollar-string in the
# skill, and default BRE treats the bare `$` as an end-of-line anchor and misses it —
# the exact grep form is load-bearing here (mirrors the owned-surface-guard probe).
# shellcheck disable=SC2016  # the literal $OWNED_PATHS must NOT expand — it is matched verbatim
scoped_count="$(grep -Fc 'git checkout development -- $OWNED_PATHS' "$SKILL" || true)"
if (( scoped_count < 3 )); then
  echo "REGRESSION: expected >= 3 'git checkout development -- \$OWNED_PATHS' scoped-restore sites, found $scoped_count" >&2
  exit 1
fi

# --- positive assertion: the scoped post-restore (owned-tree-clean) message is present ---
if ! grep -q 'restore left a dirty owned tree' "$SKILL"; then
  echo "REGRESSION: scoped post-restore assertion ('restore left a dirty owned tree') missing from autopilot SKILL.md" >&2
  exit 1
fi

# --- positive assertion: the HEAD-on-development assertion is present ---
if ! grep -q 'rev-parse --abbrev-ref HEAD' "$SKILL"; then
  echo "REGRESSION: HEAD assertion ('rev-parse --abbrev-ref HEAD') missing from autopilot SKILL.md" >&2
  exit 1
fi

# --- exact assertion: only ONE forced tree-wide form remains (the §1 self-heal) ---
forced_count="$(grep -c 'git checkout -f development' "$SKILL" || true)"
if (( forced_count != 1 )); then
  echo "REGRESSION: expected exactly 1 'git checkout -f development' (only the §1 self-heal), found $forced_count" >&2
  exit 1
fi

# Confirm that lone forced form IS the self-heal — not a stray un-scoped restore site.
# It must carry BRANCH / `rev-parse --abbrev-ref HEAD` context within a small (±2-line) window.
if ! grep -B2 -A2 'git checkout -f development' "$SKILL" | grep -qE 'BRANCH|rev-parse --abbrev-ref HEAD'; then
  echo "REGRESSION: the lone 'git checkout -f development' is not the §1 self-heal (no BRANCH/rev-parse context within ±2 lines)" >&2
  exit 1
fi

echo "PASS: autopilot restore scoped to \$OWNED_PATHS at $scoped_count sites (owned-clean + HEAD asserted); exactly 1 forced self-heal remains" >&2
exit 0
