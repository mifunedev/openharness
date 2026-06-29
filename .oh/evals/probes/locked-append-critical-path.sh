#!/usr/bin/env bash
# tier: A
# source: issue #204 (lock shared runtime log appends) 2026-06-15
# desc: critical autopilot/caps shared runtime log writes use .oh/scripts/locked-append.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HELPER="$ROOT/.oh/scripts/locked-append.sh"
CAPS="$ROOT/.oh/skills/autopilot/autopilot-caps.sh"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
PI_SKILL="$ROOT/.pi/skills/autopilot/SKILL.md"

missing=()
[[ -x "$HELPER" ]] || { echo "SKIPPED: missing executable $HELPER" >&2; exit 2; }
[[ -f "$CAPS" ]] || { echo "SKIPPED: missing $CAPS" >&2; exit 2; }
[[ -f "$SKILL" ]] || { echo "SKIPPED: missing $SKILL" >&2; exit 2; }
[[ -f "$PI_SKILL" ]] || { echo "SKIPPED: missing $PI_SKILL" >&2; exit 2; }

grep -Fq 'flock' "$HELPER" || missing+=("helper uses flock")
grep -Fq 'open-harness' "$HELPER" || grep -Fq 'openharness-locked-append' "$HELPER" || missing+=("helper uses an out-of-repo lock namespace")

grep -Fq 'append_runtime_log' "$CAPS" || missing+=("autopilot-caps has append_runtime_log wrapper")
grep -Fq 'locked-append.sh' "$CAPS" || missing+=("autopilot-caps calls locked append")
grep -Fq 'missing .oh/scripts/locked-append.sh; appending without serialization' "$CAPS" || missing+=("autopilot-caps documents helper-missing fallback")

grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/crons/.cron.log"' "$SKILL" || missing+=("autopilot liveness uses locked append")
grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/memory/$TODAY/log.md"' "$SKILL" || missing+=("autopilot memory log uses locked append")
grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/crons/.cron.log"' "$PI_SKILL" || missing+=("pi autopilot liveness uses locked append")
grep -Fq '.oh/scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/.oh/memory/$TODAY/log.md"' "$PI_SKILL" || missing+=("pi autopilot memory log uses locked append")

# The critical skill snippets must not regress to the old raw shared-root forms.
grep -Fq '>> "$AUTOPILOT_LOG_ROOT/.oh/crons/.cron.log"' "$SKILL" && missing+=("autopilot skill has no raw shared-root liveness append")
grep -Fq 'cat >> "$AUTOPILOT_LOG_ROOT/.oh/memory/$TODAY/log.md"' "$SKILL" && missing+=("autopilot skill has no raw shared-root memory append")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: locked append critical path contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: critical autopilot/caps shared runtime log writes use .oh/scripts/locked-append.sh" >&2
exit 0
