#!/usr/bin/env bash
# PreToolUse Bash hook: warn when a command uses /dev/tcp or /dev/udp.
# Non-blocking — always exits 0. Prints one warning to stderr on match.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# Collapse newlines to spaces so the pattern search works line-independently.
cmd=${cmd//$'\n'/ }

# Match the literal path /dev/tcp/ or /dev/udp/ only.
# Word-boundary anchors prevent false matches on paths like
# .devcontainer, path/dev/x, or the word "develop".
if printf '%s' "$cmd" | grep -qE '(^|[^A-Za-z0-9._])/dev/(tcp|udp)/'; then
  echo "warn-devtcp: /dev/tcp or /dev/udp detected in command. Prefer 'ss', 'curl', or 'nc' for network connectivity checks instead." >&2
fi

exit 0
