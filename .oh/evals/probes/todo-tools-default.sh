#!/usr/bin/env bash
# tier: A
# desc: Claude Code 2.1.233+ drops the todo/task tools on current models unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1; the sandbox sets it so every agent session gets the todo list by default
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$PROBE_DIR" && git rev-parse --show-toplevel 2>/dev/null)" \
  || ROOT="$(cd "$PROBE_DIR/../../.." && pwd)"

COMPOSE_FILES=(
  "$ROOT/.devcontainer/docker-compose.yml"
  "$ROOT/.devcontainer/docker-compose.image-only.yml"
)

present=0
fail=()

for f in "${COMPOSE_FILES[@]}"; do
  [[ -f "$f" ]] || continue
  present=$(( present + 1 ))
  grep -Eq 'CLAUDE_CODE_ENABLE_TODO_TOOLS[=:][[:space:]]*1' "$f" \
    || fail+=("${f#"$ROOT"/} does not set CLAUDE_CODE_ENABLE_TODO_TOOLS=1")
done

if (( present == 0 )); then
  echo "SKIPPED: no .devcontainer compose file on this branch" >&2
  exit 2
fi

if (( ${#fail[@]} )); then
  printf 'REGRESSION: the sandbox no longer enables the todo/task tools by default:\n' >&2
  printf '  - %s\n' "${fail[@]}" >&2
  exit 1
fi

echo "PASS: every sandbox compose file sets CLAUDE_CODE_ENABLE_TODO_TOOLS=1 ($present checked)" >&2
exit 0
