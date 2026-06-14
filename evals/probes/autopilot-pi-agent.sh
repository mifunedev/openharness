#!/usr/bin/env bash
# tier: A
# source: issue #116 (autopilot Pi tmux alignment) 2026-06-14; issue #118 (attachable Pi TUI tmux) 2026-06-14; issue #126 (kept Pi overlap lock release) 2026-06-14; issue #142 (worktree-by-default, skip→worktree) 2026-06-14
# desc: autopilot's cron definition explicitly uses Pi AND worktree:true, cron-runtime honors per-cron agent overrides, Pi tmux runs use the attachable TUI invocation, terminal kept sessions release the overlap lock, and a worktree:true fire spawns an isolated worktree (SPAWNED_WORKTREE) instead of ever logging SKIPPED_OVERLAP.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON="$ROOT/crons/autopilot.md"
RUNTIME="$ROOT/scripts/cron-runtime.ts"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
TESTS="$ROOT/scripts/__tests__/cron-runtime.test.ts"
SHIPSPEC="$ROOT/.claude/skills/ship-spec/SKILL.md"

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
grep -Fq 'id: entry.id, agentBin, promptFile' "$RUNTIME" || missing+=("tmux wrapper receives per-cron agent")
grep -Fq 'agent: pi' "$TESTS" || missing+=("tests cover agent: pi parsing/scheduling")
grep -Fq 'else pi --continue; fi;' "$TESTS" || missing+=("tests cover kept Pi session resume")
grep -Fq 'pi "$(cat ${promptFile})";' "$RUNTIME" || missing+=("Pi tmux path uses positional TUI prompt, not headless -p")
grep -Fq 'renders as an effectively blank pane' "$RUNTIME" || missing+=("runtime documents the blank-pane failure mode")
# The overlap pidfile is now parameterized (worktree fires use a session-scoped path),
# but the wrapper still EXPORTS it from `pidFile` and still DEFAULTS to the id-scoped
# /tmp/cron-<id>.pid for the primary fire — assert both halves of that contract.
grep -Fq 'CRON_OVERLAP_PIDFILE=${pidFile}' "$RUNTIME" || missing+=("tmux wrapper exports CRON_OVERLAP_PIDFILE from the pidFile arg")
grep -Fq '/tmp/cron-${id}.pid' "$RUNTIME" || missing+=("wrapper defaults the overlap pidfile to the id-scoped /tmp/cron-<id>.pid")
# Worktree-by-default (issue #142): a fire is never silently skipped — worktree:true
# crons isolate (SPAWNED_WORKTREE) instead of logging SKIPPED_OVERLAP.
grep -Eq '^worktree:[[:space:]]*true[[:space:]]*$' "$CRON" || missing+=("crons/autopilot.md sets worktree: true")
grep -Fq 'worktree: fm.worktree === "true"' "$RUNTIME" || missing+=("parseCronFile reads the worktree frontmatter flag")
grep -Fq '"SPAWNED_WORKTREE"' "$RUNTIME" || missing+=("fireTmux logs SPAWNED_WORKTREE for an isolated worktree fire")
grep -Fq 'CRON_WORKTREE=' "$RUNTIME" || missing+=("worktree wrapper exports CRON_WORKTREE so the agent knows it is isolated")
# ship-spec must reuse $CRON_WORKTREE (build inline) instead of nesting/colliding a
# second worktree when autopilot runs it from inside the cron worktree (issue #142).
if [[ -f "$SHIPSPEC" ]]; then
  grep -Fq 'CRON_WORKTREE' "$SHIPSPEC" || missing+=("ship-spec Stage 10 builds inline in \$CRON_WORKTREE instead of nesting a second worktree")
fi
grep -Fq '[ -z "$OVERLAP_PIDFILE" ] && [ -n "$SESSION" ] && OVERLAP_PIDFILE="/tmp/cron-autopilot.pid"' "$SKILL" || missing+=("autopilot skill falls back before cron runtime restart")
grep -Fq 'release_overlap_lock()' "$SKILL" || missing+=("autopilot skill defines release_overlap_lock")
grep -Fq 'release_overlap_lock                         # terminal PR state reached' "$SKILL" || missing+=("terminal PR restore snippet releases overlap lock")
grep -Fq 'CRON_OVERLAP_PIDFILE=/tmp/cron-autopilot.pid' "$TESTS" || missing+=("tests cover overlap pidfile export")
grep -Fq 'runs kept Pi tmux sessions as attachable TUI sessions' "$TESTS" || missing+=("tests cover attachable Pi TUI tmux launch")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot Pi tmux alignment missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot cron sets agent: pi + worktree: true, launches attachable Pi TUI runs in an isolated worktree (SPAWNED_WORKTREE, never SKIPPED_OVERLAP), and terminal kept sessions release the overlap lock" >&2
exit 0
