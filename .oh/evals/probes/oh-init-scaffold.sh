#!/usr/bin/env bash
# tier: A
# source: issue #531 Phase 2
# desc: guards the oh init scaffold contract — .oh/templates payload present, runInit exported, cli.ts init dispatch + help, devcontainer workspaceFolder pinned
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TEMPLATES="$ROOT/.oh/templates"
INIT_CMD="$ROOT/.oh/cli/src/commands/init.ts"
CLI="$ROOT/.oh/cli/src/cli.ts"
DEVCONTAINER="$TEMPLATES/.devcontainer/devcontainer.json"

# SKIPPED (exit 2): the feature is not present on this branch yet.
if [[ ! -d "$TEMPLATES" || ! -f "$INIT_CMD" ]]; then
  echo "SKIPPED: oh init scaffold not present (.oh/templates dir and/or .oh/cli/src/commands/init.ts absent)" >&2
  exit 2
fi

fails=()

[[ -f "$TEMPLATES/harness.yaml" ]] || fails+=(".oh/templates/harness.yaml exists")
[[ -f "$TEMPLATES/AGENTS.md" ]] || fails+=(".oh/templates/AGENTS.md exists")
[[ -f "$TEMPLATES/gitignore" ]] || fails+=(".oh/templates/gitignore exists")
[[ -f "$DEVCONTAINER" ]] || fails+=(".oh/templates/.devcontainer/devcontainer.json exists")

if [[ -f "$INIT_CMD" ]]; then
  grep -q 'runInit' "$INIT_CMD" || fails+=(".oh/cli/src/commands/init.ts exports runInit")
fi

if [[ -f "$CLI" ]]; then
  grep -q '=== "init"' "$CLI" || fails+=(".oh/cli/src/cli.ts has an init dispatch branch")
  grep -Fq 'oh init' "$CLI" || fails+=(".oh/cli/src/cli.ts lists oh init in help")
fi

if [[ -f "$DEVCONTAINER" ]]; then
  grep -Fq '/home/sandbox/project' "$DEVCONTAINER" || fails+=(".oh/templates/.devcontainer/devcontainer.json pins /home/sandbox/project workspaceFolder")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: oh init scaffold contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: oh init scaffold contract — .oh/templates payload present, runInit exported, cli.ts init dispatch + help, devcontainer workspaceFolder pinned" >&2
exit 0
