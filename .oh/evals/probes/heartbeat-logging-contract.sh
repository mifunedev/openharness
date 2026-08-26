#!/usr/bin/env bash
# tier: A
# source: issue #447 (heartbeat log append hardening) 2026-06-18
# desc: heartbeat prompt uses a locked liveness append and writes no deleted-tier log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HEARTBEAT="$ROOT/.oh/crons/heartbeat.md"
HELPER="$ROOT/.oh/scripts/locked-append.sh"

missing=()
[[ -f "$HEARTBEAT" ]] || { echo "SKIPPED: missing $HEARTBEAT" >&2; exit 2; }
[[ -x "$HELPER" ]] || { echo "SKIPPED: missing executable $HELPER" >&2; exit 2; }

grep -Fq 'scripts/locked-append.sh .oh/crons/.cron.log' "$HEARTBEAT" || missing+=("heartbeat liveness line uses scripts/locked-append.sh")
grep -Fq 'Mandatory closing step' "$HEARTBEAT" || missing+=("heartbeat marks the liveness append mandatory")
grep -Fq 'STATUS="<status>"' "$HEARTBEAT" || missing+=("heartbeat computes a STATUS token for the liveness line")

grep -Fq '>> .oh/crons/.cron.log' "$HEARTBEAT" && missing+=("heartbeat must not append liveness with raw >>")

grep -Fq '.oh/memory' "$HEARTBEAT" && missing+=("heartbeat references the deleted .oh/memory tier")
grep -Fq 'Memory log contract' "$HEARTBEAT" && missing+=("heartbeat reintroduced the memory log contract")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: heartbeat logging contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: heartbeat prompt uses a locked mandatory liveness append and writes no deleted-tier log" >&2
exit 0
