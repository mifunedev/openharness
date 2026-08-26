#!/usr/bin/env bash
#            (autoConnect, showWidget, …) but PRESERVE the operator's runtime
set -u

seed="${1:-}"
dest="$HOME/.pi/msg-bridge.json"

umask 077
mkdir -p "$HOME/.pi" 2>/dev/null || true
chmod 700 "$HOME/.pi" 2>/dev/null || true

[ -n "$seed" ] && [ -f "$seed" ] || exit 0

if [ ! -f "$dest" ]; then
  cp "$seed" "$dest" && chmod 600 "$dest"
  exit 0
fi

command -v jq >/dev/null 2>&1 || exit 0

merged="$(mktemp)"
if jq -s '
      (.[0]) as $seed | (.[1]) as $run
      | $seed
      | .auth.trustedUsers =
          (if (($run.auth.trustedUsers // []) | length) > 0
           then $run.auth.trustedUsers
           else ($seed.auth.trustedUsers // []) end)
      | (if (($run.auth.channels // {}) | length) > 0
         then .auth.channels = $run.auth.channels
         else . end)
    ' "$seed" "$dest" >"$merged" 2>/dev/null && [ -s "$merged" ]; then
  cat "$merged" >"$dest" && chmod 600 "$dest"
fi
rm -f "$merged"
exit 0
