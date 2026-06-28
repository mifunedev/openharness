#!/usr/bin/env bash
# tier: A
# source: issues #130/#453 (cron runtime watchdog + legacy system-cron reaping) 2026-06-19
# desc: devcontainer entrypoint starts a cron-watchdog tmux supervisor that restarts cron-system and reaps stale legacy system-cron sessions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"
TESTS="$ROOT/.oh/scripts/__tests__/entrypoint.test.ts"

missing=()

[[ -f "$ENTRYPOINT" ]] || { echo "SKIPPED: missing $ENTRYPOINT" >&2; exit 2; }
[[ -f "$TESTS" ]] || { echo "SKIPPED: missing $TESTS" >&2; exit 2; }

grep -Fq 'cron-watchdog' "$ENTRYPOINT" || missing+=("entrypoint names cron-watchdog")
grep -Fq 'tmux new-session -d -s cron-watchdog' "$ENTRYPOINT" || missing+=("entrypoint starts cron-watchdog tmux session")
grep -Fq 'cron-system missing; starting cron-runtime.ts' "$ENTRYPOINT" || missing+=("watchdog logs missing cron-system restart")
grep -Fq 'tmux new-session -d -s cron-system' "$ENTRYPOINT" || missing+=("watchdog restarts cron-system tmux session")
grep -Fq 'node --experimental-strip-types .oh/scripts/cron-runtime.ts' "$ENTRYPOINT" || missing+=("watchdog launches cron-runtime.ts")
grep -Fq '/tmp/cron-system.log' "$ENTRYPOINT" || missing+=("cron-system log path retained")
grep -Fq '/tmp/cron-watchdog.log' "$ENTRYPOINT" || missing+=("watchdog log path present")
grep -Fq 'tmux has-session -t system-cron' "$ENTRYPOINT" || missing+=("legacy system-cron detection retained")
grep -Fq 'legacy system-cron tmux session detected — stopping it before starting cron-watchdog' "$ENTRYPOINT" || missing+=("entrypoint reaps stale legacy session before watchdog startup")
grep -Fq 'legacy system-cron detected; stopping it before supervising cron-system' "$ENTRYPOINT" || missing+=("watchdog reaps legacy session if it reappears")
! grep -Fq 'not starting cron-system or cron-watchdog' "$ENTRYPOINT" || missing+=("legacy guard must not block both sessions")
! grep -Fq 'legacy system-cron detected; watchdog exiting' "$ENTRYPOINT" || missing+=("watchdog must not exit if legacy session appears")

grep -Fq 'devcontainer entrypoint cron supervision' "$TESTS" || missing+=("vitest covers cron supervision")
grep -Fq 'reaps stale legacy system-cron instead of blocking modern cron supervision' "$TESTS" || missing+=("vitest covers legacy reaping")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: cron watchdog contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: entrypoint starts cron-watchdog and reaps stale legacy system-cron sessions" >&2
exit 0
