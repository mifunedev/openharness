#!/usr/bin/env bash
# tier: A
# source: issue #564
# desc: guards the standalone lifecycle contract — cli.ts registers sandbox/shell/gateway + --from-remote, no stale #531 marker remains under .oh/cli/src/, and init.ts scaffolds the consumer devcontainer workspace at /home/sandbox/harness (compose copied verbatim; the older /home/sandbox/project rewrite was intentionally removed)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI="$ROOT/.oh/cli/src/cli.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
INIT="$ROOT/.oh/cli/src/commands/init.ts"
SRC="$ROOT/.oh/cli/src"

if [[ ! -f "$CLI" || ! -f "$LIFECYCLE" || ! -f "$INIT" ]]; then
  echo "SKIPPED: standalone lifecycle not present (cli.ts, commands/lifecycle.ts, and/or commands/init.ts absent)" >&2
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

grep -Fq '/home/sandbox/harness' "$INIT" || fails+=(".oh/cli/src/commands/init.ts scaffolds the consumer workspace at /home/sandbox/harness")
if grep -Fq '/home/sandbox/project' "$INIT"; then
  fails+=(".oh/cli/src/commands/init.ts must NOT reintroduce the /home/sandbox/project rewrite")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: standalone lifecycle contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: standalone lifecycle contract — sandbox/shell/gateway + --from-remote registered in cli.ts, no stale #531 marker under .oh/cli/src/, init.ts scaffolds the consumer workspace at /home/sandbox/harness (no /home/sandbox/project rewrite)" >&2
exit 0
