#!/usr/bin/env bash
# tier: A
# source: issue #209 (autopilot no-PR tmux session closure) 2026-06-16
# desc: autopilot no-PR terminal paths must explicitly close their cron Pi tmux session after logs, while PR-producing paths keep sessions via $KEEP.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 0
fi

missing=()

grep -Fq 'close_no_pr_session()' "$SKILL" || missing+=("close_no_pr_session helper")
grep -Fq '[ -n "${SESSION:-}" ] || return 0' "$SKILL" || missing+=("helper no-ops without SESSION")
grep -Fq '[ -n "${KEEP:-}" ] && [ -f "$KEEP" ] && return 0' "$SKILL" || missing+=("helper preserves kept PR sessions")
grep -Fq 'release_overlap_lock' "$SKILL" || missing+=("helper releases overlap pidfile")
grep -Fq 'tmux kill-session -t "$SESSION"' "$SKILL" || missing+=("helper kills current tmux session")
grep -Fq 'cap skips, duplicate/NOTHING-NEW, no-survivor research, critic HALT before PR, FAIL, and BLOCKED-OWNED-WIP' "$SKILL" || missing+=("session lifecycle lists no-PR close paths")
grep -Fq 'close_no_pr_session, exit 0; do not touch keep-marker' "$SKILL" || missing+=("duplicate/no-op path calls helper")
grep -Fq 'then `close_no_pr_session` and exit 0' "$SKILL" || missing+=("no-survivor or halt path calls helper")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot no-PR session close contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot no-PR terminal paths explicitly close unkept Pi tmux sessions after logging" >&2
