#!/usr/bin/env bash
# tier: A
# source: issue #116 (autopilot Pi tmux alignment) 2026-06-14; issue #118 (attachable Pi TUI tmux) 2026-06-14; issue #126 (kept Pi overlap lock release) 2026-06-14
# desc: autopilot's cron definition explicitly uses Pi, cron-runtime honors per-cron agent overrides, Pi tmux runs use the attachable TUI invocation, and terminal kept sessions release the overlap lock.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/autopilot.md"
RUNTIME="$ROOT/scripts/cron-runtime.ts"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
TESTS="$ROOT/scripts/__tests__/cron-runtime.test.ts"

missing=()

[[ -f "$CRON" ]] || { echo "SKIPPED: missing $CRON" >&2; exit 2; }
[[ -f "$RUNTIME" ]] || { echo "SKIPPED: missing $RUNTIME" >&2; exit 2; }
[[ -f "$SKILL" ]] || { echo "SKIPPED: missing $SKILL" >&2; exit 2; }

# The autopilot prompt promises a Pi tmux Advisor session; make that executable,
# not just prose, with a per-cron agent override.
grep -Eq '^agent:[[:space:]]*pi[[:space:]]*$' "$CRON" || missing+=("crons/autopilot.md sets agent: pi")
grep -Fq 'agentBin?: string;' "$RUNTIME" || missing+=("CronEntry carries optional agentBin")
grep -Fq 'agentBin: fm.agent || undefined' "$RUNTIME" || missing+=("parseCronFile reads agent frontmatter")
grep -Fq 'const agentBin = entry.agentBin || AGENT_BIN;' "$RUNTIME" || missing+=("fire paths prefer per-cron agent over global default")
grep -Fq 'buildTmuxWrapper({ session, id: entry.id, agentBin, promptFile })' "$RUNTIME" || missing+=("tmux wrapper receives per-cron agent")
grep -Fq 'agent: pi' "$TESTS" || missing+=("tests cover agent: pi parsing/scheduling")
grep -Fq 'else pi --continue; fi;' "$TESTS" || missing+=("tests cover kept Pi session resume")
grep -Fq 'pi "$(cat ${promptFile})";' "$RUNTIME" || missing+=("Pi tmux path uses positional TUI prompt, not headless -p")
grep -Fq 'renders as an effectively blank pane' "$RUNTIME" || missing+=("runtime documents the blank-pane failure mode")
grep -Fq 'CRON_OVERLAP_PIDFILE=/tmp/cron-${id}.pid' "$RUNTIME" || missing+=("tmux wrapper exports CRON_OVERLAP_PIDFILE")
grep -Fq '[ -z "$OVERLAP_PIDFILE" ] && [ -n "$SESSION" ] && OVERLAP_PIDFILE="/tmp/cron-autopilot.pid"' "$SKILL" || missing+=("autopilot skill falls back before cron runtime restart")
grep -Fq 'release_overlap_lock()' "$SKILL" || missing+=("autopilot skill defines release_overlap_lock")
grep -Fq 'release_overlap_lock                         # terminal PR state reached' "$SKILL" || missing+=("terminal PR restore snippet releases overlap lock")
grep -Fq 'CRON_OVERLAP_PIDFILE=/tmp/cron-autopilot.pid' "$TESTS" || missing+=("tests cover overlap pidfile export")
grep -Fq 'runs kept Pi tmux sessions as attachable TUI sessions' "$TESTS" || missing+=("tests cover attachable Pi TUI tmux launch")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot Pi tmux alignment missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot cron sets agent: pi, launches attachable Pi TUI runs, and terminal kept sessions release the overlap lock" >&2
exit 0
