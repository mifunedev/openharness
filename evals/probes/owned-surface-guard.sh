#!/usr/bin/env bash
# tier: A
# source: issue #63 (autopilot-stray-wip-guard) 2026-06-12
# desc: the autopilot §1 dirty-tree guard and restore are scoped to the OWNED
#       surface, not the whole tree — the §1 MAIN clean check uses
#       `git diff --quiet -- $OWNED_PATHS` (the only tree-wide `git diff --quiet`
#       left is the §1 self-heal), a dirty owned surface emits BLOCKED-OWNED-WIP,
#       and the restore is the scoped `git checkout development -- $OWNED_PATHS`
#       two-step with a `rev-parse --abbrev-ref HEAD` HEAD assertion. So a stray
#       foreign edit neither blocks a run nor is destroyed by the restore.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

# --- (a) the §1 MAIN clean check is path-scoped to the owned surface ---------------
# Literal match REQUIRES `grep -F`: `$OWNED_PATHS` is a literal dollar-string in the
# skill and default BRE treats the bare `$` mid-pattern as an end-of-line anchor and
# misses it (mirrors clean-restore.sh). On an UNMODIFIED skill the §1 check is still
# tree-wide, so this scoped form is absent → exit 1 (the symmetric-oracle anchor).
# shellcheck disable=SC2016  # the literal $OWNED_PATHS must NOT expand — it is matched verbatim
if ! grep -Fq 'git diff --quiet -- $OWNED_PATHS' "$SKILL"; then
  echo "REGRESSION: §1 MAIN clean check is not owned-scoped (missing 'git diff --quiet -- \$OWNED_PATHS')" >&2
  exit 1
fi

# No UNSCOPED tree-wide `git diff --quiet` survives outside the §1 self-heal. Strategy:
# list every `git diff --quiet` line, drop the scoped `-- $OWNED_PATHS` lines, then drop
# the self-heal line (distinguished by its `BRANCH != development` / `rev-parse` context).
# Anything left is an unscoped owned-surface leak.
# shellcheck disable=SC2016  # the literal $OWNED_PATHS must NOT expand — it is matched verbatim
unscoped="$(grep -n 'git diff --quiet' "$SKILL" \
  | grep -vF -- '-- $OWNED_PATHS' \
  | grep -vE 'BRANCH" != "development"|rev-parse --abbrev-ref HEAD' \
  || true)"
if [[ -n "$unscoped" ]]; then
  echo "REGRESSION: unscoped tree-wide 'git diff --quiet' outside the §1 self-heal:" >&2
  echo "$unscoped" >&2
  exit 1
fi

# --- (b) a dirty owned surface emits the distinct BLOCKED-OWNED-WIP liveness token ---
if ! grep -q 'BLOCKED-OWNED-WIP' "$SKILL"; then
  echo "REGRESSION: BLOCKED-OWNED-WIP token missing from autopilot SKILL.md" >&2
  exit 1
fi

# --- (c) the restore is the scoped two-step with a HEAD-on-development assertion -----
# shellcheck disable=SC2016  # the literal $OWNED_PATHS must NOT expand — it is matched verbatim
if ! grep -Fq 'git checkout development -- $OWNED_PATHS' "$SKILL"; then
  echo "REGRESSION: scoped restore ('git checkout development -- \$OWNED_PATHS') missing from autopilot SKILL.md" >&2
  exit 1
fi
if ! grep -q 'rev-parse --abbrev-ref HEAD' "$SKILL"; then
  echo "REGRESSION: HEAD assertion ('rev-parse --abbrev-ref HEAD') missing from autopilot SKILL.md" >&2
  exit 1
fi

echo "PASS: autopilot §1 guard + restore scoped to \$OWNED_PATHS; BLOCKED-OWNED-WIP emitted; HEAD asserted; no unscoped tree-wide diff outside the self-heal" >&2
exit 0
