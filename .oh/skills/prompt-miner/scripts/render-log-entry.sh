#!/usr/bin/env bash
# render-log-entry.sh — append the mandatory prompt-miner memory-log entry.
#
# Mirrors the cron liveness logging shape: it resolves the shared harness root
# (the MAIN worktree, even when invoked from a linked one) and appends a single
# Memory-Improvement-Protocol
# record to .oh/memory/<UTC-date>/log.md through the repo-root .oh/scripts/locked-append.sh
# helper so the whole multi-line record is serialized under flock. Diagnostics go
# to stderr; the helper never edits .oh/memory/MEMORY.md or .oh/context/IDENTITY.md.
#
# Flags (all optional except --result):
#   --result <MINING-COMPLETE|DRY-RUN|NO-SESSIONS|NO-CORPUS>  the run's RESULT tag
#   --time <HH:MM>            UTC time for the heading   (default: date -u +%H:%M)
#   --sessions-scanned <N>    manifest.sessionsScanned   (default: n/a)
#   --markers-found <N>       reportable markers mined    (default: 0)
#   --top-marker <TEXT>       one-line strongest marker   (default: none)
set -euo pipefail
trap 'echo "ERROR: render-log-entry.sh failed at line $LINENO" >&2' ERR

RESULT=""
TIME=""
SESSIONS_SCANNED="n/a"
MARKERS_FOUND="0"
TOP_MARKER="none"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --result)           RESULT="${2:-}"; shift 2 ;;
    --time)             TIME="${2:-}"; shift 2 ;;
    --sessions-scanned) SESSIONS_SCANNED="${2:-}"; shift 2 ;;
    --markers-found)    MARKERS_FOUND="${2:-}"; shift 2 ;;
    --top-marker)       TOP_MARKER="${2:-}"; shift 2 ;;
    *) echo "ERROR: unknown flag: $1" >&2; exit 64 ;;
  esac
done

if [ -z "$RESULT" ]; then
  echo "usage: render-log-entry.sh --result <tag> [--time HH:MM] [--sessions-scanned N] [--markers-found N] [--top-marker TEXT]" >&2
  exit 64
fi

TIME="${TIME:-$(date -u +%H:%M)}"
DAY="$(date -u +%Y-%m-%d)"

# Resolve the SHARED harness root — never the ephemeral worktree.
#
# `git rev-parse --show-toplevel` returns the *linked worktree* when this runs
# under `worktree: true` (which .oh/crons/prompt-miner.md declares), so using it
# alone wrote the daily log into .oh/worktrees/cron/<session>/ and lost it when
# the runtime reaped the worktree (#693; fired 07-10, 07-14, 07-19). Callers are
# not required to export anything: `git worktree list --porcelain` prints the
# MAIN worktree first, so NR==1 is the shared root from inside any linked
# worktree. Precedence is preserved for callers that do set the variable:
#   CRON_LOG_ROOT  ->  CRON_WORKTREE main-worktree mapping  ->  toplevel
# This mirrors .oh/crons/prompt-miner.md:102 and the standing convention
# documented at .oh/crons/README.md:120.
# The `|| true` and the `$1 == "worktree"` guard are both load-bearing under
# `set -euo pipefail` (above): if CRON_WORKTREE points at something that is not
# a git repo — precisely what a reaped worktree looks like — `git` exits
# non-zero, `pipefail` propagates that out of the command substitution, and `-e`
# would abort the script HERE instead of falling through to the fallback below.
# Same idiom the removed cron cap gate used (0.3.0).
ROOT="${CRON_LOG_ROOT:-$(git -C "${CRON_WORKTREE:-.}" worktree list --porcelain 2>/dev/null | awk 'NR==1 && $1 == "worktree" { sub(/^worktree /,""); print; exit }' || true)}"
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
# Resolve the memory dir through the shared resolver (honors paths.memory /
# MEMORY_DIR); fall back to the .oh/memory default if oh-path is unavailable.
MEM_DIR="$(sh "$ROOT/.oh/scripts/oh-path" memory 2>/dev/null || printf '%s' "$ROOT/.oh/memory")"
LOG_DIR="$MEM_DIR/$DAY"
LOG_FILE="$LOG_DIR/log.md"
APPEND="$ROOT/.oh/scripts/locked-append.sh"
mkdir -p "$LOG_DIR"

record() {
  cat <<EOF

## prompt-miner -- $TIME UTC
- **Result**: $RESULT
- **Sessions scanned**: $SESSIONS_SCANNED
- **Markers found**: $MARKERS_FOUND
- **Top marker**: $TOP_MARKER
- **Observation**: prompt-miner run completed with result $RESULT.
EOF
}

if [ -x "$APPEND" ]; then
  record | "$APPEND" "$LOG_FILE"
else
  echo "render-log-entry.sh: WARNING: missing $APPEND; appending without serialization" >&2
  record >> "$LOG_FILE"
fi

echo "render-log-entry.sh: appended $RESULT to $LOG_FILE" >&2
