#!/usr/bin/env bash
# tier: A
# source: issue #564
# desc: guards the standalone lifecycle contract — cli.ts registers sandbox/shell/gateway + --from-remote, no stale #531 marker remains under .oh/cli/src/, and the compose base the CLI materialises into a sandbox binds the workspace at /home/sandbox/harness (the older /home/sandbox/project rewrite was intentionally removed)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI="$ROOT/.oh/cli/src/cli.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"
SRC="$ROOT/.oh/cli/src"

if [[ ! -f "$CLI" || ! -f "$LIFECYCLE" || ! -f "$COMPOSE" ]]; then
  echo "SKIPPED: standalone lifecycle not present (cli.ts, commands/lifecycle.ts, and/or .devcontainer/docker-compose.yml absent)" >&2
  exit 2
fi

fails=()

grep -q '=== "sandbox"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a sandbox dispatch branch")
grep -q '=== "shell"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a shell dispatch branch")
grep -q '=== "gateway"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a gateway dispatch branch")
grep -Fq -- '--from-remote' "$CLI" || fails+=(".oh/cli/src/cli.ts registers --from-remote")

stale_531=$(grep -rn '#531' "$SRC" | grep -v '#564' || true)
if [[ -n "$stale_531" ]]; then
  fails+=("no stale #531 marker under .oh/cli/src/ (found: ${stale_531})")
fi

grep -Fq ':/home/sandbox/harness' "$COMPOSE" || fails+=(".devcontainer/docker-compose.yml binds the workspace at /home/sandbox/harness")
if grep -Fq '/home/sandbox/project' "$COMPOSE"; then
  fails+=(".devcontainer/docker-compose.yml must NOT reintroduce the /home/sandbox/project rewrite")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: standalone lifecycle contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: standalone lifecycle contract — sandbox/shell/gateway + --from-remote registered in cli.ts, no stale #531 marker under .oh/cli/src/, the materialised compose base binds the workspace at /home/sandbox/harness (no /home/sandbox/project rewrite)" >&2
exit 0
