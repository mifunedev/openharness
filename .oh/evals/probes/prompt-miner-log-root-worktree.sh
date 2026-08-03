#!/usr/bin/env bash
# id: prompt-miner-log-root-worktree
# tier: A
# source: .oh/skills/prompt-miner/scripts/render-log-entry.sh
# desc: the prompt-miner daily-log helper writes to the MAIN worktree's memory dir
#       when invoked from inside a linked git worktree with no env vars set (#693)
#
# Why this cannot be a fixture test: the defect is entirely in how the helper
# resolves its write ROOT from git's view of the current directory. A fixture
# harness that invokes the script from the main checkout resolves the same path
# either way and stays green with the bug live — which is exactly how this
# survived three production occurrences (07-10, 07-14, 07-19). The probe must
# therefore build a real linked worktree and run the helper inside it.
#
# Exit: 0 pass | 1 REGRESSION | 2 SKIPPED (honest environment gap)
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "SKIP: not inside a git repository" >&2; exit 2; }

HELPER="$ROOT/.oh/skills/prompt-miner/scripts/render-log-entry.sh"
[ -f "$HELPER" ] || { echo "SKIP: helper not found at $HELPER" >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "SKIP: git unavailable" >&2; exit 2; }

TMP="$(mktemp -d 2>/dev/null)" || { echo "SKIP: mktemp -d failed" >&2; exit 2; }
WT="$TMP/linked"
cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1
  git -C "$ROOT" worktree prune >/dev/null 2>&1
  rm -rf "$TMP" >/dev/null 2>&1
}
trap cleanup EXIT

if ! git -C "$ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1; then
  echo "SKIP: could not create a linked worktree (detached HEAD add failed)" >&2
  exit 2
fi

DAY="$(date -u +%Y-%m-%d)"
# The expected destination is the MAIN worktree, which is not necessarily $ROOT —
# this probe may itself be running from a linked worktree. Resolve it the way git
# defines it: `worktree list --porcelain` prints the main worktree first.
MAIN_ROOT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null \
  | awk 'NR==1{sub(/^worktree /,"");print;exit}')"
[ -n "$MAIN_ROOT" ] || { echo "SKIP: could not resolve the main worktree path" >&2; exit 2; }
MAIN_LOG="$MAIN_ROOT/.oh/memory/$DAY/log.md"
WT_LOG="$WT/.oh/memory/$DAY/log.md"

# Record whether the main log already existed so we only remove what we added.
MAIN_EXISTED=0
MAIN_BEFORE_BYTES=0
if [ -f "$MAIN_LOG" ]; then
  MAIN_EXISTED=1
  MAIN_BEFORE_BYTES="$(wc -c <"$MAIN_LOG" 2>/dev/null || echo 0)"
fi

restore_main() {
  if [ "$MAIN_EXISTED" -eq 1 ]; then
    # Truncate back to the byte length we observed before the probe ran.
    if [ -f "$MAIN_LOG" ]; then
      tmpf="$(mktemp 2>/dev/null)" || return 0
      head -c "$MAIN_BEFORE_BYTES" "$MAIN_LOG" >"$tmpf" 2>/dev/null && mv "$tmpf" "$MAIN_LOG"
    fi
  else
    rm -f "$MAIN_LOG" >/dev/null 2>&1
    rmdir "$MAIN_ROOT/.oh/memory/$DAY" >/dev/null 2>&1
  fi
}
trap 'restore_main; cleanup' EXIT

# Invoke the helper from INSIDE the linked worktree with no AUTOPILOT_LOG_ROOT
# and no CRON_WORKTREE — the exact condition the cron hits.
#
# Deliberately run $ROOT's copy (the working tree under review), not $WT's copy.
# $WT is created from HEAD, so testing its copy would check the last commit
# rather than the change being evaluated. Resolution is cwd-based, so running
# $ROOT's script with cwd inside $WT reproduces the production condition exactly.
out="$(cd "$WT" && env -u AUTOPILOT_LOG_ROOT -u CRON_WORKTREE \
  bash "$HELPER" \
    --result DRY-RUN --sessions-scanned 0 --markers-found 0 2>&1)"
rc=$?

if [ $rc -ne 0 ]; then
  echo "REGRESSION: helper exited $rc when run from a linked worktree" >&2
  echo "$out" | head -20 >&2
  exit 1
fi

if [ -f "$WT_LOG" ]; then
  echo "REGRESSION: daily log was written INTO the linked worktree at $WT_LOG" >&2
  echo "  it must resolve to the MAIN worktree root ($MAIN_ROOT), or the entry is" >&2
  echo "  lost when the cron runtime reaps the worktree (#693)" >&2
  exit 1
fi

if [ ! -f "$MAIN_LOG" ]; then
  echo "REGRESSION: no daily-log entry landed at the main worktree path $MAIN_LOG" >&2
  exit 1
fi

if ! grep -q 'prompt-miner' "$MAIN_LOG" 2>/dev/null; then
  echo "REGRESSION: $MAIN_LOG exists but contains no prompt-miner entry" >&2
  exit 1
fi

# --- precedence: an explicit AUTOPILOT_LOG_ROOT must still win (#693 AC bullet 3) ---
# Existing callers (the cron path recovers by exporting it) must be unaffected.
OVERRIDE="$TMP/override"
mkdir -p "$OVERRIDE/.oh/scripts"
out2="$(cd "$WT" && env -u CRON_WORKTREE AUTOPILOT_LOG_ROOT="$OVERRIDE" \
  bash "$HELPER" --result DRY-RUN --sessions-scanned 0 --markers-found 0 2>&1)"
rc2=$?
if [ $rc2 -ne 0 ]; then
  echo "REGRESSION: helper exited $rc2 with AUTOPILOT_LOG_ROOT set" >&2
  echo "$out2" | head -20 >&2
  exit 1
fi
if [ ! -f "$OVERRIDE/.oh/memory/$DAY/log.md" ]; then
  echo "REGRESSION: AUTOPILOT_LOG_ROOT no longer takes precedence — nothing written" >&2
  echo "  under $OVERRIDE; existing cron callers that export it would break" >&2
  exit 1
fi

# --- a bad CRON_WORKTREE must DEGRADE, not abort (#693 adversarial review) ---
# The helper runs under `set -euo pipefail`. Without `|| true` inside the
# command substitution, a CRON_WORKTREE pointing at a non-repo makes git exit
# non-zero, pipefail propagates it, and -e kills the script before the fallback
# line can run. A reaped worktree is exactly that condition, so this must not be
# fatal. This is a regression guard: pre-fix the variable was never consulted,
# so a stray value was harmless — the fix must not make it lethal.
NOTREPO="$TMP/notarepo"
mkdir -p "$NOTREPO"
out3="$(cd "$WT" && env -u AUTOPILOT_LOG_ROOT CRON_WORKTREE="$NOTREPO" \
  bash "$HELPER" --result DRY-RUN --sessions-scanned 0 --markers-found 0 2>&1)"
rc3=$?
if [ $rc3 -ne 0 ]; then
  echo "REGRESSION: helper exited $rc3 with CRON_WORKTREE set to a non-repo path." >&2
  echo "  Under 'set -euo pipefail' the worktree-list command substitution must end" >&2
  echo "  in '|| true' so resolution falls through instead of aborting the script." >&2
  echo "$out3" | head -10 >&2
  exit 1
fi

echo "PASS: helper resolved the main worktree root from inside a linked worktree,"
echo "      AUTOPILOT_LOG_ROOT still takes precedence, and a bad CRON_WORKTREE"
echo "      degrades instead of aborting"
exit 0
