#!/usr/bin/env bash
# tier: A
# source: memory/MEMORY.md 2026-06-10 (docker stats vs ps Size)
# desc: /health-check retains the docker stats in-container-reclaim step
set -euo pipefail

# Resolve repo root from this script's location, never cwd: /eval runs probes
# from an arbitrary working directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/health-check/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: skill file not found at $SKILL" >&2
  exit 2
fi

if grep -qF 'docker stats' "$SKILL"; then
  echo "PASS: 'docker stats' step present in $SKILL" >&2
  exit 0
else
  echo "REGRESSION: 'docker stats' step missing from $SKILL" >&2
  exit 1
fi
