#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

cmd=${cmd//$'\n'/ }

if printf '%s' "$cmd" | grep -qE '(^|[^A-Za-z0-9._])/dev/(tcp|udp)/'; then
  echo "warn-devtcp: /dev/tcp or /dev/udp detected in command. Prefer 'ss', 'curl', or 'nc' for network connectivity checks instead." >&2
fi

exit 0
