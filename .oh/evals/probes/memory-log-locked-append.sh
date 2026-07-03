#!/usr/bin/env bash
# tier: A
# source: issue #476 — memory log writes in skill contracts must use .oh/scripts/locked-append.sh
# desc: /context-audit and /health-check route Memory Protocol appends through the locked append helper
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
files=(
  ".claude/skills/context-audit/SKILL.md"
  ".pi/skills/context-audit/SKILL.md"
  ".claude/skills/health-check/SKILL.md"
  ".pi/skills/health-check/SKILL.md"
)

for rel in "${files[@]}"; do
  path="$ROOT/$rel"
  [ -f "$path" ] || { echo "SKIPPED: missing skill file: $rel" >&2; exit 2; }
done

bad=""
for rel in "${files[@]}"; do
  path="$ROOT/$rel"
  hits="$(grep -nE 'cat[[:space:]]*>>.*.oh/memory/\$TODAY/log\.md|cat[[:space:]]*>>.*.oh/memory/.*log\.md' "$path" || true)"
  if [ -n "$hits" ]; then
    bad+=$'\n'"$rel:"$'\n'"$hits"
  fi
done

if [ -n "$bad" ]; then
  echo "REGRESSION: direct memory log append remains in skill contract(s):$bad" >&2
  exit 1
fi

for rel in ".claude/skills/context-audit/SKILL.md" ".pi/skills/context-audit/SKILL.md"; do
  grep -qF '.oh/scripts/locked-append.sh "$HARNESS/.oh/memory/$TODAY/log.md" <<EOF' "$ROOT/$rel" || {
    echo "REGRESSION: $rel lacks locked context-audit memory append" >&2
    exit 1
  }
done
for rel in ".claude/skills/health-check/SKILL.md" ".pi/skills/health-check/SKILL.md"; do
  grep -qF '.oh/scripts/locked-append.sh "$MEM/$TODAY/log.md" <<EOF' "$ROOT/$rel" || {
    echo "REGRESSION: $rel lacks locked health-check memory append" >&2
    exit 1
  }
done

cmp -s "$ROOT/.claude/skills/context-audit/SKILL.md" "$ROOT/.pi/skills/context-audit/SKILL.md" || {
  echo "REGRESSION: context-audit skill mirrors differ" >&2
  exit 1
}
cmp -s "$ROOT/.claude/skills/health-check/SKILL.md" "$ROOT/.pi/skills/health-check/SKILL.md" || {
  echo "REGRESSION: health-check skill mirrors differ" >&2
  exit 1
}

echo "PASS: memory log skill appends use .oh/scripts/locked-append.sh" >&2
exit 0
