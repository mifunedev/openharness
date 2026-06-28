#!/usr/bin/env bash
# Seed (or reboot-merge) the pi-messenger-bridge runtime config into ~/.pi.
#
# The bridge reads ~/.pi/msg-bridge.json and REWRITES it at runtime: the
# operator's challenge-auth grants land in auth.trustedUsers / auth.channels.
# The tracked repo seed (.pi/msg-bridge.json) ships those grant containers EMPTY
# so personal Slack user/channel IDs never enter git.
#
# Behavior:
#   First boot (no runtime file): install the tracked seed verbatim.
#   Reboot   (runtime file present): keep the tracked seed's non-grant structure
#            (autoConnect, showWidget, …) but PRESERVE the operator's runtime
#            grants (auth.trustedUsers, auth.channels) so a container restart
#            never silently wipes who/what they already trusted. The previous
#            entrypoint unconditionally copied the empty seed over the runtime
#            file, wiping grants on every restart (bug #289).
#
# Safety:
#   - Never writes back to the tracked seed (the git-tracked file is read-only
#     input here).
#   - On any jq failure (missing jq, malformed runtime JSON) it leaves the
#     existing runtime file untouched — grants are preserved by default, never
#     clobbered.
#
# Usage: seed-msg-bridge.sh <tracked-seed-path>
#   (destination is always $HOME/.pi/msg-bridge.json, the package's hard-coded path)
set -u

seed="${1:-}"
dest="$HOME/.pi/msg-bridge.json"

umask 077
mkdir -p "$HOME/.pi" 2>/dev/null || true
chmod 700 "$HOME/.pi" 2>/dev/null || true

# No tracked seed → nothing to install.
[ -n "$seed" ] && [ -f "$seed" ] || exit 0

# First boot: install the tracked seed verbatim.
if [ ! -f "$dest" ]; then
  cp "$seed" "$dest" && chmod 600 "$dest"
  exit 0
fi

# Reboot: merge. Without jq we cannot safely merge → leave the runtime file as-is
# (preserving grants) rather than risk clobbering it.
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
