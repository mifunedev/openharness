#!/usr/bin/env bash
# tier: A
# source: issue #739 — Slack-requested Pi gateway compaction must acknowledge before nonce-bound proactive reconnect
# desc: Gateway-only exact Slack compact grammar uses ctx.compact and current-launch supervisor recovery without auto-discovery
# All single-quoted `$...` strings below are literal source-contract probes.
# shellcheck disable=SC2016
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXT="$ROOT/.pi/slack-compact/index.ts"
TEMPLATE_EXT="$ROOT/.oh/templates/full/.pi/slack-compact/index.ts"
GATEWAY="$ROOT/.oh/scripts/gateway.sh"
SUPERVISOR="$ROOT/.devcontainer/client-slack-supervise.sh"
SETTINGS="$ROOT/.pi/settings.json"
DOC="$ROOT/.oh/docs/integrations/slack.md"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}
need() {
  local file="$1" literal="$2" label="$3"
  grep -Fq -- "$literal" "$file" || fail "$label"
}

[ -f "$EXT" ] || fail "missing gateway-only Slack compact extension"
[ -f "$TEMPLATE_EXT" ] || fail "missing full-template Slack compact extension"
cmp -s "$EXT" "$TEMPLATE_EXT" || fail "root and full-template Slack compact extensions differ"

# Gateway-only placement: no auto-discovered copy and no settings load.
[ ! -e "$ROOT/.pi/extensions/slack-compact/index.ts" ] || fail "Slack compact extension entered Pi auto-discovery"
if grep -Fq 'slack-compact' "$SETTINGS"; then
  fail "Slack compact extension must not be globally loaded from settings"
fi
need "$GATEWAY" '.pi/slack-compact/index.ts' "gateway does not export compact extension path"
need "$GATEWAY" "export COMPACT_ENTRY=%q" "gateway does not pass compact extension as data"

# Parser/security boundary and documented Pi API.
need "$EXT" 'event.source !== "extension"' "local TUI/RPC source guard missing"
need "$EXT" 'via slack' "Slack bridge stamp guard missing"
need "$EXT" 'compact session|compact current session|compact the current session' "exact natural grammar missing"
need "$EXT" 'MAX_CUSTOM_INSTRUCTIONS = 500' "instruction bound missing"
need "$EXT" 'CONTROL_RE' "control-character rejection missing"
need "$EXT" 'ctx.compact({' "documented ctx.compact API missing"
need "$EXT" 'onComplete:' "completion callback missing"
need "$EXT" 'onError:' "error callback missing"
need "$EXT" 'if (!turn.text || turn.hasToolCall) return' "non-empty tool-free acknowledgement gate missing"

# Exact load order and proactive current-launch recovery contract.
pi_line=$(grep -E '^    pi --extension' "$SUPERVISOR" || true)
[ -n "$pi_line" ] || fail "supervisor Pi launch line missing"
case "$pi_line" in
  *'--extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --extension "$COMPACT_ENTRY" --approve'*) ;;
  *) fail "Pi extension load order is not bridge -> recovery -> compact" ;;
esac
need "$SUPERVISOR" 'od -An -N24 -tx1 /dev/urandom' "supervisor-owned unpredictable launch nonce missing"
need "$SUPERVISOR" 'tail -s 0.1 -Fn0 "$LOG"' "watcher must tail from EOF with a proactive polling interval"
need "$SUPERVISOR" 'current_marker="[openharness-slack-compact-complete:${SLACK_COMPACT_NONCE}]"' "watcher does not bind marker to current nonce"
need "$SUPERVISOR" 'date -u +%s >"$COMPACT_FILE"' "compaction recovery state missing"
need "$SUPERVISOR" 'printf '\''compact\n'\'' >"$RESTART_TRIGGER_FILE"' "successful compaction must force relaunch even after clean signal exit"
need "$SUPERVISOR" "pkill -f 'pi-messenger-bridge/dist/index.js'" "proactive Pi restart missing"
need "$SUPERVISOR" '[[ "$line" == *"ctx is stale"* ]]' "existing stale-ctx recovery missing"

# Operator contract: authorized current session, natural primary surface, and no
# false native Slack slash-command claim.
need "$DOC" '**already-authorized** Slack user' "authorization dependency undocumented"
need "$DOC" '**current dedicated `client-slack-pi` session**' "session scope undocumented"
need "$DOC" 'register or claim a native Slack `/compact` slash command' "native slash caveat missing"
need "$DOC" 'compaction reconnected' "status/reconnect troubleshooting missing"

# The manifest must not claim a native /compact command.
if grep -Fq '"command": "/compact"' "$ROOT/.pi/install/slack-manifest.json"; then
  fail "Slack manifest falsely registers native /compact"
fi

echo "PASS: Slack compact stays gateway-only, exact, acknowledgement-first, and nonce-reconnected" >&2
exit 0
