#!/usr/bin/env bash
set -euo pipefail
# tier: A
# source: .oh/memory/MEMORY.md 2026-06-07 (agent-browser 0.8.5 CLI)
# desc: Guard /agent-browser skill docs against stale execute/relative-screenshot guidance.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="$ROOT/.claude/skills/agent-browser/SKILL.md"

if [ ! -f "$SKILL" ]; then
  echo "SKIPPED agent-browser skill missing" >&2
  exit 2
fi

text="$(cat "$SKILL")"

if ! grep -q 'agent-browser eval' <<<"$text"; then
  echo "REGRESSION agent-browser skill must use agent-browser eval for JS execution" >&2
  exit 1
fi

if grep -q 'agent-browser execute' <<<"$text"; then
  echo "REGRESSION agent-browser skill still references stale agent-browser execute" >&2
  exit 1
fi

if ! grep -q 'absolute output path' <<<"$text"; then
  echo "REGRESSION agent-browser skill must require an absolute output path" >&2
  exit 1
fi

if ! grep -q 'SCREENSHOT_PATH="$PWD/.claude/screenshots/${FILENAME}.png"' <<<"$text"; then
  echo "REGRESSION agent-browser skill must build screenshot path from PWD" >&2
  exit 1
fi

if ! grep -q '<absolute-path>' <<<"$text"; then
  echo "REGRESSION agent-browser skill must show custom screenshot absolute-path placeholder" >&2
  exit 1
fi

if grep -q -- '--full-page' <<<"$text"; then
  echo "REGRESSION agent-browser skill references unsupported --full-page flag" >&2
  exit 1
fi

echo "PASS agent-browser skill documents eval and absolute screenshot paths" >&2
exit 0
