#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-12 (default Codex fallback for crons)
# desc: cron-runtime applies Claude-to-Codex fallback globally while respecting CRON_AGENT_BIN overrides
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME="$ROOT/scripts/cron-runtime.ts"

if [[ ! -f "$RUNTIME" ]]; then
  echo "SKIPPED: cron runtime absent: $RUNTIME" >&2
  exit 2
fi

missing=()
grep -q 'buildCronAgentCommand' "$RUNTIME" || missing+=("shared buildCronAgentCommand helper")
grep -q 'codex exec --sandbox danger-full-access' "$RUNTIME" || missing+=("Codex fallback command")
grep -q 'export RALPH_HARNESS=codex' "$RUNTIME" || missing+=("RALPH_HARNESS=codex export after fallback")
helper_calls="$(grep -c 'buildCronAgentCommand({[[:space:]]*$' "$RUNTIME" || true)"
if (( helper_calls < 2 )); then
  missing+=("tmux and non-tmux helper calls")
fi

if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: cron fallback guarantee missing: ${missing[*]}" >&2
  exit 1
fi

if ! awk '
  /if \(agentBin !== "claude"\)/ { custom=1 }
  custom && /codex exec/ { bad=1 }
  custom && /^  }$/ { exit }
  END { exit bad ? 1 : 0 }
' "$RUNTIME"; then
  echo "REGRESSION: explicit non-Claude CRON_AGENT_BIN path contains Codex fallback" >&2
  exit 1
fi

if grep -q 'autopilot.*codex exec\|codex exec.*autopilot' "$RUNTIME"; then
  echo "REGRESSION: cron Codex fallback appears scoped to autopilot instead of global helper" >&2
  exit 1
fi

echo "PASS: cron-runtime has global Claude-to-Codex fallback and preserves explicit CRON_AGENT_BIN overrides" >&2
exit 0
