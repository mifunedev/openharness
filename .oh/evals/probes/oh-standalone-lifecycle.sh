#!/usr/bin/env bash
# tier: A
# source: issue #564
# desc: guards the standalone lifecycle contract — cli.ts registers sandbox/shell/gateway + --from-remote, no stale #531 marker remains under .oh/cli/src/, and rewriteComposeForTarget still maps consumer mounts to /home/sandbox/project
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI="$ROOT/.oh/cli/src/cli.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
INIT="$ROOT/.oh/cli/src/commands/init.ts"
SRC="$ROOT/.oh/cli/src"

# SKIPPED (exit 2): the standalone lifecycle is not present on this branch yet.
if [[ ! -f "$CLI" || ! -f "$LIFECYCLE" || ! -f "$INIT" ]]; then
  echo "SKIPPED: standalone lifecycle not present (cli.ts, commands/lifecycle.ts, and/or commands/init.ts absent)" >&2
  exit 2
fi

fails=()

# (a) cli.ts registers the three lifecycle verbs (actual dispatch literals) + --from-remote.
grep -q '=== "sandbox"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a sandbox dispatch branch")
grep -q '=== "shell"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a shell dispatch branch")
grep -q '=== "gateway"' "$CLI" || fails+=(".oh/cli/src/cli.ts has a gateway dispatch branch")
grep -Fq -- '--from-remote' "$CLI" || fails+=(".oh/cli/src/cli.ts registers --from-remote")

# (b) No stale #531 deferred-work marker remains under .oh/cli/src/.
# Broad grep; #564-retargeted bundling notes (lines that also name #564) are allowed.
# Guarded so a no-match grep (the desired state) cannot trip pipefail/set -e.
stale_531=$(grep -rn '#531' "$SRC" | grep -v '#564' || true)
if [[ -n "$stale_531" ]]; then
  fails+=("no stale #531 marker under .oh/cli/src/ (found: ${stale_531})")
fi

# (c) rewriteComposeForTarget still maps consumer compose mounts to the project path.
grep -q 'rewriteComposeForTarget' "$INIT" || fails+=(".oh/cli/src/commands/init.ts defines rewriteComposeForTarget")
grep -Fq '/home/sandbox/project' "$INIT" || fails+=(".oh/cli/src/commands/init.ts maps the consumer compose to /home/sandbox/project")

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: standalone lifecycle contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: standalone lifecycle contract — sandbox/shell/gateway + --from-remote registered in cli.ts, no stale #531 marker under .oh/cli/src/, rewriteComposeForTarget maps to /home/sandbox/project" >&2
exit 0
