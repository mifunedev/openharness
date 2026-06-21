#!/usr/bin/env bash
# render-log-entry.sh — append the mandatory prompt-miner memory-log entry.
#
# Mirrors the autopilot/caps logging shape: it resolves the shared harness root
# (git rev-parse --show-toplevel) and appends a single Memory-Improvement-Protocol
# record to memory/<UTC-date>/log.md through the repo-root scripts/locked-append.sh
# helper so the whole multi-line record is serialized under flock. Diagnostics go
# to stderr; the helper never edits memory/MEMORY.md or context/IDENTITY.md.
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

# Resolve the shared harness root. Under a worktree this still resolves to the
# current toplevel; the cron path may export AUTOPILOT_LOG_ROOT to redirect the
# write to the shared root checkout (matching the autopilot convention).
ROOT="${AUTOPILOT_LOG_ROOT:-$(git rev-parse --show-toplevel)}"
LOG_DIR="$ROOT/memory/$DAY"
LOG_FILE="$LOG_DIR/log.md"
APPEND="$ROOT/scripts/locked-append.sh"
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
