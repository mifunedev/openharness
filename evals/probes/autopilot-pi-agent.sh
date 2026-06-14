#!/usr/bin/env bash
# tier: A
# source: issue #116 (autopilot Pi tmux alignment) 2026-06-14
# desc: autopilot's cron definition explicitly uses Pi and cron-runtime honors per-cron agent overrides.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/autopilot.md"
RUNTIME="$ROOT/scripts/cron-runtime.ts"
TESTS="$ROOT/scripts/__tests__/cron-runtime.test.ts"

missing=()

[[ -f "$CRON" ]] || { echo "SKIPPED: missing $CRON" >&2; exit 2; }
[[ -f "$RUNTIME" ]] || { echo "SKIPPED: missing $RUNTIME" >&2; exit 2; }

# The autopilot prompt promises a Pi tmux Advisor session; make that executable,
# not just prose, with a per-cron agent override.
grep -Eq '^agent:[[:space:]]*pi[[:space:]]*$' "$CRON" || missing+=("crons/autopilot.md sets agent: pi")
grep -Fq 'agentBin?: string;' "$RUNTIME" || missing+=("CronEntry carries optional agentBin")
grep -Fq 'agentBin: fm.agent || undefined' "$RUNTIME" || missing+=("parseCronFile reads agent frontmatter")
grep -Fq 'const agentBin = entry.agentBin || AGENT_BIN;' "$RUNTIME" || missing+=("fire paths prefer per-cron agent over global default")
grep -Fq 'buildTmuxWrapper({ session, id: entry.id, agentBin, promptFile })' "$RUNTIME" || missing+=("tmux wrapper receives per-cron agent")
grep -Fq 'agent: pi' "$TESTS" || missing+=("tests cover agent: pi parsing/scheduling")
grep -Fq 'else pi --continue; fi;' "$TESTS" || missing+=("tests cover kept Pi session resume")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot Pi tmux alignment missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot cron sets agent: pi and cron-runtime honors per-cron agent overrides" >&2
exit 0
