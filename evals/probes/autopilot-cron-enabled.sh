#!/usr/bin/env bash
# tier: A
# source: issue #487 (autopilot cron source enabled) 2026-06-21
# desc: the committed autopilot cron remains enabled and keeps its hourly Pi/worktree/preflight safeguards so a cron runtime restart preserves the documented self-improvement loop.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/autopilot.md"
README="$ROOT/crons/README.md"

if [[ ! -f "$CRON" ]]; then
  echo "SKIPPED: missing autopilot cron: $CRON" >&2
  exit 2
fi
if [[ ! -f "$README" ]]; then
  echo "SKIPPED: missing crons README: $README" >&2
  exit 2
fi

missing=()
grep -Eq '^enabled:[[:space:]]*true[[:space:]]*$' "$CRON" || missing+=("crons/autopilot.md enabled: true")
grep -Eq '^schedule:[[:space:]]*"5 \* \* \* \*"[[:space:]]*$' "$CRON" || missing+=("hourly minute-5 schedule")
grep -Eq '^tmux:[[:space:]]*true[[:space:]]*$' "$CRON" || missing+=("tmux: true")
grep -Eq '^worktree:[[:space:]]*true[[:space:]]*$' "$CRON" || missing+=("worktree: true")
grep -Eq '^agent:[[:space:]]*pi[[:space:]]*$' "$CRON" || missing+=("agent: pi")
grep -Eq '^preflight:[[:space:]]*scripts/autopilot-caps\.sh[[:space:]]*$' "$CRON" || missing+=("preflight: scripts/autopilot-caps.sh")
grep -Eq '^repo:[[:space:]]*mifunedev/openharness[[:space:]]*$' "$CRON" || missing+=("repo: mifunedev/openharness")
grep -Fq 'Hourly autopilot' "$CRON" || missing+=("cron description documents hourly autopilot")
grep -Fq 'autopilot' "$README" || missing+=("crons README documents autopilot")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot cron source contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: committed autopilot cron is enabled with hourly Pi/worktree/preflight safeguards" >&2
exit 0
