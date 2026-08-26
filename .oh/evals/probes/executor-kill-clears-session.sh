#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-002) — OBSERVED 2026-08-23:
#         `firstmate.sh --kill <slug>` exited 1 with NO output, left the
#         agent-firstmate-<slug> tmux session running, left /tmp/firstmate-<slug>.lock
#         claimed, and appended no FIRSTMATE-INCOMPLETE line — because teardown aborted
#         on its FIRST branch under the caller's `set -euo pipefail`.
# desc: `--kill` actually kills. Exercised END TO END against a DECOY slug in an
#       isolated temp root — never against a live task — plus a direct behavioral test
#       of the exact abort: a best-effort herdr pane lookup that exits non-zero must not
#       kill its caller under `set -euo pipefail`.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIRSTMATE="$ROOT/.oh/scripts/firstmate.sh"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"
CONTRACT="$ROOT/.oh/scripts/lib/task-contract.sh"

for f in "$FIRSTMATE" "$RUNNER" "$CONTRACT"; do
  if [ ! -f "$f" ]; then
    echo "SKIPPED: required file absent: $f" >&2
    exit 2
  fi
done
if ! command -v git >/dev/null 2>&1; then
  echo "SKIPPED: git is required to build the isolated decoy root" >&2
  exit 2
fi

DECOY="firstmate-kill-probe"
WORK="$(mktemp -d)"
TMPD="$WORK/tmp"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$TMPD" "$WORK/repo/.oh/scripts/lib" "$WORK/repo/.oh/tasks/$DECOY" "$WORK/bin"
cp "$FIRSTMATE" "$WORK/repo/.oh/scripts/firstmate.sh"
cp "$RUNNER" "$CONTRACT" "$WORK/repo/.oh/scripts/lib/"
chmod +x "$WORK/repo/.oh/scripts/firstmate.sh"
git -C "$WORK/repo" init -q 2>/dev/null
printf '# progress\n' >"$WORK/repo/.oh/tasks/$DECOY/progress.txt"

missing=()

printf '#!/bin/sh\nexit 1\n' >"$WORK/bin/herdr"
printf '#!/bin/sh\nexit 1\n' >"$WORK/bin/jq"
chmod +x "$WORK/bin/herdr" "$WORK/bin/jq"
if ! PATH="$WORK/bin:$PATH" bash -c '
  set -euo pipefail
  # shellcheck disable=SC1090
  . "$1"
  pane="$(runner_resolve_pane_id kill-probe-slug)"
  [ -z "$pane" ] || exit 3
  echo survived
' _ "$RUNNER" >/dev/null 2>&1; then
  missing+=("runner_resolve_pane_id kills its caller when 'herdr agent get' exits non-zero — this is the exact defect that made --kill exit 1 silently")
fi

tmux_used=0
if command -v tmux >/dev/null 2>&1 && tmux -V >/dev/null 2>&1; then
  if tmux new-session -d -s "agent-firstmate-$DECOY" 'sleep 600' 2>/dev/null; then
    tmux_used=1
  fi
fi
mkdir -p "$TMPD/firstmate-$DECOY.lock"

kill_out="$(cd "$WORK/repo" && RUNNER_TMPDIR="$TMPD" bash .oh/scripts/firstmate.sh --kill "$DECOY" 2>&1)"
kill_rc=$?

[ "$kill_rc" -eq 0 ] \
  || missing+=("--kill exited $kill_rc (it exited 1 silently before the fix); output: ${kill_out:-<empty>}")
[ -n "$kill_out" ] \
  || missing+=("--kill printed nothing at all (the silent-failure signature)")
[ ! -e "$TMPD/firstmate-$DECOY.lock" ] \
  || missing+=("--kill left the launch lock claimed at \$RUNNER_TMPDIR/firstmate-$DECOY.lock")
grep -q '^FIRSTMATE-INCOMPLETE ' "$WORK/repo/.oh/tasks/$DECOY/progress.txt" \
  || missing+=("--kill appended no FIRSTMATE-INCOMPLETE line to the decoy progress.txt")

if [ "$tmux_used" -eq 1 ]; then
  if tmux has-session -t "agent-firstmate-$DECOY" 2>/dev/null; then
    missing+=("--kill left the tmux session agent-firstmate-$DECOY running")
    tmux kill-session -t "agent-firstmate-$DECOY" 2>/dev/null || true
  fi
else
  echo "note: tmux unavailable — the session-teardown assertion was not exercised" >&2
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: firstmate.sh --kill does not clear the session:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: --kill exits 0 with output, clears the lock, appends FIRSTMATE-INCOMPLETE, tears the session down, and a non-zero herdr pane lookup no longer aborts teardown" >&2
exit 0
