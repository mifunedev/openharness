#!/usr/bin/env bash
# tier: A
# source: issue #447 (heartbeat log append hardening) 2026-06-18
# desc: heartbeat prompt uses structured memory logs and locked liveness appends
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HEARTBEAT="$ROOT/crons/heartbeat.md"
HELPER="$ROOT/.oh/scripts/locked-append.sh"

missing=()
[[ -f "$HEARTBEAT" ]] || { echo "SKIPPED: missing $HEARTBEAT" >&2; exit 2; }
[[ -x "$HELPER" ]] || { echo "SKIPPED: missing executable $HELPER" >&2; exit 2; }

grep -Fq 'Memory log contract' "$HEARTBEAT" || missing+=("heartbeat defines an explicit memory log contract")
grep -Fq 'HEARTBEAT_TIME=$(date -u +%H:%M)' "$HEARTBEAT" || missing+=("heartbeat computes HEARTBEAT_TIME before writing memory log")
grep -Fq 'scripts/locked-append.sh "memory/$TODAY/log.md"' "$HEARTBEAT" || missing+=("heartbeat memory log uses scripts/locked-append.sh")
grep -Fq -- '- **Result**:' "$HEARTBEAT" || missing+=("heartbeat memory template includes Result field")
grep -Fq -- '- **Action**:' "$HEARTBEAT" || missing+=("heartbeat memory template includes Action field")
grep -Fq -- '- **Observation**:' "$HEARTBEAT" || missing+=("heartbeat memory template includes Observation field")
grep -Fq 'scripts/locked-append.sh crons/.cron.log' "$HEARTBEAT" || missing+=("heartbeat liveness line uses scripts/locked-append.sh")

# Regression guard for the old race-prone shared log append.
grep -Fq '>> crons/.cron.log' "$HEARTBEAT" && missing+=("heartbeat must not append liveness with raw >>")

# Regression guard for the observed malformed memory heading. The liveness shell
# command may legitimately contain $(date -Iseconds); the memory heading must not.
grep -Fq '## Heartbeat -- $(date' "$HEARTBEAT" && missing+=("heartbeat memory heading must not contain literal date command")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: heartbeat logging contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: heartbeat prompt uses structured memory logs and locked liveness appends" >&2
exit 0
