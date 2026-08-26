#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-06-10 (zsh /dev/tcp)
# desc: warn-devtcp hook fires on /dev/tcp and not on .devcontainer
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOOK="$ROOT/.claude/hooks/warn-devtcp.sh"

if [[ ! -x "$HOOK" ]]; then
  echo "SKIPPED: hook file absent or not executable: $HOOK" >&2
  exit 2
fi


DEVTCP_TOKEN="/dev/tcp/"
TMPDIR_PROBE=$(mktemp -d /tmp/devtcp-probe-XXXXXX)
trap 'rm -rf "$TMPDIR_PROBE"' EXIT

FIXTURE_A="$TMPDIR_PROBE/fixture-a.json"
printf '{"tool_input":{"command":"bash -c '\''exec 3<>%s10.0.0.1/80'\''"}}\n' \
  "$DEVTCP_TOKEN" > "$FIXTURE_A"

FIXTURE_B="$TMPDIR_PROBE/fixture-b.json"
printf '{"tool_input":{"command":"ls .devcontainer/"}}\n' > "$FIXTURE_B"

stderr_a=$(bash "$HOOK" < "$FIXTURE_A" 2>&1 >/dev/null) || {
  echo "REGRESSION: hook exited non-zero for /dev/tcp command (must be non-blocking)" >&2
  exit 1
}
if [[ "$stderr_a" != *"warn-devtcp"* ]]; then
  echo "REGRESSION: hook did not emit a warning for /dev/tcp command" >&2
  echo "  stderr was: $stderr_a" >&2
  exit 1
fi

stderr_b=$(bash "$HOOK" < "$FIXTURE_B" 2>&1 >/dev/null) || {
  echo "REGRESSION: hook exited non-zero for benign .devcontainer command" >&2
  exit 1
}
if [[ "$stderr_b" == *"warn-devtcp"* ]]; then
  echo "REGRESSION: hook falsely warned on .devcontainer command (false positive)" >&2
  echo "  stderr was: $stderr_b" >&2
  exit 1
fi

echo "PASS: warn-devtcp hook fires on /dev/tcp and is silent on .devcontainer" >&2
exit 0
